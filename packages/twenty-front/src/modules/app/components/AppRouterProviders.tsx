import { AgentChatProvider } from '@/ai/components/AgentChatProvider';
import { ApolloProvider } from '@/apollo/components/ApolloProvider';
import { CommandMenuConfirmationModalManager } from '@/command-menu-item/confirmation-modal/components/CommandMenuConfirmationModalManager';
import { MinimalMetadataGater } from '@/metadata-store/components/MinimalMetadataGater';
import { IsMinimalMetadataReadyEffect } from '@/metadata-store/effect-components/IsMinimalMetadataReadyEffect';

import { GotoHotkeysEffectsProvider } from '@/app/effect-components/GotoHotkeysEffectsProvider';
import { PageChangeEffect } from '@/app/effect-components/PageChangeEffect';
import { AuthProvider } from '@/auth/components/AuthProvider';
import { SignOutOnOtherTabSignOutEffect } from '@/auth/effect-components/SignOutOnOtherTabSignOutEffect';
import { CaptchaProvider } from '@/captcha/components/CaptchaProvider';
import { ClientConfigProvider } from '@/client-config/components/ClientConfigProvider';
import { ClientConfigProviderEffect } from '@/client-config/components/ClientConfigProviderEffect';
import { MainContextStoreProvider } from '@/context-store/components/MainContextStoreProvider';
import { ErrorMessageEffect } from '@/error-handler/components/ErrorMessageEffect';
import { PromiseRejectionEffect } from '@/error-handler/components/PromiseRejectionEffect';
import { BridgeApolloCoreProvider } from '@/local-db/data-source/BridgeApolloCoreProvider';
import { ConvexBridgeConfigError } from '@/local-db/twenty-local/ConvexBridgeConfigError';
import {
  getTwentyDataBridgeConfig,
  isTwentyDataBridgeConfigured,
} from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import { isTwentyDataBridgeMode } from '@/local-db/twenty-local/isLocalTwentyDataMode';
import { LocalTwentyBridgeMetadataLoadEffect } from '@/local-db/twenty-local/LocalTwentyBridgeMetadataLoadEffect';
import { MinimalMetadataLoadEffect } from '@/metadata-store/effect-components/MinimalMetadataLoadEffect';
import { UserMetadataProviderInitialEffect } from '@/metadata-store/effect-components/UserMetadataProviderInitialEffect';
import { ApolloCoreProvider } from '@/object-metadata/components/ApolloCoreProvider';
import { PreComputedChipGeneratorsProvider } from '@/object-metadata/components/PreComputedChipGeneratorsProvider';
import { ApolloAdminProvider } from '@/settings/admin-panel/apollo/components/ApolloAdminProvider';

import { CommandRunner } from '@/command-menu-item/engine-command/components/CommandRunner';
import { SSEProvider } from '@/sse-db-event/components/SSEProvider';
import { SupportChatEffect } from '@/support/components/SupportChatEffect';
import { DialogManager } from '@/ui/feedback/dialog-manager/components/DialogManager';
import { DialogComponentInstanceContext } from '@/ui/feedback/dialog-manager/contexts/DialogComponentInstanceContext';
import { SnackBarProvider } from '@/ui/feedback/snack-bar-manager/components/SnackBarProvider';
import { GlobalFilePreviewModal } from '@/ui/field/display/components/GlobalFilePreviewModal';
import { BaseThemeProvider } from '@/ui/theme/components/BaseThemeProvider';
import { UserThemeProviderEffect } from '@/ui/theme/components/UserThemeProviderEffect';
import { PageFavicon } from '@/ui/utilities/page-favicon/components/PageFavicon';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import { WorkspaceProviderEffect } from '@/workspace/components/WorkspaceProviderEffect';
import { StrictMode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { getPageTitleFromPath } from '~/utils/title-utils';

const BridgeOrCoreApolloProvider = ({
  isBridgeMode,
  children,
}: {
  isBridgeMode: boolean;
  children: React.ReactNode;
}) =>
  isBridgeMode ? (
    <BridgeApolloCoreProvider>{children}</BridgeApolloCoreProvider>
  ) : (
    <ApolloCoreProvider>{children}</ApolloCoreProvider>
  );

export const AppRouterProviders = () => {
  const { pathname } = useLocation();
  const pageTitle = getPageTitleFromPath(pathname);
  const isBridgeMode = isTwentyDataBridgeMode();

  if (isBridgeMode) {
    const bridgeConfig = getTwentyDataBridgeConfig();

    if (!isTwentyDataBridgeConfigured(bridgeConfig)) {
      return <ConvexBridgeConfigError />;
    }
  }

  // SSE talks to the real Twenty backend over an event stream.
  // The bridge has no backend, so we render a no-op wrapper that just passes children through.
  const MaybeSSEProvider = isBridgeMode
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : SSEProvider;

  return (
    <ApolloProvider>
      <BaseThemeProvider>
        <ClientConfigProviderEffect />
        <UserMetadataProviderInitialEffect />
        {isBridgeMode ? (
          <LocalTwentyBridgeMetadataLoadEffect />
        ) : (
          <>
            <MinimalMetadataLoadEffect />
            <IsMinimalMetadataReadyEffect />
          </>
        )}
        <WorkspaceProviderEffect />
        <ClientConfigProvider>
          <CaptchaProvider>
            <MinimalMetadataGater>
              <AuthProvider>
                <BridgeOrCoreApolloProvider isBridgeMode={isBridgeMode}>
                  <ApolloAdminProvider>
                    <MaybeSSEProvider>
                      <PreComputedChipGeneratorsProvider>
                        <UserThemeProviderEffect />
                        <SnackBarProvider>
                          <ErrorMessageEffect />
                          <AgentChatProvider>
                            <DialogComponentInstanceContext.Provider
                              value={{ instanceId: 'dialog-manager' }}
                            >
                              <DialogManager>
                                <StrictMode>
                                  <PromiseRejectionEffect />
                                  <GotoHotkeysEffectsProvider />
                                  <PageTitle title={pageTitle} />
                                  <PageFavicon />
                                  <Outlet />
                                  <GlobalFilePreviewModal />
                                  <CommandMenuConfirmationModalManager />
                                  <CommandRunner />
                                </StrictMode>
                              </DialogManager>
                            </DialogComponentInstanceContext.Provider>
                          </AgentChatProvider>
                        </SnackBarProvider>
                        <MainContextStoreProvider />
                        <SupportChatEffect />
                        <PageChangeEffect />
                        <SignOutOnOtherTabSignOutEffect />
                      </PreComputedChipGeneratorsProvider>
                    </MaybeSSEProvider>
                  </ApolloAdminProvider>
                </BridgeOrCoreApolloProvider>
              </AuthProvider>
            </MinimalMetadataGater>
          </CaptchaProvider>
        </ClientConfigProvider>
      </BaseThemeProvider>
    </ApolloProvider>
  );
};
