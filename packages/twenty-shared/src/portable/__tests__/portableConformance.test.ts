// Differential conformance for the portable `context.db` engines: MemoryDb is
// the oracle; LocalStoreDb over MemoryRowStore is the exact code path the
// browser Dexie runtime uses (overlay, batch flush, rollback). Any divergence
// between them is a real bug.

import { LocalStoreDb, MemoryRowStore } from '../localStoreDb';
import { MemoryDb } from '../memoryDb';
import {
  type PortableRecord,
  type PortableTransactionalDatabase,
} from '../portableContext';

const SEED: Record<string, PortableRecord[]> = {
  grantOpportunity: [
    {
      id: 'opp-1',
      name: 'Salmon habitat grant',
      opportunityUrl: 'https://grants.example/salmon',
      fitScore: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'opp-2',
      name: 'Quantum computing prize',
      opportunityUrl: 'https://grants.example/quantum',
      fitScore: 5,
      createdAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'opp-3',
      name: 'Wetland restoration fund',
      opportunityUrl: 'https://grants.example/wetland',
      fitScore: 4,
      createdAt: '2026-03-01T00:00:00.000Z',
    },
  ],
};

const makeEngines = (): {
  label: string;
  db: PortableTransactionalDatabase;
}[] => {
  let memoryCounter = 0;
  let localCounter = 0;
  return [
    {
      label: 'MemoryDb',
      db: new MemoryDb({
        seed: SEED,
        mintRecordId: (table) => `${table}-minted-${++memoryCounter}`,
      }),
    },
    {
      label: 'LocalStoreDb',
      db: new LocalStoreDb(new MemoryRowStore(SEED), {
        mintRecordId: (table) => `${table}-minted-${++localCounter}`,
      }),
    },
  ];
};

// Run the same scenario on every engine and assert identical outputs.
const onAllEngines = async <TResult>(
  scenario: (db: PortableTransactionalDatabase) => Promise<TResult>,
): Promise<TResult> => {
  const engines = makeEngines();
  const results = await Promise.all(engines.map(({ db }) => scenario(db)));
  for (let index = 1; index < results.length; index++) {
    expect(results[index]).toEqual(results[0]);
  }
  return results[0];
};

