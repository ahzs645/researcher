import { useLocation } from 'react-router-dom';

import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { LocalRecordIndexBootstrapEffect } from '@/local-db/twenty-local/LocalRecordIndexBootstrapEffect';
import { LocalRecordShowBootstrapEffect } from '@/local-db/twenty-local/LocalRecordShowBootstrapEffect';
import {
  defaultTwentyLocalObjectConfig,
  getTwentyLocalObjectConfigByObjectNameSingular,
  getTwentyLocalObjectConfigByObjectNamePlural,
} from '@/local-db/twenty-local/twentyLocalObjectConfigs';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';

// The bootstrap hooks below depend on ContextStore + View + Record component
// instance contexts to drive the record-index virtualization atoms directly.
// We mirror the wrapping that `LocalAppRouterProviders` used to provide before
// the bridge moved onto the real `AppRouterProviders` tree.
export const LocalTwentyBridgeRecordEffects = () => {
  const { pathname, search } = useLocation();
  const [, routeKind, objectNameFromPath] = pathname.split('/');
  const routeObjectConfig =
    routeKind === 'object'
      ? getTwentyLocalObjectConfigByObjectNameSingular(objectNameFromPath)
      : getTwentyLocalObjectConfigByObjectNamePlural(objectNameFromPath);
  const localObjectConfig = routeObjectConfig ?? defaultTwentyLocalObjectConfig;

  const searchParams = new URLSearchParams(search);
  const viewId = searchParams.get('viewId') ?? localObjectConfig.defaultViewId;
  const recordIndexId = `${localObjectConfig.objectNamePlural}-${viewId}`;

  return (
    <ContextStoreComponentInstanceContext.Provider
      value={{ instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID }}
    >
      <LocalRecordShowBootstrapEffect />
      <ViewComponentInstanceContext.Provider
        value={{ instanceId: recordIndexId }}
      >
        <RecordComponentInstanceContextsWrapper
          componentInstanceId={recordIndexId}
        >
          <LocalRecordIndexBootstrapEffect />
        </RecordComponentInstanceContextsWrapper>
      </ViewComponentInstanceContext.Provider>
    </ContextStoreComponentInstanceContext.Provider>
  );
};
