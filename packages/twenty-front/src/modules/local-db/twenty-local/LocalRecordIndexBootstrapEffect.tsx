import { createDataClient } from '@/local-db/createDataClient';
import {
  mapAppDataSnapshotToCompanies,
  mapAppDataSnapshotToNotes,
  mapAppDataSnapshotToTasks,
} from '@/local-db/twenty-local/mapAppDataToTwentyRecords';
import { getTwentyDataBridgeConfig } from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import {
  getTwentyLocalObjectConfigByObjectRoutePath,
  type TwentyLocalObjectNamePlural,
} from '@/local-db/twenty-local/twentyLocalObjectConfigs';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { useLoadRecordIndexStates } from '@/object-record/record-index/hooks/useLoadRecordIndexStates';
import { recordIndexRecordIdsByGroupComponentFamilyState } from '@/object-record/record-index/states/recordIndexRecordIdsByGroupComponentFamilyState';
import { NO_RECORD_GROUP_FAMILY_KEY } from '@/object-record/record-index/states/selectors/recordIndexAllRecordIdsComponentSelector';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { isRecordTableInitialLoadingComponentState } from '@/object-record/record-table/states/isRecordTableInitialLoadingComponentState';
import { dataLoadingStatusByRealIndexComponentState } from '@/object-record/record-table/virtualization/states/dataLoadingStatusByRealIndexComponentState';
import { isInitializingVirtualTableDataLoadingComponentState } from '@/object-record/record-table/virtualization/states/isInitializingVirtualTableDataLoadingComponentState';
import { realIndexByVirtualIndexComponentFamilyState } from '@/object-record/record-table/virtualization/states/realIndexByVirtualIndexComponentFamilyState';
import { recordIdByRealIndexComponentState } from '@/object-record/record-table/virtualization/states/recordIdByRealIndexComponentState';
import { totalNumberOfRecordsToVirtualizeComponentState } from '@/object-record/record-table/virtualization/states/totalNumberOfRecordsToVirtualizeComponentState';
import { getRecordIndexIdFromObjectNamePluralAndViewId } from '@/object-record/utils/getRecordIndexIdFromObjectNamePluralAndViewId';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { mapViewFieldToRecordField } from '@/views/utils/mapViewFieldToRecordField';
import { useStore } from 'jotai';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import { ViewKey, ViewType } from '~/generated-metadata/graphql';

const mapSnapshotToRecordsByObjectNamePlural = {
  companies: mapAppDataSnapshotToCompanies,
  notes: mapAppDataSnapshotToNotes,
  tasks: mapAppDataSnapshotToTasks,
} as const satisfies Record<TwentyLocalObjectNamePlural, unknown>;

const getLocalRecordFields = (
  indexView: {
    viewFields: Array<Parameters<typeof mapViewFieldToRecordField>[0]>;
  },
  objectMetadataItem: {
    fields: Array<{ id: string; name: string }>;
    readableFields: Array<{ id: string; name: string }>;
  },
  preferredFieldNames: readonly string[],
) => {
  const fieldsFromMetadata = preferredFieldNames
    .map((fieldName) =>
      objectMetadataItem.readableFields.find(
        (field) => field.name === fieldName,
      ),
    )
    .filter(isDefined);

  if (fieldsFromMetadata.length > 0) {
    return fieldsFromMetadata.map((field, index) => ({
      id: `localdb-view-field-${field.id}`,
      fieldMetadataItemId: field.id,
      isVisible: true,
      position: index,
      size: index === 0 ? 180 : 150,
      aggregateOperation: null,
    }));
  }

  return indexView.viewFields.map(mapViewFieldToRecordField);
};

