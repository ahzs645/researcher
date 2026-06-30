import {
  buildDataSourceBundle,
  type DataSourceBundle,
  type DataSourceRecord,
} from 'twenty-shared/data-source';

import { createDexieDataSource } from '@/local-db/data-source/createDexieDataSource';
import {
  augmentObjectMetadataWithResearch,
  getResearchSeedRecords,
  getResearchStarterRecords,
} from '@/local-db/research/bridgeResearchAugmentation';
import { getResearchSeedMode } from '@/local-db/twenty-local/getResearchSeedMode';

import { mockedCompanyRecords } from '~/testing/mock-data/generated/data/companies/mock-companies-data';
import { mockedNoteRecords } from '~/testing/mock-data/generated/data/notes/mock-notes-data';
import { mockedPersonRecords } from '~/testing/mock-data/generated/data/people/mock-people-data';
import { mockedTaskRecords } from '~/testing/mock-data/generated/data/tasks/mock-tasks-data';
import { mockedWorkspaceMemberRecords } from '~/testing/mock-data/generated/data/workspaceMembers/mock-workspaceMembers-data';
import { mockedStandardObjectMetadataQueryResult } from '~/testing/mock-data/generated/metadata/objects/mock-objects-metadata';

// Shared, lazily-initialized bridge bundle + Dexie DataSource. Module-scoped
// so every provider / hook in bridge mode talks to the same Dexie database
// (otherwise we'd open multiple connections and races).

let cachedBundle: DataSourceBundle | undefined;
let cachedDataSource: ReturnType<typeof createDexieDataSource> | undefined;
let seedPromise: Promise<void> | undefined;

export const getBridgeDataSourceBundle = (): DataSourceBundle => {
  if (cachedBundle === undefined) {
    cachedBundle = buildDataSourceBundle(
      augmentObjectMetadataWithResearch(
        mockedStandardObjectMetadataQueryResult as never,
      ) as never,
    );
  }
  return cachedBundle;
};

// Normalize a generated mocked record (which uses Twenty's GraphQL-shaped
// fields like `__typename`, nested connection edges, etc.) into a flat
// DataSource record. Adapters never see GraphQL shapes — resolvers do the
// wrapping. Strip `__typename` and connection-shaped fields so we don't
// surface them through the executable schema unintentionally.
const toDataSourceRecord = (
  record: Record<string, unknown>,
): DataSourceRecord => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === '__typename') continue;
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      '__typename' in value &&
      typeof (value as { __typename?: unknown }).__typename === 'string' &&
      ((value as { __typename: string }).__typename as string).endsWith(
        'Connection',
      )
    ) {
      // Drop connection-shaped relation fields; the resolver will re-derive
      // them from joins.
      continue;
    }
    normalized[key] = value;
  }
  if (typeof normalized.id !== 'string') {
    throw new Error('Seed record missing string id');
  }
  return normalized as DataSourceRecord;
};

const buildSeed = (): Record<string, DataSourceRecord[]> => ({
  company: mockedCompanyRecords.map(toDataSourceRecord),
  person: mockedPersonRecords.map(toDataSourceRecord),
  note: mockedNoteRecords.map(toDataSourceRecord),
  task: mockedTaskRecords.map(toDataSourceRecord),
  workspaceMember: mockedWorkspaceMemberRecords.map(toDataSourceRecord),
  // Research objects are authored as flat DataSource records already, so they
  // bypass the GraphQL-shape normalizer above.
  ...(getResearchSeedRecords() as Record<string, DataSourceRecord[]>),
});

// The starter scaffolding seeded into a blank workspace too (journal templates),
// so a fresh workspace can format a paper without first hand-building a template.
const buildStarterSeed = (): Record<string, DataSourceRecord[]> =>
  getResearchStarterRecords() as Record<string, DataSourceRecord[]>;

// Insert a seed map only into tables that are currently empty — idempotent, so
// re-running never clobbers records the user created.
const seedMissingTables = async (
  dataSource: ReturnType<typeof getBridgeDataSource>,
  seed: Record<string, DataSourceRecord[]>,
): Promise<void> => {
  await Promise.all(
    Object.entries(seed).map(async ([objectName, records]) => {
      if (records.length === 0) return;
      const existing = await dataSource.findMany(objectName, { first: 1 }, {});
      if (existing.totalCount === 0) {
        await dataSource.db.table(objectName).bulkPut(records);
      }
    }),
  );
};

export const getBridgeDataSource = () => {
  if (cachedDataSource === undefined) {
    cachedDataSource = createDexieDataSource({
      bundle: getBridgeDataSourceBundle(),
      databaseName: 'twenty-bridge-data-source',
      // Bumped as the research schema evolves so existing visitors get an
      // additive Dexie upgrade instead of a same-version schema-diff error:
      //   1 → 2  research objects added
      //   2 → 3  research relations added (new `<field>Id` join-column indexes)
      //   3 → 4  applicationRequirement checklist object + relation
      //   4 → 5  applicantProfile / applicationSection / reusableAnswer objects,
      //          project↔application + opportunity provenance relations, and
      //          opportunityKind/eligibility fields
      //   5 → 6  manuscript authoring: manuscriptSection / figure / reference /
      //          journalTemplate objects + their relations
      //   6 → 7  obligations tracker: obligation / obligationDocument +
      //          projectMembership (researcher↔project roster) objects and
      //          their relations
      schemaVersion: 7,
    });
  }
  return cachedDataSource;
};

// One-shot seed. A fresh install starts as a blank workspace, but still gets the
// starter format library (journal templates) so a paper can be formatted from
// day one. The full sample dataset is only loaded in demo mode (`/demo`). An
// already-populated database keeps the user's mutations; we only fill tables
// that are still empty.
export const ensureBridgeDataSourceSeeded = async (): Promise<void> => {
  if (seedPromise !== undefined) return seedPromise;
  const dataSource = getBridgeDataSource();
  seedPromise = (async () => {
    const probe = await dataSource.findMany('company', { first: 1 }, {});
    const seedMode = getResearchSeedMode();

    if (seedMode === 'demo') {
      if (probe.totalCount > 0) {
        await seedMissingTables(dataSource, buildSeed());
      } else {
        await dataSource.reset(buildSeed());
      }
      return;
    }

    // Blank mode: seed only the starter format library, idempotently, so the
    // workspace is never empty of templates but carries no demo content.
    await seedMissingTables(dataSource, buildStarterSeed());
  })();
  return seedPromise;
};

export const closeBridgeDataSourceForReset = (): void => {
  cachedDataSource?.db.close();
  cachedDataSource = undefined;
  seedPromise = undefined;
};
