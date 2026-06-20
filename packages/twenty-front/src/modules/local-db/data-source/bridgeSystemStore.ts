import {
  BRIDGE_SYSTEM_KEYS,
  getBridgeSystemDexie,
} from '@/local-db/data-source/bridgeSystemDexie';
import {
  ensureBridgeSystemSeeded,
  rebuildBridgeNavForMode,
} from '@/local-db/data-source/bridgeSystemSeed';
import { type WorkspaceMode } from '@/local-db/research/researchObjectModel';
import {
  createConvexSystemStore,
  type ConvexSystemStore,
} from '@/local-db/data-source/createConvexSystemStore';
import { getTwentyDataBridgeConfig } from '@/local-db/twenty-local/getTwentyDataBridgeConfig';

// Public system-store API. Dispatches to either:
//   * the Dexie-backed implementation in this file (mode === 'local'), or
//   * `createConvexSystemStore` talking to `/system-source/*` HTTP actions
//     (mode === 'convex').
//
// The Apollo metadata link (`bridgeMetadataMockLink`) calls these helpers
// regardless of mode, so the dispatch boundary lives here. Each call resolves
// the mode lazily so React → useEffect → store changes pick up the latest
// state without restarting the page.

let cachedConvexStore: ConvexSystemStore | undefined;
let cachedConvexUrl: string | undefined;

const getConvexStore = (convexUrl: string): ConvexSystemStore => {
  if (cachedConvexUrl !== convexUrl) {
    cachedConvexStore = createConvexSystemStore(convexUrl);
    cachedConvexUrl = convexUrl;
  }
  return cachedConvexStore!;
};

const resolveBackend = (): ConvexSystemStore | null => {
  const config = getTwentyDataBridgeConfig();
  if (!config) return null;
  if (config.mode === 'convex' && config.convexUrl) {
    return getConvexStore(config.convexUrl);
  }
  return null; // → fall through to Dexie
};

// --- Dexie-backed implementation (mode === 'local') ---

const withSeed = async <T>(fn: () => Promise<T>): Promise<T> => {
  await ensureBridgeSystemSeeded();
  return fn();
};

const stripBridgeId = <T extends Record<string, unknown>>(record: T): T => {
  if (record.id === BRIDGE_SYSTEM_KEYS.USER) {
    const { id: _id, ...rest } = record;
    return rest as T;
  }
  return record;
};

const rehydrateView = async (
  view: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const db = getBridgeSystemDexie();
  const viewId = view.id as string;
  const [
    viewFields,
    viewFilters,
    viewSorts,
    viewGroups,
    viewFilterGroups,
    viewFieldGroups,
  ] = await Promise.all([
    db.viewField.where({ viewId }).toArray(),
    db.viewFilter.where({ viewId }).toArray(),
    db.viewSort.where({ viewId }).toArray(),
    db.viewGroup.where({ viewId }).toArray(),
    db.viewFilterGroup.where({ viewId }).toArray(),
    db.viewFieldGroup.where({ viewId }).toArray(),
  ]);
  return {
    ...view,
    viewFields,
    viewFilters,
    viewSorts,
    viewGroups,
    viewFilterGroups,
    viewFieldGroups: viewFieldGroups.map((fieldGroup) => ({
      ...fieldGroup,
      viewFields: viewFields.filter(
        (field) =>
          'viewFieldGroupId' in field &&
          field.viewFieldGroupId === fieldGroup.id,
      ),
    })),
  };
};

// --- Public dispatch surface ---

export const getCurrentUser = (): Promise<Record<string, unknown> | null> => {
  const remote = resolveBackend();
  if (remote) return remote.getCurrentUser();
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const stored = await db.user.get(BRIDGE_SYSTEM_KEYS.USER);
    if (!stored) return null;
    const workspace = await db.workspace.toCollection().first();
    const workspaceMember = await db.workspaceMember.toCollection().first();
    return {
      ...stripBridgeId(stored as Record<string, unknown>),
      ...(workspace ? { currentWorkspace: workspace } : {}),
      ...(workspaceMember
        ? { workspaceMember, workspaceMembers: [workspaceMember] }
        : {}),
    };
  });
};

// First-run setup: persist the chosen persona on the workspace singleton and
// rebuild the nav for that mode. Local-bridge only — in convex mode the
// workspace + nav live on the backend, so this is a no-op there for now.
export const setBridgeWorkspaceSetup = async (
  workspaceMode: WorkspaceMode,
): Promise<void> => {
  if (resolveBackend()) return;
  await ensureBridgeSystemSeeded();
  const db = getBridgeSystemDexie();
  const workspace = await db.workspace.toCollection().first();
  if (workspace) {
    await db.workspace.update((workspace as { id: string }).id, {
      workspaceMode,
      setupCompleted: true,
    });
  }
  await rebuildBridgeNavForMode(workspaceMode);
};

export const getPublicWorkspaceDataByDomain = (): Promise<Record<
  string,
  unknown
> | null> => {
  const remote = resolveBackend();
  if (remote) return remote.getPublicWorkspaceDataByDomain();
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const stored = await db.publicWorkspaceData.toCollection().first();
    if (!stored) return null;
    const { subdomain: _subdomain, ...rest } = stored;
    return rest;
  });
};

export const getCurrentWorkspaceMember = (): Promise<Record<
  string,
  unknown
> | null> => {
  const remote = resolveBackend();
  if (remote) return remote.getCurrentWorkspaceMember();
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const stored = await db.workspaceMember.toCollection().first();
    return stored ?? null;
  });
};