export const LocalRecordIndexBootstrapEffect = () => {
  const location = useLocation();
  const store = useStore();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const views = useAtomStateValue(viewsSelector);
  const viewsMetadataStore = useAtomFamilyStateValue(
    metadataStoreState,
    'views',
  );
  const { loadRecordIndexStates } = useLoadRecordIndexStates();

  useEffect(() => {
    if (viewsMetadataStore.status !== 'up-to-date') {
      return;
    }

    const localObjectConfig = getTwentyLocalObjectConfigByObjectRoutePath(
      location.pathname,
    );

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

    const objectMetadataItem = objectMetadataItems.find(
      (objectMetadataItem) =>
        objectMetadataItem.namePlural === localObjectConfig.objectNamePlural,
    );

    if (objectMetadataItem === undefined) {
      return;
    }

    const indexView =
      views.find(
        (view) =>
          view.objectMetadataId === objectMetadataItem.id &&
          view.key === ViewKey.INDEX &&
          view.type === ViewType.TABLE,
      ) ??
      views.find((view) => view.objectMetadataId === objectMetadataItem.id);

    if (indexView === undefined) {
      return;
    }

    store.set(
      contextStoreCurrentObjectMetadataItemIdComponentState.atomFamily({
        instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
      }),
      objectMetadataItem.id,
    );
    store.set(
      contextStoreCurrentViewIdComponentState.atomFamily({
        instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
      }),
      indexView.id,
    );

    loadRecordIndexStates(indexView, objectMetadataItem);

    const recordIndexId = getRecordIndexIdFromObjectNamePluralAndViewId(
      objectMetadataItem.namePlural,
      indexView.id,
    );

    store.set(
      currentRecordFieldsComponentState.atomFamily({
        instanceId: recordIndexId,
      }),
      getLocalRecordFields(
        indexView,
        objectMetadataItem,
        localObjectConfig.preferredFieldNames,
      ),
    );

    const publishSnapshot = async () => {
      const snapshot = await dataClient.exportAll();

      if (
        dataClient.mode === 'local' &&
        localObjectConfig.shouldSeedSnapshot(snapshot)
      ) {
        await dataClient.resetDemo();
      }

      const localRecords = mapSnapshotToRecords(await dataClient.exportAll());
      const localRecordIds = localRecords.map((record) => record.id);

      store.set(
        currentRecordFieldsComponentState.atomFamily({
          instanceId: recordIndexId,
        }),
        getLocalRecordFields(
          indexView,
          objectMetadataItem,
          localObjectConfig.preferredFieldNames,
        ),
      );

      localRecords.forEach((record) => {
        store.set(recordStoreFamilyState.atomFamily(record.id), record);
      });

      store.set(
        recordIndexRecordIdsByGroupComponentFamilyState.atomFamily({
          instanceId: recordIndexId,
          familyKey: NO_RECORD_GROUP_FAMILY_KEY,
        }),
        localRecordIds,
      );
      store.set(
        totalNumberOfRecordsToVirtualizeComponentState.atomFamily({
          instanceId: recordIndexId,
        }),
        localRecords.length,
      );
      store.set(
        recordIdByRealIndexComponentState.atomFamily({
          instanceId: recordIndexId,
        }),
        new Map(localRecordIds.map((recordId, index) => [index, recordId])),
      );
      store.set(
        dataLoadingStatusByRealIndexComponentState.atomFamily({
          instanceId: recordIndexId,
        }),
        new Map(localRecords.map((_, index) => [index, 'loaded' as const])),
      );
      store.set(
        isInitializingVirtualTableDataLoadingComponentState.atomFamily({
          instanceId: recordIndexId,
        }),
        false,
      );
      store.set(
        isRecordTableInitialLoadingComponentState.atomFamily({
          instanceId: recordIndexId,
        }),
        false,
      );

      localRecords.forEach((_, index) => {
        store.set(
          realIndexByVirtualIndexComponentFamilyState.atomFamily({
            instanceId: recordIndexId,
            familyKey: { virtualIndex: index },
          }),
          index,
        );
      });
    };

    void publishSnapshot();

    return dataClient.watchSnapshot(() => {
      void publishSnapshot();
    });
  }, [
    loadRecordIndexStates,
    location.pathname,
    objectMetadataItems,
    store,
    views,
    viewsMetadataStore.status,
  ]);

  return null;
};