describe('portable engine conformance', () => {
  it('should return identical rows for get and collect on every engine', async () => {
    const result = await onAllEngines(async (db) => ({
      byId: await db.get('grantOpportunity', 'opp-2'),
      all: await db.query('grantOpportunity').collect(),
      missing: await db.get('grantOpportunity', 'nope'),
    }));
    expect(result.byId?.name).toBe('Quantum computing prize');
    expect(result.all).toHaveLength(3);
    expect(result.missing).toBeNull();
  });

  it('should order by createdAt then id, ascending and descending', async () => {
    const result = await onAllEngines(async (db) => ({
      asc: (await db.query('grantOpportunity').order('asc').collect()).map(
        (row) => row.id,
      ),
      desc: (await db.query('grantOpportunity').order('desc').collect()).map(
        (row) => row.id,
      ),
    }));
    expect(result.asc).toEqual(['opp-1', 'opp-2', 'opp-3']);
    expect(result.desc).toEqual(['opp-3', 'opp-2', 'opp-1']);
  });

  it('should apply withIndex eq/range constraints and predicate filters identically', async () => {
    const result = await onAllEngines(async (db) => ({
      byUrl: (
        await db
          .query('grantOpportunity')
          .withIndex('by_opportunityUrl', (builder) =>
            builder.eq('opportunityUrl', 'https://grants.example/wetland'),
          )
          .collect()
      ).map((row) => row.id),
      highFit: (
        await db
          .query('grantOpportunity')
          .withIndex('by_fitScore', (builder) => builder.gte('fitScore', 4))
          .filter((row) => String(row.name).includes('fund'))
          .collect()
      ).map((row) => row.id),
    }));
    expect(result.byUrl).toEqual(['opp-3']);
    expect(result.highFit).toEqual(['opp-3']);
  });

  it('should paginate with take/first/unique/paginate identically', async () => {
    const result = await onAllEngines(async (db) => {
      const firstPage = await db
        .query('grantOpportunity')
        .paginate({ numItems: 2, cursor: null });
      const secondPage = await db
        .query('grantOpportunity')
        .paginate({ numItems: 2, cursor: firstPage.continueCursor });
      return {
        take: (await db.query('grantOpportunity').take(2)).map((row) => row.id),
        first: (await db.query('grantOpportunity').first())?.id,
        firstPageIds: firstPage.page.map((row) => row.id),
        firstPageDone: firstPage.isDone,
        secondPageIds: secondPage.page.map((row) => row.id),
        secondPageDone: secondPage.isDone,
      };
    });
    expect(result.firstPageIds).toEqual(['opp-1', 'opp-2']);
    expect(result.firstPageDone).toBe(false);
    expect(result.secondPageIds).toEqual(['opp-3']);
    expect(result.secondPageDone).toBe(true);
  });

  it('should apply insert/patch/replace/delete inside a transaction identically', async () => {
    const result = await onAllEngines(async (db) => {
      const insertedId = await db.transaction(async () => {
        const id = await db.insert('grantOpportunity', {
          name: 'Inserted grant',
          createdAt: '2026-04-01T00:00:00.000Z',
        });
        await db.patch('grantOpportunity', 'opp-1', { fitScore: 1 });
        await db.replace('grantOpportunity', 'opp-2', {
          name: 'Replaced grant',
          createdAt: '2026-02-01T00:00:00.000Z',
        });
        await db.delete('grantOpportunity', 'opp-3');
        return id;
      });
      return {
        insertedId,
        rows: await db.query('grantOpportunity').collect(),
      };
    });
    expect(result.insertedId).toBe('grantOpportunity-minted-1');
    expect(result.rows.map((row) => row.id)).toEqual([
      'opp-1',
      'opp-2',
      'grantOpportunity-minted-1',
    ]);
    const replaced = result.rows.find((row) => row.id === 'opp-2');
    expect(replaced?.name).toBe('Replaced grant');
    expect(replaced?.opportunityUrl).toBeUndefined();
  });

  it('should provide read-your-writes inside a transaction on every engine', async () => {
    const result = await onAllEngines(async (db) =>
      db.transaction(async () => {
        await db.insert('grantOpportunity', {
          id: 'opp-new',
          name: 'Visible before commit',
          createdAt: '2026-05-01T00:00:00.000Z',
        });
        await db.patch('grantOpportunity', 'opp-new', { fitScore: 2 });
        return (await db.query('grantOpportunity').collect()).map(
          (row) => row.id,
        );
      }),
    );
    expect(result).toContain('opp-new');
  });

  it('should roll back every write when the transaction body throws', async () => {
    await onAllEngines(async (db) => {
      await expect(
        db.transaction(async () => {
          await db.insert('grantOpportunity', {
            id: 'doomed',
            name: 'Never persisted',
            createdAt: '2026-06-01T00:00:00.000Z',
          });
          await db.delete('grantOpportunity', 'opp-1');
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      return db.query('grantOpportunity').collect();
    }).then((rows) => {
      expect(rows.map((row) => row.id)).toEqual(['opp-1', 'opp-2', 'opp-3']);
    });
  });

  it('should serialize concurrent transactions so neither loses writes', async () => {
    const engines = makeEngines();
    for (const { db } of engines) {
      await Promise.all([
        db.transaction(async () => {
          await db.insert('grantOpportunity', {
            id: 'concurrent-a',
            name: 'A',
            createdAt: '2026-07-01T00:00:00.000Z',
          });
        }),
        db.transaction(async () => {
          await db.insert('grantOpportunity', {
            id: 'concurrent-b',
            name: 'B',
            createdAt: '2026-07-02T00:00:00.000Z',
          });
        }),
      ]);
      const ids = (await db.query('grantOpportunity').collect()).map(
        (row) => row.id,
      );
      expect(ids).toEqual(
        expect.arrayContaining(['concurrent-a', 'concurrent-b']),
      );
    }
  });
});
