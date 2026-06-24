// Sets up an in-memory IndexedDB before importing Dexie consumers.
import 'fake-indexeddb/auto';

import Dexie from 'dexie';

import {
  closeBridgeDataSourceForReset,
  ensureBridgeDataSourceSeeded,
  getBridgeDataSource,
} from '@/local-db/data-source/buildBridgeDataSource';

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
});
