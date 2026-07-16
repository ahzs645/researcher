import { type Table } from 'dexie';
import {
  LocalStoreDb,
  makePortableCapabilities,
  PortableRuntime,
  type PortablePrincipal,
  type PortableRecord,
  type PortableRowStore,
  type PortableRowStoreOperation,
} from 'twenty-shared/portable';
import { PORTABLE_FUNCTIONS } from 'twenty-shared/portable-functions';

import { type DexieDataSource } from '@/local-db/data-source/createDexieDataSource';

// The browser-local half of the portable-functions architecture (ported from
// societyer): the SAME handlers the Convex backend delegates to run here
// against the Dexie tables, so domain logic works offline without a
// hand-written mirror.
//
// `commitBatch` applies every buffered write of a portable mutation in ONE
// Dexie 'rw' transaction — a thrown handler never commits partially.

export const createDexiePortableRowStore = (
  dataSource: DexieDataSource,
): PortableRowStore => {
  const tableFor = (
    tableName: string,
  ): Table<PortableRecord, string> | null => {
    try {
      return dataSource.db.table(tableName) as Table<PortableRecord, string>;
    } catch {
      // Unknown table: the object is not part of this workspace's bundle.
      return null;
    }
  };

  return {
    rows: async (tableName) => {
      const table = tableFor(tableName);
      return table ? await table.toArray() : [];
    },
    commitBatch: async (operations: PortableRowStoreOperation[]) => {
      const touchedTables = [
        ...new Set(operations.map((operation) => operation.table)),
      ].map((tableName) => {
        const table = tableFor(tableName);
        if (!table) {
          throw new Error(
            `commitBatch: unknown table ${tableName} in this workspace bundle`,
          );
        }
        return table;
      });
      await dataSource.db.transaction('rw', touchedTables, async () => {
        for (const operation of operations) {
          const table = tableFor(operation.table);
          if (!table) {
            continue;
          }
          if (operation.kind === 'delete') {
            await table.delete(operation.recordId);
          } else {
            await table.put(operation.row);
          }
        }
      });
    },
  };
};

const BROWSER_LOCAL_PRINCIPAL: PortablePrincipal = {
  kind: 'user',
  runtime: 'browser-local',
  // The local workspace trusts its own device user — same stance as the
  // societyer local runtimes.
  assurance: 'trusted-workspace',
  subject: 'local-workspace-user',
};

export type LocalPortableRuntimeOptions = {
  dataSource: DexieDataSource;
  principal?: PortablePrincipal;
};

// Build the runtime with every registered portable function and the browser's
// capability set (plain HTTP via fetch; email/storage/llm decline loudly with
// structured CAPABILITY_UNAVAILABLE errors instead of silently no-oping).
export const createLocalPortableRuntime = ({
  dataSource,
  principal = BROWSER_LOCAL_PRINCIPAL,
}: LocalPortableRuntimeOptions): PortableRuntime => {
  const db = new LocalStoreDb(createDexiePortableRowStore(dataSource));
  const capabilities = makePortableCapabilities(
    {
      http: {
        fetchJson: async ({ url, method = 'GET', headers, body }) => {
          const response = await fetch(url, { method, headers, body });
          return { status: response.status, json: await response.json() };
        },
      },
    },
    () => 'Not available in the browser-local workspace.',
  );

  return new PortableRuntime({
    db,
    capabilities,
    principalProvider: () => principal,
  }).registerAll(PORTABLE_FUNCTIONS);
};
