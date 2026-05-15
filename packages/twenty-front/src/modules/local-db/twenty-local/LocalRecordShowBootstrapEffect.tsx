import { createDataClient } from '@/local-db/createDataClient';
import { getTwentyDataBridgeConfig } from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import {
  mapAppDataSnapshotToCompanies,
  mapAppDataSnapshotToNotes,
  mapAppDataSnapshotToTasks,
} from '@/local-db/twenty-local/mapAppDataToTwentyRecords';
import {
  getTwentyLocalObjectConfigByObjectNameSingular,
  type TwentyLocalObjectNamePlural,
} from '@/local-db/twenty-local/twentyLocalObjectConfigs';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useStore } from 'jotai';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const mapSnapshotToRecordsByObjectNamePlural = {
  companies: mapAppDataSnapshotToCompanies,
  notes: mapAppDataSnapshotToNotes,
  tasks: mapAppDataSnapshotToTasks,
} as const satisfies Record<TwentyLocalObjectNamePlural, unknown>;

export const LocalRecordShowBootstrapEffect = () => {
  const location = useLocation();
  const store = useStore();

  useEffect(() => {
    const [, routeKind, objectNameSingular, objectRecordId] =
      location.pathname.split('/');

    if (
      routeKind !== 'object' ||
      objectNameSingular === undefined ||
      objectRecordId === undefined
    ) {
      return;
    }

    const localObjectConfig =
      getTwentyLocalObjectConfigByObjectNameSingular(objectNameSingular);

    if (localObjectConfig === undefined) {
      return;
    }

    const bridgeConfig = getTwentyDataBridgeConfig();

    if (bridgeConfig === null) {
      return;
    }

    const dataClient = createDataClient(bridgeConfig.mode, {
      convexUrl: bridgeConfig.convexUrl,
    });
    const mapSnapshotToRecords =
      mapSnapshotToRecordsByObjectNamePlural[
        localObjectConfig.objectNamePlural
      ];

    const publishSnapshot = async () => {
      const snapshot = await dataClient.exportAll();

      if (
        dataClient.mode === 'local' &&
        localObjectConfig.shouldSeedSnapshot(snapshot)
      ) {
        await dataClient.resetDemo();
      }

      const localRecord = mapSnapshotToRecords(
        await dataClient.exportAll(),
      ).find(
        (record) =>
          typeof record.id === 'string' && record.id === objectRecordId,
      );

      store.set(
        recordStoreFamilyState.atomFamily(objectRecordId),
        localRecord ?? null,
      );
    };

    void publishSnapshot();

    return dataClient.watchSnapshot(() => {
      void publishSnapshot();
    });
  }, [location.pathname, store]);

  return null;
};
