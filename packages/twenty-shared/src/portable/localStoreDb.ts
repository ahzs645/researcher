// LOCAL-STORE ADAPTER for the portable `context.db` contract.
//
// Implements PortableDatabaseWriter over a minimal row-store surface
// (`PortableRowStore`) that the browser Dexie tables satisfy with a thin
// wrapper. This is the browser-local (and future Electron-local) `context.db`
// — one engine, multiple hosts.
//
// Two things this adds over a raw row store:
//   1. Real query semantics (index eq/range constraints, predicate filters,
//      ordering, cursor pagination) via the SAME evaluator the MemoryDb oracle
//      uses, so the local engine interprets the contract identically.
//   2. ATOMIC transactions with read-your-writes: writes buffer in an overlay
//      and flush in one batch (`commitBatch`); a throw discards the overlay so
//      nothing partially commits.
//
// Depends on nothing heavy (no Dexie, no Convex), so the Jest harness runs it
// directly. The real Dexie store plugs in by satisfying `PortableRowStore`.

import { v4 as uuidv4 } from 'uuid';

import { createPortableQueryBuilder } from './memoryDb';
import {
  type PortableQuery,
  type PortableRecord,
  type PortableTransactionalDatabase,
} from './portableContext';

// Atomic write operation flushed by `commitBatch`.
export type PortableRowStoreOperation =
  | { kind: 'upsert'; table: string; row: PortableRecord }
  | { kind: 'delete'; table: string; recordId: string };

// The minimal surface the adapter needs from a row store. Reads may be async
// (researcher's Dexie tables are); `commitBatch` must apply all operations
// atomically (a single backing transaction) or reject without partial writes.
export type PortableRowStore = {
  rows: (table: string) => PortableRecord[] | Promise<PortableRecord[]>;
  commitBatch: (
    operations: PortableRowStoreOperation[],
  ) => void | Promise<void>;
};

type TransactionOverlay = Map<string, Map<string, PortableRecord | null>>;

const clone = <TValue>(value: TValue): TValue =>
  JSON.parse(JSON.stringify(value)) as TValue;

export type LocalStoreDbOptions = {
  // Id minter for inserts. Inject for deterministic tests.
  mintRecordId?: (table: string) => string;
};

export class LocalStoreDb implements PortableTransactionalDatabase {
  private readonly store: PortableRowStore;
  private readonly mintRecordId: (table: string) => string;
  private overlay: TransactionOverlay | null = null;
  // Tail of the transaction queue — see transaction() below.
  private transactionQueue: Promise<unknown> = Promise.resolve();

  constructor(store: PortableRowStore, options: LocalStoreDbOptions = {}) {
    this.store = store;
    this.mintRecordId = options.mintRecordId ?? (() => uuidv4());
  }

  // Overlay-merged view of a table (read-your-writes inside a transaction).
  private async currentRows(table: string): Promise<PortableRecord[]> {
    const base = await this.store.rows(table);
    const overlayForTable = this.overlay?.get(table);
    if (!overlayForTable || overlayForTable.size === 0) {
      return base;
    }
    const byId = new Map<string, PortableRecord>();
    for (const row of base) {
      byId.set(row.id, row);
    }
    for (const [recordId, record] of overlayForTable) {
      if (record === null) {
        byId.delete(recordId);
      } else {
        byId.set(recordId, record);
      }
    }
    return [...byId.values()];
  }

  async get<TRecord extends PortableRecord = PortableRecord>(
    table: string,
    recordId: string,
  ): Promise<TRecord | null> {
    const overlayForTable = this.overlay?.get(table);
    if (overlayForTable?.has(recordId)) {
      const record = overlayForTable.get(recordId);
      return record ? (clone(record) as TRecord) : null;
    }
    const rows = await this.store.rows(table);
    const row = rows.find((candidate) => candidate.id === recordId);
    return row ? (clone(row) as TRecord) : null;
  }

