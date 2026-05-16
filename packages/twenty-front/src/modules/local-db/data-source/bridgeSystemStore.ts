import {
  BRIDGE_SYSTEM_KEYS,
  getBridgeSystemDexie,
} from '@/local-db/data-source/bridgeSystemDexie';
import { ensureBridgeSystemSeeded } from '@/local-db/data-source/bridgeSystemSeed';

// Async helpers over the bridge's system Dexie database. The metadata
// Apollo Link calls these to satisfy each operation, replacing what used to
// be hardcoded mock returns. Every helper awaits `ensureBridgeSystemSeeded()`
// first so callers don't need to coordinate the one-shot seed themselves.

const withSeed = async <T>(fn: () => Promise<T>): Promise<T> => {
  await ensureBridgeSystemSeeded();
  return fn();
};

const stripBridgeId = <T extends Record<string, unknown>>(record: T): T => {
  // The user / workspace singletons store under a stable bridge id (e.g.
  // `__bridge_user__`) so the resolver can find them without parameters.
  // Twenty's UI expects the original uuid the User had in production, so we
  // strip the sentinel here.
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
  const [viewFields, viewFilters, viewSorts, viewGroups, viewFilterGroups, viewFieldGroups] =
    await Promise.all([
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
          'viewFieldGroupId' in field && field.viewFieldGroupId === fieldGroup.id,
      ),
    })),
  };
};

export const getCurrentUser = (): Promise<Record<string, unknown> | null> =>
  withSeed(async () => {
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

export const getPublicWorkspaceDataByDomain = (): Promise<
  Record<string, unknown> | null
> =>
  withSeed(async () => {
    const db = getBridgeSystemDexie();
    const stored = await db.publicWorkspaceData.toCollection().first();
    if (!stored) return null;
    const { subdomain: _subdomain, ...rest } = stored;
    return rest;
  });

export const getCurrentWorkspaceMember = (): Promise<
  Record<string, unknown> | null
> =>
  withSeed(async () => {
    const db = getBridgeSystemDexie();
    const stored = await db.workspaceMember.toCollection().first();
    return stored ?? null;
  });

export const getViews = (filter?: {
  type?: string;
  key?: string;
  objectMetadataId?: string;
}): Promise<Record<string, unknown>[]> =>
  withSeed(async () => {
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

export const getPageLayouts = (filter?: {
  type?: string;
}): Promise<Record<string, unknown>[]> =>
  withSeed(async () => {
    const db = getBridgeSystemDexie();
    const all = await db.pageLayout.toArray();
    return filter?.type
      ? all.filter((layout) => layout.type === filter.type)
      : all;
  });

export const getNavigationMenuItems = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().navigationMenuItem.toArray());

export const getCommandMenuItems = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().commandMenuItem.toArray());

export const getRoles = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().role.toArray());

export const getApiKeys = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().apiKey.toArray());

export const getApiKey = (id: string): Promise<Record<string, unknown> | null> =>
  withSeed(async () => {
    const stored = await getBridgeSystemDexie().apiKey.get(id);
    return stored ?? null;
  });

export const createApiKey = (input: {
  name: string;
  expiresAt?: string | null;
  roleId?: string | null;
}): Promise<Record<string, unknown>> =>
  withSeed(async () => {
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

export const updateApiKey = (input: {
  id: string;
  name?: string;
  expiresAt?: string | null;
}): Promise<Record<string, unknown> | null> =>
  withSeed(async () => {
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

export const revokeApiKey = (id: string): Promise<Record<string, unknown> | null> =>
  withSeed(async () => {
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

export const assignRoleToApiKey = (input: {
  apiKeyId: string;
  roleId: string;
}): Promise<boolean> =>
  withSeed(async () => {
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

export const generateApiKeyToken = (apiKeyId: string): { token: string } => ({
  // The bridge can't sign tokens; emit a stable opaque string so the UI shows
  // a value to copy and the user knows the key was generated.
  token: `bridge-mock-token-${apiKeyId}`,
});

export const getWebhooks = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().webhook.toArray());

export const getWebhook = (id: string): Promise<Record<string, unknown> | null> =>
  withSeed(async () => {
    const stored = await getBridgeSystemDexie().webhook.get(id);
    return stored ?? null;
  });

export const getConnectedAccounts = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().connectedAccount.toArray());

export const getMessageChannels = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().messageChannel.toArray());

export const getCalendarChannels = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().calendarChannel.toArray());

export const getFrontComponents = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().frontComponent.toArray());

export const getLogicFunctions = (): Promise<Record<string, unknown>[]> =>
  withSeed(async () => getBridgeSystemDexie().logicFunction.toArray());
