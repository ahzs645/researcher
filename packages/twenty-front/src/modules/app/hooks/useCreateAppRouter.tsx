import { AppRouterProviders } from '@/app/components/AppRouterProviders';
import { LazyRoute } from '@/app/components/LazyRoute';
import { SettingsRoutes } from '@/app/components/SettingsRoutes';
import { VerifyLoginTokenEffect } from '@/auth/components/VerifyLoginTokenEffect';

import { VerifyEmailEffect } from '@/auth/components/VerifyEmailEffect';
import { getTwentyRouterBasename } from '@/local-db/twenty-local/getTwentyPublicBasePath';
import {
  getTwentyLocalObjectRoutePath,
  getTwentyLocalObjectConfigByObjectNamePlural,
  getTwentyLocalRecordRoutePath,
  type TwentyLocalObjectNamePlural,
} from '@/local-db/twenty-local/twentyLocalObjectConfigs';
import indexAppPath from '@/navigation/utils/indexAppPath';
import { BlankLayout } from '@/ui/layout/page/components/BlankLayout';
import { DefaultLayout } from '@/ui/layout/page/components/DefaultLayout';
import { AppPath } from 'twenty-shared/types';

import { lazy } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  useParams,
} from 'react-router-dom';

const RecordIndexPage = lazy(() =>
  import('~/pages/object-record/RecordIndexPage').then((module) => ({
    default: module.RecordIndexPage,
  })),
);

const DiscoveryPage = lazy(() =>
  import('@/local-db/research/components/DiscoveryPage').then((module) => ({
    default: module.DiscoveryPage,
  })),
);

const ManuscriptComposerPage = lazy(() =>
  import('@/local-db/research/components/ManuscriptComposerPage').then(
    (module) => ({
      default: module.ManuscriptComposerPage,
    }),
  ),
);

const RecordShowPage = lazy(() =>
  import('~/pages/object-record/RecordShowPage').then((module) => ({
    default: module.RecordShowPage,
  })),
);

const SignInUp = lazy(() =>
  import('~/pages/auth/SignInUp').then((module) => ({
    default: module.SignInUp,
  })),
);

const PasswordReset = lazy(() =>
  import('~/pages/auth/PasswordReset').then((module) => ({
    default: module.PasswordReset,
  })),
);

const Authorize = lazy(() =>
  import('~/pages/auth/Authorize').then((module) => ({
    default: module.Authorize,
  })),
);

const CreateWorkspace = lazy(() =>
  import('~/pages/onboarding/CreateWorkspace').then((module) => ({
    default: module.CreateWorkspace,
  })),
);

const CreateProfile = lazy(() =>
  import('~/pages/onboarding/CreateProfile').then((module) => ({
    default: module.CreateProfile,
  })),
);

const SyncEmails = lazy(() =>
  import('~/pages/onboarding/SyncEmails').then((module) => ({
    default: module.SyncEmails,
  })),
);

const InviteTeam = lazy(() =>
  import('~/pages/onboarding/InviteTeam').then((module) => ({
    default: module.InviteTeam,
  })),
);

const ChooseYourPlan = lazy(() =>
  import('~/pages/onboarding/ChooseYourPlan').then((module) => ({
    default: module.ChooseYourPlan,
  })),
);

const PaymentSuccess = lazy(() =>
  import('~/pages/onboarding/PaymentSuccess').then((module) => ({
    default: module.PaymentSuccess,
  })),
);

const BookCallDecision = lazy(() =>
  import('~/pages/onboarding/BookCallDecision').then((module) => ({
    default: module.BookCallDecision,
  })),
);

const BookCall = lazy(() =>
  import('~/pages/onboarding/BookCall').then((module) => ({
    default: module.BookCall,
  })),
);

const StandalonePageLayoutPage = lazy(() =>
  import('~/pages/page-layout/StandalonePageLayoutPage').then((module) => ({
    default: module.StandalonePageLayoutPage,
  })),
);

const NotFound = lazy(() =>
  import('~/pages/not-found/NotFound').then((module) => ({
    default: module.NotFound,
  })),
);

const TwentyBridgeRedirect = ({
  dataMode,
  objectNamePlural,
}: {
  dataMode: 'local' | 'convex';
  objectNamePlural: TwentyLocalObjectNamePlural;
}) => (
  <Navigate
    replace
    to={getTwentyLocalObjectRoutePath({ dataMode, objectNamePlural })}
  />
);

const getBridgeObjectNamePlural = (objectNamePlural: string | undefined) =>
  getTwentyLocalObjectConfigByObjectNamePlural(objectNamePlural)
    ?.objectNamePlural ?? 'companies';

const TwentyBridgeObjectRedirect = ({
  dataMode,
}: {
  dataMode: 'local' | 'convex';
}) => {
  const { objectNamePlural } = useParams();

  return (
    <TwentyBridgeRedirect
      dataMode={dataMode}
      objectNamePlural={getBridgeObjectNamePlural(objectNamePlural)}
    />
  );
};

