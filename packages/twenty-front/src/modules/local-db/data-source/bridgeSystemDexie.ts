import Dexie, { type Table } from 'dexie';

// Persistent Dexie database for the bridge's "system" entities — everything
// Apollo's metadata client asks about (the User, Workspace, Views, API Keys,
// Webhooks, …) that isn't a user-facing record. Tables hold flat JSON copies
// of Twenty's mocked data; the mock link reads from these tables instead of
// hardcoding mock returns. Mutations write back, so settings pages mutate
// state that survives reload.
//
// We keep this database separate from the records Dexie (`twenty-bridge-data-
// source`) so the two concerns can evolve independently — adding a new
// system entity here doesn't trigger Dexie schema versioning on the records
// side, and vice versa.

export const BRIDGE_SYSTEM_DEXIE_NAME = 'twenty-bridge-system-data-source';

const SINGLETON_USER_ID = '__bridge_user__';
const SINGLETON_WORKSPACE_ID = '__bridge_workspace__';
const SINGLETON_PUBLIC_WORKSPACE_DOMAIN = '__bridge_public_workspace__';

type WithId = { id: string };

type UserRecord = WithId & Record<string, unknown>;
type WorkspaceRecord = WithId & Record<string, unknown>;
type WorkspaceMemberRecord = WithId & Record<string, unknown>;
type ViewRecord = WithId & {
  objectMetadataId?: string;
  type?: string;
  key?: string | null;
  [field: string]: unknown;
};
type ViewFieldRecord = WithId & { viewId: string; [field: string]: unknown };
type ViewFilterRecord = WithId & { viewId: string; [field: string]: unknown };
type ViewSortRecord = WithId & { viewId: string; [field: string]: unknown };
type ViewGroupRecord = WithId & { viewId: string; [field: string]: unknown };
type ViewFilterGroupRecord = WithId & {
  viewId?: string;
  [field: string]: unknown;
};
type ViewFieldGroupRecord = WithId & {
  viewId?: string;
  [field: string]: unknown;
};
type PageLayoutRecord = WithId & { [field: string]: unknown };
type PageLayoutTabRecord = WithId & {
  pageLayoutId?: string;
  [field: string]: unknown;
};
type PageLayoutWidgetRecord = WithId & {
  pageLayoutTabId?: string;
  [field: string]: unknown;
};
type NavigationMenuItemRecord = WithId & {
  applicationId?: string;
  [field: string]: unknown;
};
type CommandMenuItemRecord = WithId & Record<string, unknown>;
type RoleRecord = WithId & Record<string, unknown>;
type ApiKeyRecord = WithId & Record<string, unknown>;
type WebhookRecord = WithId & Record<string, unknown>;
type PublicWorkspaceDataRecord = {
  subdomain: string;
  [field: string]: unknown;
};
type ConnectedAccountRecord = WithId & Record<string, unknown>;
type MessageChannelRecord = WithId & Record<string, unknown>;
type CalendarChannelRecord = WithId & Record<string, unknown>;
type FrontComponentRecord = WithId & Record<string, unknown>;
type LogicFunctionRecord = WithId & Record<string, unknown>;

class BridgeSystemDexie extends Dexie {
  user!: Table<UserRecord, string>;
  workspace!: Table<WorkspaceRecord, string>;
  workspaceMember!: Table<WorkspaceMemberRecord, string>;
  view!: Table<ViewRecord, string>;
  viewField!: Table<ViewFieldRecord, string>;
  viewFilter!: Table<ViewFilterRecord, string>;
  viewSort!: Table<ViewSortRecord, string>;
  viewGroup!: Table<ViewGroupRecord, string>;
  viewFilterGroup!: Table<ViewFilterGroupRecord, string>;
  viewFieldGroup!: Table<ViewFieldGroupRecord, string>;
  pageLayout!: Table<PageLayoutRecord, string>;
  pageLayoutTab!: Table<PageLayoutTabRecord, string>;
  pageLayoutWidget!: Table<PageLayoutWidgetRecord, string>;
  navigationMenuItem!: Table<NavigationMenuItemRecord, string>;
  commandMenuItem!: Table<CommandMenuItemRecord, string>;
  role!: Table<RoleRecord, string>;
  apiKey!: Table<ApiKeyRecord, string>;
  webhook!: Table<WebhookRecord, string>;
  publicWorkspaceData!: Table<PublicWorkspaceDataRecord, string>;
  connectedAccount!: Table<ConnectedAccountRecord, string>;
  messageChannel!: Table<MessageChannelRecord, string>;
  calendarChannel!: Table<CalendarChannelRecord, string>;
  frontComponent!: Table<FrontComponentRecord, string>;
  logicFunction!: Table<LogicFunctionRecord, string>;

  constructor() {
    super(BRIDGE_SYSTEM_DEXIE_NAME);
    // `id` is always the primary key; secondary indexes mirror the lookups the
    // mock link does (view by type, viewField by viewId, etc.).
    this.version(1).stores({
      user: 'id',
      workspace: 'id',
      workspaceMember: 'id',
      view: 'id, objectMetadataId, type, key',
      viewField: 'id, viewId',
      viewFilter: 'id, viewId',
      viewSort: 'id, viewId',
      viewGroup: 'id, viewId',
      viewFilterGroup: 'id, viewId',
      viewFieldGroup: 'id, viewId',
      pageLayout: 'id, type',
      pageLayoutTab: 'id, pageLayoutId',
      pageLayoutWidget: 'id, pageLayoutTabId',
      navigationMenuItem: 'id, applicationId',
      commandMenuItem: 'id',
      role: 'id',
      apiKey: 'id',
      webhook: 'id',
      publicWorkspaceData: 'subdomain',
      connectedAccount: 'id',
      messageChannel: 'id',
      calendarChannel: 'id',
      frontComponent: 'id',
      logicFunction: 'id',
    });
  }
}

let cachedDb: BridgeSystemDexie | undefined;

export const getBridgeSystemDexie = (): BridgeSystemDexie => {
  if (cachedDb === undefined) {
    cachedDb = new BridgeSystemDexie();
  }
  return cachedDb;
};

// Singleton lookups: the bridge has exactly one "current" user / workspace, so
// we hold them in single-row tables keyed by a stable sentinel id.
export const BRIDGE_SYSTEM_KEYS = {
  USER: SINGLETON_USER_ID,
  WORKSPACE: SINGLETON_WORKSPACE_ID,
  PUBLIC_WORKSPACE_DOMAIN: SINGLETON_PUBLIC_WORKSPACE_DOMAIN,
} as const;
