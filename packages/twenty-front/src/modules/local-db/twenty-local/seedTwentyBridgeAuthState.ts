import { availableWorkspacesState } from '@/auth/states/availableWorkspacesState';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceDeletedMembersState } from '@/auth/states/currentWorkspaceDeletedMembersState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isCurrentUserLoadedState } from '@/auth/states/isCurrentUserLoadedState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { mockedUserData } from '~/testing/mock-data/users';

// The local demo is single-user with no backend RBAC, so grant every settings
// permission flag. Otherwise `SettingsProtectedRouteWrapper` bounces any
// workspace-level settings page (general, data model, roles, API keys,
// security, …) back to /settings/profile — which reads as settings "restarting".
const ALL_PERMISSION_FLAGS = Object.values(PermissionFlagType);

// Local bridge mode never talks to Twenty's auth backend, so we mint an
// always-valid placeholder pair. Apollo only checks the cookie's shape;
// MSW intercepts every request that would otherwise need real credentials.
const BRIDGE_TOKEN_PAIR = {
  accessOrWorkspaceAgnosticToken: {
    token: 'twenty-local-bridge-access-token',
    expiresAt: '2999-12-31T23:59:59.000Z',
  },
  refreshToken: {
    token: 'twenty-local-bridge-refresh-token',
    expiresAt: '2999-12-31T23:59:59.000Z',
  },
};

export const seedTwentyBridgeAuthState = () => {
  jotaiStore.set(tokenPairState.atom, BRIDGE_TOKEN_PAIR);
  jotaiStore.set(currentUserState.atom, mockedUserData);
  jotaiStore.set(currentWorkspaceState.atom, {
    ...mockedUserData.currentWorkspace,
    defaultRole: mockedUserData.currentWorkspace.defaultRole ?? null,
    workspaceCustomApplication:
      mockedUserData.currentWorkspace.workspaceCustomApplication ?? null,
  });
  jotaiStore.set(currentUserWorkspaceState.atom, {
    ...mockedUserData.currentUserWorkspace,
    permissionFlags: ALL_PERMISSION_FLAGS,
  });
  jotaiStore.set(
    currentWorkspaceMemberState.atom,
    mockedUserData.workspaceMember,
  );
  jotaiStore.set(
    currentWorkspaceMembersState.atom,
    mockedUserData.workspaceMembers,
  );
  jotaiStore.set(currentWorkspaceDeletedMembersState.atom, []);
  jotaiStore.set(
    availableWorkspacesState.atom,
    mockedUserData.availableWorkspaces,
  );
  jotaiStore.set(isCurrentUserLoadedState.atom, true);
};