const TwentyBridgeRecordRedirect = ({
  dataMode,
}: {
  dataMode: 'local' | 'convex';
}) => {
  const { objectNamePlural, objectRecordId } = useParams();

  if (objectRecordId === undefined) {
    return <TwentyBridgeObjectRedirect dataMode={dataMode} />;
  }

  return (
    <Navigate
      replace
      to={getTwentyLocalRecordRoutePath({
        dataMode,
        objectNamePlural: getBridgeObjectNamePlural(objectNamePlural),
        objectRecordId,
      })}
    />
  );
};

const LocalDbTwentyRedirect = () => (
  <TwentyBridgeRedirect dataMode="local" objectNamePlural="companies" />
);

const ConvexTwentyRedirect = () => (
  <TwentyBridgeRedirect dataMode="convex" objectNamePlural="companies" />
);

export const useCreateAppRouter = (
  isFunctionSettingsEnabled?: boolean,
  isAdminPageEnabled?: boolean,
) =>
  createBrowserRouter(
    createRoutesFromElements(
      <Route
        element={<AppRouterProviders />}
        // To switch state to `loading` temporarily to enable us
        // to set scroll position before the page is rendered
        loader={async () => Promise.resolve(null)}
      >
        <Route element={<DefaultLayout />}>
          <Route path={AppPath.Verify} element={<VerifyLoginTokenEffect />} />
          <Route path={AppPath.VerifyEmail} element={<VerifyEmailEffect />} />
          <Route
            path={AppPath.SignInUp}
            element={
              <LazyRoute fallback={null}>
                <SignInUp />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.Invite}
            element={
              <LazyRoute fallback={null}>
                <SignInUp />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.ResetPassword}
            element={
              <LazyRoute fallback={null}>
                <PasswordReset />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.CreateWorkspace}
            element={
              <LazyRoute fallback={null}>
                <CreateWorkspace />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.CreateProfile}
            element={
              <LazyRoute fallback={null}>
                <CreateProfile />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.SyncEmails}
            element={
              <LazyRoute fallback={null}>
                <SyncEmails />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.InviteTeam}
            element={
              <LazyRoute fallback={null}>
                <InviteTeam />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.PlanRequired}
            element={
              <LazyRoute fallback={null}>
                <ChooseYourPlan />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.PlanRequiredSuccess}
            element={
              <LazyRoute fallback={null}>
                <PaymentSuccess />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.BookCallDecision}
            element={
              <LazyRoute fallback={null}>
                <BookCallDecision />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.BookCall}
            element={
              <LazyRoute fallback={null}>
                <BookCall />
              </LazyRoute>
            }
          />
          <Route path={indexAppPath.getIndexAppPath()} element={<></>} />
          <Route
            path={AppPath.RecordIndexPage}
            element={
              <LazyRoute>
                <RecordIndexPage />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.RecordShowPage}
            element={
              <LazyRoute>
                <RecordShowPage />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.PageLayoutPage}
            element={
              <LazyRoute>
                <StandalonePageLayoutPage />
              </LazyRoute>
            }
          />
          <Route
            path="/discovery"
            element={
              <LazyRoute>
                <DiscoveryPage />
              </LazyRoute>
            }
          />
          <Route
            path="/compose"
            element={
              <LazyRoute>
                <ManuscriptComposerPage />
              </LazyRoute>
            }
          />
          <Route path="/localdb" element={<LocalDbTwentyRedirect />} />
          <Route
            path="/localdb/:objectNamePlural"
            element={<TwentyBridgeObjectRedirect dataMode="local" />}
          />
          <Route
            path="/localdb/:objectNamePlural/:objectRecordId"
            element={<TwentyBridgeRecordRedirect dataMode="local" />}
          />
          <Route path="/convex" element={<ConvexTwentyRedirect />} />
          <Route
            path="/convex/:objectNamePlural"
            element={<TwentyBridgeObjectRedirect dataMode="convex" />}
          />
          <Route
            path="/convex/:objectNamePlural/:objectRecordId"
            element={<TwentyBridgeRecordRedirect dataMode="convex" />}
          />
          <Route
            path={AppPath.SettingsCatchAll}
            element={
              <SettingsRoutes
                isFunctionSettingsEnabled={isFunctionSettingsEnabled}
                isAdminPageEnabled={isAdminPageEnabled}
              />
            }
          />
          <Route
            path={AppPath.NotFoundWildcard}
            element={
              <LazyRoute>
                <NotFound />
              </LazyRoute>
            }
          />
        </Route>
        <Route element={<BlankLayout />}>
          <Route
            path={AppPath.Authorize}
            element={
              <LazyRoute>
                <Authorize />
              </LazyRoute>
            }
          />
        </Route>
      </Route>,
    ),
    // `basename` is `/` for normal root deploys and the repo sub-path
    // (e.g. `/researcher`) for static GitHub Pages builds.
    { basename: getTwentyRouterBasename() },
  );
