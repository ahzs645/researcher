// In-memory reference implementation of the portable `context.db` contract.
//
// Two jobs:
//   1. The ORACLE in differential tests — the simplest possible correct engine,
//      so any divergence between it and the Dexie/Convex adapters is a bug.
//   2. A zero-dependency engine the Jest harness runs without Convex or
//      IndexedDB.
//
// Transactions are genuinely atomic: a snapshot is taken on entry and restored
// if the body throws — the contract every adapter must honor.

import { v4 as uuidv4 } from 'uuid';

import {
  type PortableDatabaseWriter,
  type PortableIndexRangeBuilder,
  type PortablePaginationOptions,
  type PortablePaginationResult,
  type PortableQuery,
  type PortableRecord,
} from './portableContext';

export type PortableIndexConstraint = {
  operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte';
  field: string;
  value: unknown;
};

export const collectIndexConstraints = (
  range?: (builder: PortableIndexRangeBuilder) => PortableIndexRangeBuilder,
): PortableIndexConstraint[] => {
  if (!range) {
    return [];
  }
  const constraints: PortableIndexConstraint[] = [];
  const push = (
    operator: PortableIndexConstraint['operator'],
  ): ((field: string, value: unknown) => PortableIndexRangeBuilder) => {
    return (field, value) => {
      constraints.push({ operator, field, value });
      return builder;
    };
  };
  const builder: PortableIndexRangeBuilder = {
    eq: push('eq'),
    gt: push('gt'),
    gte: push('gte'),
    lt: push('lt'),
    lte: push('lte'),
  };
  range(builder);
  return constraints;
};

const compareValues = (left: unknown, right: unknown): number => {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right));
};

export const matchesIndexConstraints = (
  record: PortableRecord,
  constraints: PortableIndexConstraint[],
): boolean => {
  for (const constraint of constraints) {
    const value = record[constraint.field];
    if (constraint.operator === 'eq' && value !== constraint.value) {
      return false;
    }
    if (
      constraint.operator === 'gt' &&
      !(compareValues(value, constraint.value) > 0)
    ) {
      return false;
    }
    if (
      constraint.operator === 'gte' &&
      !(compareValues(value, constraint.value) >= 0)
    ) {
      return false;
    }
    if (
      constraint.operator === 'lt' &&
      !(compareValues(value, constraint.value) < 0)
    ) {
      return false;
    }
    if (
      constraint.operator === 'lte' &&
      !(compareValues(value, constraint.value) <= 0)
    ) {
      return false;
    }
  }
  return true;
};

// Deterministic default order shared by every local engine: `createdAt` (ISO
// string) then `id`. Convex's native `.order()` sorts by `_creationTime`; see
// the fidelity boundary in portableContext.ts.
const compareRecordOrder = (
  left: PortableRecord,
  right: PortableRecord,
): number => {
  const leftCreatedAt =
    typeof left.createdAt === 'string' ? left.createdAt : '';
  const rightCreatedAt =
    typeof right.createdAt === 'string' ? right.createdAt : '';
  return (
    leftCreatedAt.localeCompare(rightCreatedAt) ||
    left.id.localeCompare(right.id)
  );
};

// Shared query evaluator used by both MemoryDb and the row-store adapter, so
// every local engine interprets the contract identically.
export const evaluatePortableQuery = <TRecord extends PortableRecord>(
  rows: TRecord[],
  constraints: PortableIndexConstraint[],
  predicates: ((record: TRecord) => boolean)[],
  direction: 'asc' | 'desc',
): TRecord[] => {
  let out = rows.filter((record) =>
    matchesIndexConstraints(record, constraints),
  );
  for (const predicate of predicates) {
    out = out.filter(predicate);
  }
  out = out
    .slice()
    .sort((left, right) =>
      direction === 'desc'
        ? -compareRecordOrder(left, right)
        : compareRecordOrder(left, right),
    );
  return out;
};

const clone = <TValue>(value: TValue): TValue =>
  JSON.parse(JSON.stringify(value)) as TValue;

