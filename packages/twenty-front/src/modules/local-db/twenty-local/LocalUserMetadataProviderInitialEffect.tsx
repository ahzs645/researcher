import { availableWorkspacesState } from '@/auth/states/availableWorkspacesState';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceDeletedMembersState } from '@/auth/states/currentWorkspaceDeletedMembersState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isCurrentUserLoadedState } from '@/auth/states/isCurrentUserLoadedState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useEffect } from 'react';
import { mockedUserData } from '~/testing/mock-data/users';

export const LocalUserMetadataProviderInitialEffect = () => {
  const setCurrentUser = useSetAtomState(currentUserState);
  const setCurrentWorkspace = useSetAtomState(currentWorkspaceState);
  const setCurrentUserWorkspace = useSetAtomState(currentUserWorkspaceState);
  const setAvailableWorkspaces = useSetAtomState(availableWorkspacesState);
  const setCurrentWorkspaceMember = useSetAtomState(
    currentWorkspaceMemberState,
  );
  const setCurrentWorkspaceMembers = useSetAtomState(
    currentWorkspaceMembersState,
  );
  const setCurrentWorkspaceDeletedMembers = useSetAtomState(
    currentWorkspaceDeletedMembersState,
  );
  const setIsCurrentUserLoaded = useSetAtomState(isCurrentUserLoadedState);

  useEffect(() => {
    setCurrentUser(mockedUserData);
    setCurrentWorkspace({
      ...mockedUserData.currentWorkspace,
      defaultRole: mockedUserData.currentWorkspace.defaultRole ?? null,
      workspaceCustomApplication:
        mockedUserData.currentWorkspace.workspaceCustomApplication ?? null,
    });
    setCurrentUserWorkspace(mockedUserData.currentUserWorkspace);
    setCurrentWorkspaceMember(mockedUserData.workspaceMember);
    setCurrentWorkspaceMembers(mockedUserData.workspaceMembers);
    setCurrentWorkspaceDeletedMembers([]);
    setAvailableWorkspaces(mockedUserData.availableWorkspaces);
    setIsCurrentUserLoaded(true);
  }, [
    setAvailableWorkspaces,
    setCurrentUser,
    setCurrentUserWorkspace,
    setCurrentWorkspace,
    setCurrentWorkspaceDeletedMembers,
    setCurrentWorkspaceMember,
    setCurrentWorkspaceMembers,
    setIsCurrentUserLoaded,
  ]);

  return null;
};
