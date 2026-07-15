// Sets up an in-memory IndexedDB before importing Dexie consumers.
import 'fake-indexeddb/auto';

import Dexie from 'dexie';

import {
  closeBridgeDataSourceForReset,
  ensureBridgeDataSourceSeeded,
  getBridgeDataSource,
} from '@/local-db/data-source/buildBridgeDataSource';
import { getResearchStarterRecords } from '@/local-db/research/researchSeedRecords';

const BRIDGE_RECORDS_DEXIE_NAME = 'twenty-bridge-data-source';

const setUrl = (url: string) => window.history.pushState({}, '', url);

describe('buildBridgeDataSource', () => {
  beforeEach(async () => {
    closeBridgeDataSourceForReset();
    await Dexie.delete(BRIDGE_RECORDS_DEXIE_NAME);
    window.sessionStorage.clear();
    setUrl('/demo');
  });

  afterEach(async () => {
    closeBridgeDataSourceForReset();
    await Dexie.delete(BRIDGE_RECORDS_DEXIE_NAME);
  });

  it('backfills empty demo stores for returning users after schema growth', async () => {
    const dataSource = getBridgeDataSource();
    await dataSource.reset({
      company: [
        {
          id: 'company-existing',
          name: 'Existing Institution',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deletedAt: null,
        },
      ],
    });

    await ensureBridgeDataSourceSeeded();

    const companyPage = await dataSource.findMany(
      'company',
      { first: 100 },
      {},
    );
    const obligationPage = await dataSource.findMany(
      'obligation',
      { first: 1 },
      {},
    );
    const projectMembershipPage = await dataSource.findMany(
      'projectMembership',
      { first: 1 },
      {},
    );

    expect(companyPage.totalCount).toBe(1);
    expect(obligationPage.totalCount).toBeGreaterThan(0);
    expect(projectMembershipPage.totalCount).toBeGreaterThan(0);
  });

  it('seeds the starter journal templates in a blank workspace without demo content', async () => {
    setUrl('/'); // blank mode (no /demo, no ?demo=1)
    window.sessionStorage.clear();
    const dataSource = getBridgeDataSource();

    await ensureBridgeDataSourceSeeded();

    const journalTemplates = await dataSource.findMany(
      'journalTemplate',
      { first: 100 },
      {},
    );
    const companies = await dataSource.findMany('company', { first: 1 }, {});
    const manuscripts = await dataSource.findMany(
      'manuscript',
      { first: 1 },
      {},
    );

    // Templates are present...
    expect(journalTemplates.totalCount).toBeGreaterThan(0);
    // ...including the MDPI/IJERPH format the air-quality examples need.
    expect(
      journalTemplates.records.some(
        (record) =>
          (record as { citationStyleId?: string }).citationStyleId ===
          'multidisciplinary-digital-publishing-institute',
      ),
    ).toBe(true);
    // ...but no demo content leaks into a blank workspace.
    expect(companies.totalCount).toBe(0);
    expect(manuscripts.totalCount).toBe(0);
  });

  it('does not clobber user-created journal templates on reseed', async () => {
    setUrl('/');
    window.sessionStorage.clear();
    const dataSource = getBridgeDataSource();
    await dataSource.db.table('journalTemplate').bulkPut([
      {
        id: 'my-template',
        name: 'My custom format',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deletedAt: null,
      },
    ]);

    await ensureBridgeDataSourceSeeded();

    const journalTemplates = await dataSource.findMany(
      'journalTemplate',
      { first: 100 },
      {},
    );
    expect(
      journalTemplates.records.some(
        (record) => (record as { id?: string }).id === 'my-template',
      ),
    ).toBe(true);
    expect(journalTemplates.totalCount).toBeGreaterThan(1);
  });

  it('refreshes built-in journal styles for returning workspaces', async () => {
    setUrl('/');
    window.sessionStorage.clear();
    const dataSource = getBridgeDataSource();
    const atmosphericEnvironment =
      getResearchStarterRecords().journalTemplate.find(
        (record) =>
          (record as { profileKey?: string }).profileKey ===
          'elsevier-atmospheric-environment',
      );
    if (atmosphericEnvironment === undefined) {
      throw new Error('Expected Atmospheric Environment starter profile');
    }
    await dataSource.db.table('journalTemplate').bulkPut([
      {
        ...atmosphericEnvironment,
        frontMatterLayout: 'INLINE',
        fontFamily: 'Inter',
        lineSpacing: 1.5,
      },
    ]);

    await ensureBridgeDataSourceSeeded();

    const journalTemplates = await dataSource.findMany(
      'journalTemplate',
      { first: 100 },
      {},
    );
    const refreshed = journalTemplates.records.find(
      (record) =>
        (record as { profileKey?: string }).profileKey ===
        'elsevier-atmospheric-environment',
    ) as
      | {
          frontMatterLayout?: string;
          fontFamily?: string;
          lineSpacing?: number;
        }
      | undefined;

    expect(refreshed?.frontMatterLayout).toBe('SEPARATE_TITLE_PAGE');
    expect(refreshed?.fontFamily).toBe('Times New Roman');
    expect(refreshed?.lineSpacing).toBe(2);
  });
});