class PortableQueryBuilder<TRecord extends PortableRecord>
  implements PortableQuery<TRecord>
{
  private readonly source: () => TRecord[] | Promise<TRecord[]>;
  private constraints: PortableIndexConstraint[] = [];
  private predicates: ((record: TRecord) => boolean)[] = [];
  private direction: 'asc' | 'desc' = 'asc';

  constructor(source: () => TRecord[] | Promise<TRecord[]>) {
    this.source = source;
  }

  withIndex(
    _indexName: string,
    range?: (builder: PortableIndexRangeBuilder) => PortableIndexRangeBuilder,
  ): PortableQuery<TRecord> {
    this.constraints.push(...collectIndexConstraints(range));
    return this;
  }

  filter(predicate: (record: TRecord) => boolean): PortableQuery<TRecord> {
    this.predicates.push(predicate);
    return this;
  }

  order(direction: 'asc' | 'desc'): PortableQuery<TRecord> {
    this.direction = direction;
    return this;
  }

  private async run(): Promise<TRecord[]> {
    const rows = await this.source();
    return evaluatePortableQuery(
      rows,
      this.constraints,
      this.predicates,
      this.direction,
    );
  }

  async collect(): Promise<TRecord[]> {
    return (await this.run()).map(clone);
  }

  async take(count: number): Promise<TRecord[]> {
    return (await this.run()).slice(0, count).map(clone);
  }

  async first(): Promise<TRecord | null> {
    const rows = await this.run();
    return rows[0] ? clone(rows[0]) : null;
  }

  async unique(): Promise<TRecord | null> {
    const rows = await this.run();
    if (rows.length > 1) {
      throw new Error('unique() found more than one matching record');
    }
    return rows[0] ? clone(rows[0]) : null;
  }

  async paginate(
    options: PortablePaginationOptions,
  ): Promise<PortablePaginationResult<TRecord>> {
    const rows = await this.run();
    const start = options.cursor ? Number(options.cursor) : 0;
    const page = rows.slice(start, start + options.numItems).map(clone);
    const nextStart = start + options.numItems;
    const isDone = nextStart >= rows.length;
    return { page, isDone, continueCursor: isDone ? '' : String(nextStart) };
  }
}

// Exported so adapters outside this module (e.g. the Dexie row store) can
// reuse the exact same builder semantics.
export const createPortableQueryBuilder = <TRecord extends PortableRecord>(
  source: () => TRecord[] | Promise<TRecord[]>,
): PortableQuery<TRecord> => new PortableQueryBuilder<TRecord>(source);

export type MemoryDbOptions = {
  seed?: Record<string, PortableRecord[]>;
  // Id minter for inserts. Inject for deterministic tests.
  mintRecordId?: (table: string) => string;
};

export class MemoryDb implements PortableDatabaseWriter {
  private tables = new Map<string, Map<string, PortableRecord>>();
  private readonly mintRecordId: (table: string) => string;

  constructor(options: MemoryDbOptions = {}) {
    this.mintRecordId = options.mintRecordId ?? (() => uuidv4());
    for (const [table, rows] of Object.entries(options.seed ?? {})) {
      for (const row of rows) {
        this.tableMap(table).set(row.id, clone(row));
      }
    }
  }

  private tableMap(table: string): Map<string, PortableRecord> {
    let map = this.tables.get(table);
    if (!map) {
      map = new Map();
      this.tables.set(table, map);
    }
    return map;
  }

  async get<TRecord extends PortableRecord = PortableRecord>(
    table: string,
    recordId: string,
  ): Promise<TRecord | null> {
    const record = this.tables.get(table)?.get(recordId);
    return record ? (clone(record) as TRecord) : null;
  }

  query<TRecord extends PortableRecord = PortableRecord>(
    table: string,
  ): PortableQuery<TRecord> {
    return createPortableQueryBuilder<TRecord>(
      () => [...(this.tables.get(table)?.values() ?? [])] as TRecord[],
    );
  }

  async insert(
    table: string,
    record: Record<string, unknown>,
  ): Promise<string> {
    const id =
      typeof record.id === 'string' && record.id
        ? record.id
        : this.mintRecordId(table);
    this.tableMap(table).set(id, clone({ ...record, id }));
    return id;
  }

  async patch(
    table: string,
    recordId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const existing = this.tables.get(table)?.get(recordId);
    if (!existing) {
      throw new Error(`patch: record ${table}/${recordId} not found`);
    }
    this.tableMap(table).set(
      recordId,
      clone({ ...existing, ...patch, id: recordId }),
    );
  }

  async replace(
    table: string,
    recordId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    if (!this.tables.get(table)?.has(recordId)) {
      throw new Error(`replace: record ${table}/${recordId} not found`);
    }
    this.tableMap(table).set(recordId, clone({ ...record, id: recordId }));
  }

  async delete(table: string, recordId: string): Promise<void> {
    this.tables.get(table)?.delete(recordId);
  }

  // Snapshot/restore transaction — atomic: the body's writes roll back on throw.
  async transaction<TResult>(body: () => Promise<TResult>): Promise<TResult> {
    const snapshot = this.snapshot();
    try {
      return await body();
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  private snapshot(): string {
    const dump: Record<string, PortableRecord[]> = {};
    for (const [table, map] of this.tables) {
      dump[table] = [...map.values()].map(clone);
    }
    return JSON.stringify(dump);
  }

  private restore(snapshot: string): void {
    this.tables = new Map();
    const dump = JSON.parse(snapshot) as Record<string, PortableRecord[]>;
    for (const [table, rows] of Object.entries(dump)) {
      for (const row of rows) {
        this.tableMap(table).set(row.id, row);
      }
    }
  }

  // Test/debug helper: full table contents.
  dump(table: string): PortableRecord[] {
    return [...(this.tables.get(table)?.values() ?? [])].map(clone);
  }
}
