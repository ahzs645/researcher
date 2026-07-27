import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { getSidePanelCommandMenuDropdownIdFromCommandMenuId } from '@/command-menu-item/utils/getSidePanelCommandMenuDropdownIdFromCommandMenuId';
import { SIDE_PANEL_FOCUS_ID } from '@/side-panel/constants/SidePanelFocusId';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { sidePanelNavigationStackState } from '@/side-panel/states/sidePanelNavigationStackState';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreRecordShowParentViewComponentState } from '@/context-store/states/contextStoreRecordShowParentViewComponentState';
import { getManuscriptComposerPathForRecord } from '@/local-db/research/manuscriptComposerRoute';
import { CoreObjectNameSingular, AppPath } from 'twenty-shared/types';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { getShowPageTabListComponentId } from '@/ui/layout/show-page/utils/getShowPageTabListComponentId';
import { activeTabIdComponentState } from '@/ui/layout/tab-list/states/activeTabIdComponentState';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { useComponentInstanceStateContext } from '@/ui/utilities/state/component-state/hooks/useComponentInstanceStateContext';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { t } from '@lingui/core/macro';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import { IconBrowserMaximize } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { getOsControlSymbol } from 'twenty-ui/utilities';
import { useNavigateApp } from '~/hooks/useNavigateApp';

type RecordShowSidePanelOpenRecordButtonProps = {
  objectNameSingular: string;
  recordId: string;
};

export const RecordShowSidePanelOpenRecordButton = ({
  objectNameSingular,
  recordId,
}: RecordShowSidePanelOpenRecordButtonProps) => {
  const record = useAtomFamilyStateValue(recordStoreFamilyState, recordId) as
    | ObjectRecord
    | null
    | undefined;
  const { closeSidePanelMenu } = useSidePanelMenu();

  const sidePanelPageComponentInstance = useComponentInstanceStateContext(
    SidePanelPageComponentInstanceContext,
  );

  const tabListComponentId = getShowPageTabListComponentId({
    pageId: sidePanelPageComponentInstance?.instanceId,
    targetObjectId: recordId,
  });

  const activeTabId = useAtomComponentStateValue(
    activeTabIdComponentState,
    tabListComponentId,
  );

  const tabListComponentIdInRecordPage = getShowPageTabListComponentId({
    targetObjectId: recordId,
  });

  const setActiveTabId = useSetAtomComponentState(
    activeTabIdComponentState,
    tabListComponentIdInRecordPage,
  );

  const parentViewState = useAtomComponentStateCallbackState(
    contextStoreRecordShowParentViewComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );

  const store = useStore();

  const navigate = useNavigateApp();
  const navigateToPath = useNavigate();

  // Manuscripts are edited in the composer, not on the CRM record page, so
  // "Open" resolves to the composer deep link for that object only.
  const manuscriptComposerPath = getManuscriptComposerPathForRecord({
    objectNameSingular,
    recordId,
  });

  const commandMenuId = useAvailableComponentInstanceIdOrThrow(
    CommandMenuComponentInstanceContext,
  );

  const { closeDropdown } = useCloseDropdown();

  const handleOpenRecord = useCallback(() => {
    if (isDefined(manuscriptComposerPath)) {
      store.set(sidePanelNavigationStackState.atom, []);
      navigateToPath(manuscriptComposerPath);
      closeDropdown(
        getSidePanelCommandMenuDropdownIdFromCommandMenuId(commandMenuId),
      );
      closeSidePanelMenu();
      return;
    }

    const tabIdToOpen =
      activeTabId === 'home'
        ? objectNameSingular === CoreObjectNameSingular.Note ||
          objectNameSingular === CoreObjectNameSingular.Task
          ? 'richText'
          : 'timeline'
        : activeTabId;

    setActiveTabId(tabIdToOpen);

    const parentView = store.get(parentViewState);

    if (
      isDefined(parentView) &&
      parentView.parentViewObjectNameSingular !== objectNameSingular
    ) {
      store.set(parentViewState, undefined);
    }

    store.set(sidePanelNavigationStackState.atom, []);

    navigate(AppPath.RecordShowPage, {
      objectNameSingular,
      objectRecordId: recordId,
    });

    closeDropdown(
      getSidePanelCommandMenuDropdownIdFromCommandMenuId(commandMenuId),
    );

    closeSidePanelMenu();
  }, [
    commandMenuId,
    activeTabId,
    closeSidePanelMenu,
    closeDropdown,
    manuscriptComposerPath,
    navigate,
    navigateToPath,
    objectNameSingular,
    parentViewState,
    recordId,
    setActiveTabId,
    store,
  ]);

  useHotkeysOnFocusedElement({
    keys: ['ctrl+Enter,meta+Enter'],
    callback: handleOpenRecord,
    focusId: SIDE_PANEL_FOCUS_ID,
    dependencies: [handleOpenRecord],
  });

  if (!isDefined(record)) {
    return null;
  }

  return (
    <Button
      title={isDefined(manuscriptComposerPath) ? t`Open in composer` : t`Open`}
      variant="primary"
      accent="blue"
      size="small"
      Icon={IconBrowserMaximize}
      hotkeys={[getOsControlSymbol(), '⏎']}
      onClick={handleOpenRecord}
    />
  );
};
