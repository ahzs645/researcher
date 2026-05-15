import { ApolloProvider } from '@apollo/client/react';
import { StrictMode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { ClientConfigProvider } from '@/client-config/components/ClientConfigProvider';
import { ClientConfigProviderEffect } from '@/client-config/components/ClientConfigProviderEffect';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { MainContextStoreProvider } from '@/context-store/components/MainContextStoreProvider';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { ErrorMessageEffect } from '@/error-handler/components/ErrorMessageEffect';
import { LocalMockedMetadataLoadEffect } from '@/local-db/twenty-local/LocalMockedMetadataLoadEffect';
import { LocalRecordIndexBootstrapEffect } from '@/local-db/twenty-local/LocalRecordIndexBootstrapEffect';
import { LocalRecordShowBootstrapEffect } from '@/local-db/twenty-local/LocalRecordShowBootstrapEffect';
import {
  defaultTwentyLocalObjectConfig,
  getTwentyLocalObjectConfigByObjectNameSingular,
  getTwentyLocalObjectConfigByObjectNamePlural,
} from '@/local-db/twenty-local/twentyLocalObjectConfigs';
import { PromiseRejectionEffect } from '@/error-handler/components/PromiseRejectionEffect';
import { MinimalMetadataGater } from '@/metadata-store/components/MinimalMetadataGater';
import { LocalUserMetadataProviderInitialEffect } from '@/local-db/twenty-local/LocalUserMetadataProviderInitialEffect';
import { ApolloCoreClientMockedProvider } from '@/object-metadata/hooks/__mocks__/ApolloCoreClientMockedProvider';
import { PreComputedChipGeneratorsProvider } from '@/object-metadata/components/PreComputedChipGeneratorsProvider';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { DialogManager } from '@/ui/feedback/dialog-manager/components/DialogManager';
import { DialogComponentInstanceContext } from '@/ui/feedback/dialog-manager/contexts/DialogComponentInstanceContext';
import { SnackBarProvider } from '@/ui/feedback/snack-bar-manager/components/SnackBarProvider';
import { BaseThemeProvider } from '@/ui/theme/components/BaseThemeProvider';
import { UserThemeProviderEffect } from '@/ui/theme/components/UserThemeProviderEffect';
import { PageFavicon } from '@/ui/utilities/page-favicon/components/PageFavicon';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { WorkspaceProviderEffect } from '@/workspace/components/WorkspaceProviderEffect';
import { mockedApolloClient } from '~/testing/mockedApolloClient';
import { getPageTitleFromPath } from '~/utils/title-utils';

export const LocalAppRouterProviders = () => {
  const { pathname, search } = useLocation();
  const pageTitle = getPageTitleFromPath(pathname);
  const [, routeKind, objectNameFromPath] = pathname.split('/');
  const localObjectConfig =
    (routeKind === 'object'
      ? getTwentyLocalObjectConfigByObjectNameSingular(objectNameFromPath)
      : getTwentyLocalObjectConfigByObjectNamePlural(objectNameFromPath)) ??
    defaultTwentyLocalObjectConfig;
  const searchParams = new URLSearchParams(search);
  const viewId = searchParams.get('viewId') ?? localObjectConfig.defaultViewId;
  const recordIndexId = `${localObjectConfig.objectNamePlural}-${viewId}`;

  return (
    <ApolloProvider client={mockedApolloClient}>
      <BaseThemeProvider>
        <ClientConfigProviderEffect />
        <LocalUserMetadataProviderInitialEffect />
        <LocalMockedMetadataLoadEffect />
        <WorkspaceProviderEffect />
        <ClientConfigProvider>
          <MinimalMetadataGater>
            <ApolloCoreClientMockedProvider>
              <PreComputedChipGeneratorsProvider>
                <UserThemeProviderEffect />
                <SnackBarProvider>
                  <ErrorMessageEffect />
                  <DialogComponentInstanceContext.Provider
                    value={{ instanceId: 'dialog-manager' }}
                  >
                    <DialogManager>
                      <StrictMode>
                        <PromiseRejectionEffect />
                        <PageTitle title={pageTitle} />
                        <PageFavicon />
                        <LocalRecordShowBootstrapEffect />
                        <RecordComponentInstanceContextsWrapper componentInstanceId="localdb-record-page">
                          <Outlet />
                        </RecordComponentInstanceContextsWrapper>
                      </StrictMode>
                    </DialogManager>
                  </DialogComponentInstanceContext.Provider>
                </SnackBarProvider>
                <MainContextStoreProvider />
                <ContextStoreComponentInstanceContext.Provider
                  value={{ instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID }}
                >
                  <ViewComponentInstanceContext.Provider
                    value={{
                      instanceId: recordIndexId,
                    }}
                  >
                    <RecordComponentInstanceContextsWrapper
                      componentInstanceId={recordIndexId}
                    >
                      <LocalRecordIndexBootstrapEffect />
                    </RecordComponentInstanceContextsWrapper>
                  </ViewComponentInstanceContext.Provider>
                </ContextStoreComponentInstanceContext.Provider>
              </PreComputedChipGeneratorsProvider>
            </ApolloCoreClientMockedProvider>
          </MinimalMetadataGater>
        </ClientConfigProvider>
      </BaseThemeProvider>
    </ApolloProvider>
  );
};