  query<TRecord extends PortableRecord = PortableRecord>(
    table: string,
  ): PortableQuery<TRecord> {
    return createPortableQueryBuilder<TRecord>(
      async () => (await this.currentRows(table)) as TRecord[],
    );
  }

  private requireOverlay(): TransactionOverlay {
    if (!this.overlay) {
      throw new Error('Mutations must run inside db.transaction()');
    }
    return this.overlay;
  }

  private overlayFor(table: string): Map<string, PortableRecord | null> {
    const overlay = this.requireOverlay();
    let map = overlay.get(table);
    if (!map) {
      map = new Map();
      overlay.set(table, map);
    }
    return map;
  }

  async insert(
    table: string,
    record: Record<string, unknown>,
  ): Promise<string> {
    const id =
      typeof record.id === 'string' && record.id
        ? record.id
        : this.mintRecordId(table);
    this.overlayFor(table).set(id, clone({ ...record, id }));
    return id;
  }

  async patch(
    table: string,
    recordId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.get(table, recordId);
    if (!existing) {
      throw new Error(`patch: record ${table}/${recordId} not found`);
    }
    this.overlayFor(table).set(
      recordId,
      clone({ ...existing, ...patch, id: recordId }),
    );
  }

  async replace(
    table: string,
    recordId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.get(table, recordId);
    if (!existing) {
      throw new Error(`replace: record ${table}/${recordId} not found`);
    }
    this.overlayFor(table).set(recordId, clone({ ...record, id: recordId }));
  }

  async delete(table: string, recordId: string): Promise<void> {
    this.overlayFor(table).set(recordId, null);
  }

  // Atomic transaction. Writes accumulate in an overlay; on success they flush
  // as one batch; on throw the overlay is discarded — nothing partially
  // commits.
  //
  // Transactions are SERIALIZED through a queue: two concurrent independent
  // mutations never share an overlay (each would otherwise commit, roll back,
  // or silently drop the other's writes). Genuinely nested calls
  // (context.runMutation inside a handler) do not come through here — the
  // PortableRuntime runs them directly inside the current transaction.
  async transaction<TResult>(body: () => Promise<TResult>): Promise<TResult> {
    const run = async (): Promise<TResult> => {
      this.overlay = new Map();
      try {
        const result = await body();
        const operations = this.drainOverlay();
        await this.store.commitBatch(operations);
        return result;
      } finally {
        this.overlay = null;
      }
    };
    const result = this.transactionQueue.then(run, run);
    // Keep the queue alive regardless of this transaction's outcome.
    this.transactionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private drainOverlay(): PortableRowStoreOperation[] {
    const operations: PortableRowStoreOperation[] = [];
    for (const [table, overlayForTable] of this.overlay ?? []) {
      for (const [recordId, record] of overlayForTable) {
        if (record === null) {
          operations.push({ kind: 'delete', table, recordId });
        } else {
          operations.push({ kind: 'upsert', table, row: record });
        }
      }
    }
    return operations;
  }
}

// Reference `PortableRowStore` for tests — plain in-memory maps with an atomic
// `commitBatch`. Lets the Jest harness exercise the LocalStoreDb code path
// (overlay, batch flush, rollback) without Dexie/IndexedDB.
export class MemoryRowStore implements PortableRowStore {
  private tables = new Map<string, Map<string, PortableRecord>>();

  constructor(seed: Record<string, PortableRecord[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      const map = new Map<string, PortableRecord>();
      for (const row of rows) {
        map.set(row.id, clone(row));
      }
      this.tables.set(table, map);
    }
  }

  rows(table: string): PortableRecord[] {
    return [...(this.tables.get(table)?.values() ?? [])].map(clone);
  }

  commitBatch(operations: PortableRowStoreOperation[]): void {
    for (const operation of operations) {
      if (operation.kind === 'delete') {
        this.tables.get(operation.table)?.delete(operation.recordId);
      } else {
        let map = this.tables.get(operation.table);
        if (!map) {
          map = new Map();
          this.tables.set(operation.table, map);
        }
        map.set(operation.row.id, clone(operation.row));
      }
    }
  }
}