export const getViews = (filter?: {
  type?: string;
  key?: string;
  objectMetadataId?: string;
}): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getViews(filter);
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const all = await db.view.toArray();
    const filtered = all.filter(
      (view) =>
        (filter?.type ? view.type === filter.type : true) &&
        (filter?.key ? view.key === filter.key : true) &&
        (filter?.objectMetadataId
          ? view.objectMetadataId === filter.objectMetadataId
          : true),
    );
    return Promise.all(filtered.map((view) => rehydrateView(view)));
  });
};

export const getPageLayouts = (filter?: {
  type?: string;
}): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getPageLayouts(filter);
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const all = await db.pageLayout.toArray();
    return filter?.type
      ? all.filter((layout) => layout.type === filter.type)
      : all;
  });
};

export const getNavigationMenuItems = (): Promise<
  Record<string, unknown>[]
> => {
  const remote = resolveBackend();
  if (remote) return remote.getNavigationMenuItems();
  return withSeed(async () =>
    getBridgeSystemDexie().navigationMenuItem.toArray(),
  );
};

export const getCommandMenuItems = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getCommandMenuItems();
  return withSeed(async () => getBridgeSystemDexie().commandMenuItem.toArray());
};

export const getRoles = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getRoles();
  return withSeed(async () => getBridgeSystemDexie().role.toArray());
};

export const getApiKeys = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getApiKeys();
  return withSeed(async () => getBridgeSystemDexie().apiKey.toArray());
};

export const getApiKey = (
  id: string,
): Promise<Record<string, unknown> | null> => {
  const remote = resolveBackend();
  if (remote) return remote.getApiKey(id);
  return withSeed(async () => {
    const stored = await getBridgeSystemDexie().apiKey.get(id);
    return stored ?? null;
  });
};

export const createApiKey = (input: {
  name: string;
  expiresAt?: string | null;
  roleId?: string | null;
}): Promise<Record<string, unknown>> => {
  const remote = resolveBackend();
  if (remote) return remote.createApiKey(input);
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const role = input.roleId ? await db.role.get(input.roleId) : null;
    const apiKey = {
      __typename: 'ApiKey',
      id: crypto.randomUUID(),
      name: input.name,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      role: role
        ? {
            __typename: 'Role',
            id: (role as { id: string }).id,
            label: (role as { label?: string }).label ?? 'Role',
            icon: (role as { icon?: string }).icon ?? null,
          }
        : null,
    };
    await db.apiKey.put(apiKey);
    return apiKey;
  });
};

export const updateApiKey = (input: {
  id: string;
  name?: string;
  expiresAt?: string | null;
}): Promise<Record<string, unknown> | null> => {
  const remote = resolveBackend();
  if (remote) return remote.updateApiKey(input);
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const existing = await db.apiKey.get(input.id);
    if (!existing) return null;
    const next = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      updatedAt: new Date().toISOString(),
    };
    await db.apiKey.put(next);
    return next;
  });
};

export const revokeApiKey = (
  id: string,
): Promise<Record<string, unknown> | null> => {
  const remote = resolveBackend();
  if (remote) return remote.revokeApiKey(id);
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const existing = await db.apiKey.get(id);
    if (!existing) return null;
    const next = {
      ...existing,
      revokedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.apiKey.put(next);
    return next;
  });
};

export const assignRoleToApiKey = (input: {
  apiKeyId: string;
  roleId: string;
}): Promise<boolean> => {
  const remote = resolveBackend();
  if (remote) return remote.assignRoleToApiKey(input);
  return withSeed(async () => {
    const db = getBridgeSystemDexie();
    const apiKey = await db.apiKey.get(input.apiKeyId);
    const role = await db.role.get(input.roleId);
    if (!apiKey || !role) return false;
    await db.apiKey.put({
      ...apiKey,
      role: {
        __typename: 'Role',
        id: (role as { id: string }).id,
        label: (role as { label?: string }).label ?? 'Role',
        icon: (role as { icon?: string }).icon ?? null,
      },
      updatedAt: new Date().toISOString(),
    });
    return true;
  });
};

export const generateApiKeyToken = (apiKeyId: string): { token: string } => ({
  token: `bridge-mock-token-${apiKeyId}`,
});

export const getWebhooks = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getWebhooks();
  return withSeed(async () => getBridgeSystemDexie().webhook.toArray());
};

export const getWebhook = (
  id: string,
): Promise<Record<string, unknown> | null> => {
  const remote = resolveBackend();
  if (remote) return remote.getWebhook(id);
  return withSeed(async () => {
    const stored = await getBridgeSystemDexie().webhook.get(id);
    return stored ?? null;
  });
};

export const getConnectedAccounts = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getConnectedAccounts();
  return withSeed(async () =>
    getBridgeSystemDexie().connectedAccount.toArray(),
  );
};

export const getMessageChannels = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getMessageChannels();
  return withSeed(async () => getBridgeSystemDexie().messageChannel.toArray());
};

export const getCalendarChannels = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getCalendarChannels();
  return withSeed(async () => getBridgeSystemDexie().calendarChannel.toArray());
};

export const getFrontComponents = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getFrontComponents();
  return withSeed(async () => getBridgeSystemDexie().frontComponent.toArray());
};

export const getLogicFunctions = (): Promise<Record<string, unknown>[]> => {
  const remote = resolveBackend();
  if (remote) return remote.getLogicFunctions();
  return withSeed(async () => getBridgeSystemDexie().logicFunction.toArray());
};
