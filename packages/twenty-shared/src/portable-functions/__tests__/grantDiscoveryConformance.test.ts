// Differential conformance for the portable grant-discovery handlers: the
// registry runs through a PortableRuntime on MemoryDb (oracle) and on
// LocalStoreDb over MemoryRowStore (the browser code path), and every engine
// must produce identical results AND identical stored rows. This is the same
// harness societyer uses to guarantee its Convex handlers and offline runtime
// never drift.

import { LocalStoreDb, MemoryRowStore } from '../../portable/localStoreDb';
import { MemoryDb } from '../../portable/memoryDb';
import { makePortableCapabilities } from '../../portable/portableCapabilities';
import {
  type PortableRecord,
  type PortableTransactionalDatabase,
} from '../../portable/portableContext';
import { PortableRuntime } from '../../portable/portableRuntime';
import {
  type GrantOpportunityCandidate,
  type UpsertOpportunitiesResult,
} from '../grantDiscovery';
import { type TeamProfile } from '../opportunityMatching';
import { PORTABLE_FUNCTIONS } from '../registry';

const FIXED_NOW = '2026-07-15T12:00:00.000Z';

const SEED: Record<string, PortableRecord[]> = {
  researchTeam: [
    {
      id: 'team-1',
      name: 'Freshwater Lab',
      focusAreas: ['salmon habitat', 'water quality'],
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'team-2',
      name: 'No focus team',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ],
  grant: [
    {
      id: 'grant-1',
      name: 'Existing NSERC grant',
      funder: 'NSERC',
      createdAt: '2026-01-03T00:00:00.000Z',
    },
  ],
  grantOpportunity: [
    {
      id: 'opp-existing',
      name: 'Old salmon call',
      opportunityUrl: 'https://grants.example/salmon-call',
      fitScore: 1,
      confidence: 'LOW',
      status: 'NEW',
      createdAt: '2026-01-04T00:00:00.000Z',
    },
  ],
};

const CANDIDATES: GrantOpportunityCandidate[] = [
  {
    title: 'Salmon habitat restoration call',
    funder: 'NSERC',
    program: 'Salmon habitat',
    opportunityUrl: 'https://grants.example/salmon-call',
    topicTags: ['salmon habitat'],
    eligibility: 'Canadian universities',
  },
  {
    title: 'Quantum materials challenge',
    funder: 'Unknown Foundation',
    program: 'Quantum materials',
    opportunityUrl: 'https://grants.example/quantum',
    topicTags: ['quantum'],
  },
];

const makeRuntimes = (): {
  label: string;
  runtime: PortableRuntime;
  dump: () => Promise<PortableRecord[]>;
}[] => {
  let memoryCounter = 0;
  let localCounter = 0;
  const memoryDb = new MemoryDb({
    seed: SEED,
    mintRecordId: (table) => `${table}-minted-${++memoryCounter}`,
  });
  const localDb = new LocalStoreDb(new MemoryRowStore(SEED), {
    mintRecordId: (table) => `${table}-minted-${++localCounter}`,
  });
  const capabilities = makePortableCapabilities({});
  const build = (db: PortableTransactionalDatabase): PortableRuntime =>
    new PortableRuntime({ db, capabilities }).registerAll(PORTABLE_FUNCTIONS);
  return [
    {
      label: 'MemoryDb',
      runtime: build(memoryDb),
      dump: () => memoryDb.query('grantOpportunity').collect(),
    },
    {
      label: 'LocalStoreDb',
      runtime: build(localDb),
      dump: () => localDb.query('grantOpportunity').collect(),
    },
  ];
};

describe('grantDiscovery portable conformance', () => {
  it('should derive the same team profile on every engine', async () => {
    const profiles = await Promise.all(
      makeRuntimes().map(({ runtime }) =>
        runtime.runQuery<TeamProfile>('grantDiscovery:teamProfile'),
      ),
    );
    expect(profiles[1]).toEqual(profiles[0]);
    expect(profiles[0]).toEqual({
      interests: ['salmon habitat', 'water quality'],
      knownFunders: ['NSERC'],
    });
  });

  it('should upsert identically: same counts, same stored rows, same scoring', async () => {
    const runs = makeRuntimes();
    const results: UpsertOpportunitiesResult[] = [];
    const dumps: PortableRecord[][] = [];
    for (const { runtime, dump } of runs) {
      const profile = await runtime.runQuery<TeamProfile>(
        'grantDiscovery:teamProfile',
      );
      results.push(
        await runtime.runMutation<UpsertOpportunitiesResult>(
          'grantDiscovery:upsertOpportunities',
          { profile, candidates: CANDIDATES, now: FIXED_NOW },
        ),
      );
      dumps.push(await dump());
    }

    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual({ inserted: 1, updated: 1 });
    expect(dumps[1]).toEqual(dumps[0]);

    const updated = dumps[0].find((row) => row.id === 'opp-existing');
    // The existing record was updated in place (deduped by URL), rescored, and
    // kept its durable id + createdAt.
    expect(updated?.name).toBe('Salmon habitat restoration call');
    expect(updated?.fitScore).toBe(3);
    expect(updated?.confidence).toBe('MEDIUM');
    expect(updated?.createdAt).toBe('2026-01-04T00:00:00.000Z');
    expect(updated?.updatedAt).toBe(FIXED_NOW);

    const inserted = dumps[0].find(
      (row) => row.opportunityUrl === 'https://grants.example/quantum',
    );
    expect(inserted?.id).toBe('grantOpportunity-minted-1');
    expect(inserted?.fitScore).toBe(1);
    expect(inserted?.confidence).toBe('LOW');
    expect(inserted?.createdAt).toBe(FIXED_NOW);
    expect(inserted?.status).toBe('NEW');
  });

  it('should be idempotent: a second identical run only updates', async () => {
    for (const { runtime } of makeRuntimes()) {
      const profile = await runtime.runQuery<TeamProfile>(
        'grantDiscovery:teamProfile',
      );
      await runtime.runMutation('grantDiscovery:upsertOpportunities', {
        profile,
        candidates: CANDIDATES,
        now: FIXED_NOW,
      });
      const second = await runtime.runMutation<UpsertOpportunitiesResult>(
        'grantDiscovery:upsertOpportunities',
        { profile, candidates: CANDIDATES, now: FIXED_NOW },
      );
      expect(second).toEqual({ inserted: 0, updated: 2 });
    }
  });

  it('should preserve a precomputed server score while retaining portable upsert behavior', async () => {
    for (const { runtime, dump } of makeRuntimes()) {
      const profile = await runtime.runQuery<TeamProfile>(
        'grantDiscovery:teamProfile',
      );
      await runtime.runMutation('grantDiscovery:upsertOpportunities', {
        profile,
        candidates: [
          {
            ...CANDIDATES[1],
            fitScore: 4.6,
            matchedInterests: ['semantic materials match'],
            topicTags: undefined,
          },
        ],
        now: FIXED_NOW,
      });

      const inserted = (await dump()).find(
        (row) => row.opportunityUrl === 'https://grants.example/quantum',
      );
      expect(inserted?.fitScore).toBe(5);
      expect(inserted?.confidence).toBe('HIGH');
      expect(inserted?.topicTags).toEqual(['semantic materials match']);
    }
  });

  it('should reject unregistered functions with a loud error', async () => {
    const [{ runtime }] = makeRuntimes();
    await expect(runtime.runQuery('nope:missing')).rejects.toThrow(
      'Portable function not registered locally: nope:missing',
    );
  });
});
