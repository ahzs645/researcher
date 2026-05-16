// Convex parity for the bridge's persistent metadata store. Mirrors the
// Dexie-backed `bridgeSystemStore` on the frontend, surfacing the same async
// helpers via HTTP actions. Each table stores `{ id, body }` where `body` is
// the original mock object — that keeps the schema loose and avoids modelling
// every Twenty type field-by-field on the Convex side.
//
// Pattern matches `dataSource.ts`: `*Impl` are internalQuery / internalMutation
// holding the db access; `*Action` are httpAction wrappers that parse JSON
// and delegate. Records-side and system-side share `/data-source/*` and
// `/system-source/*` route prefixes respectively.

import { v } from 'convex/values';

import { httpAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { checkBridgeAuth, okResponse } from './bridgeAuth';

const PUBLIC_WORKSPACE_SUBDOMAIN_KEY = '__bridge_public_workspace__';

type LooseRecord = { id: string; body: Record<string, unknown> };
type ConvexReader = {
  query: (name: string) => {
    withIndex: (
      indexName: string,
      cb: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => { collect: () => Promise<LooseRecord[]>; first: () => Promise<LooseRecord | null> };
    filter: (
      cb: (q: unknown) => unknown,
    ) => { collect: () => Promise<LooseRecord[]> };
    collect: () => Promise<LooseRecord[]>;
    first: () => Promise<LooseRecord | null>;
  };
};
type ConvexWriter = ConvexReader & {
  insert: (name: string, value: unknown) => Promise<string>;
  replace: (id: string, value: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

const firstBody = async (
  db: ConvexReader,
  tableName: string,
): Promise<Record<string, unknown> | null> => {
  const row = await db.query(tableName).first();
  return row?.body ?? null;
};

const allBodies = async (
  db: ConvexReader,
  tableName: string,
): Promise<Record<string, unknown>[]> => {
  const rows = await db.query(tableName).collect();
  return rows.map((row) => row.body);
};

const bodiesByIndex = async (
  db: ConvexReader,
  tableName: string,
  indexName: string,
  columnName: string,
  value: unknown,
): Promise<Record<string, unknown>[]> => {
  const rows = await db
    .query(tableName)
    .withIndex(indexName, (q) => q.eq(columnName, value))
    .collect();
  return rows.map((row) => row.body);
};

const findById = async (
  db: ConvexReader,
  tableName: string,
  id: string,
): Promise<LooseRecord | null> => {
  return db
    .query(tableName)
    .withIndex('by_external_id', (q) => q.eq('id', id))
    .first();
};

// --- Internal queries (read paths) ---

export const getCurrentUserImpl = internalQuery({
  args: {},
  handler: async (ctx) => {
    const reader = ctx.db as unknown as ConvexReader;
    const user = await firstBody(reader, 'bridgeUser');
    if (!user) return null;
    const workspace = await firstBody(reader, 'bridgeWorkspace');
    const workspaceMember = await firstBody(reader, 'bridgeWorkspaceMember');
    return {
      ...user,
      ...(workspace ? { currentWorkspace: workspace } : {}),
      ...(workspaceMember
        ? { workspaceMember, workspaceMembers: [workspaceMember] }
        : {}),
    };
  },
});

export const getPublicWorkspaceDataByDomainImpl = internalQuery({
  args: {},
  handler: async (ctx) => {
    const reader = ctx.db as unknown as ConvexReader;
    const row = await reader
      .query('bridgePublicWorkspaceData')
      .withIndex('by_subdomain', (q) =>
        q.eq('subdomain', PUBLIC_WORKSPACE_SUBDOMAIN_KEY),
      )
      .first();
    return (row as { body?: Record<string, unknown> } | null)?.body ?? null;
  },
});

export const getCurrentWorkspaceMemberImpl = internalQuery({
  args: {},
  handler: async (ctx) =>
    firstBody(ctx.db as unknown as ConvexReader, 'bridgeWorkspaceMember'),
});

export const getViewsImpl = internalQuery({
  args: {
    type: v.optional(v.string()),
    objectMetadataId: v.optional(v.string()),
  },
  handler: async (ctx, payload) => {
    const reader = ctx.db as unknown as ConvexReader;
    const rows = await reader.query('bridgeView').collect();
    const filtered = rows.filter(
      (row) =>
        (payload.type
          ? (row as unknown as { type?: string }).type === payload.type
          : true) &&
        (payload.objectMetadataId
          ? (row as unknown as { objectMetadataId?: string }).objectMetadataId ===
            payload.objectMetadataId
          : true),
    );
    const result: Record<string, unknown>[] = [];
    for (const viewRow of filtered) {
      const viewId = viewRow.id;
      const [viewFields, viewFilters, viewSorts, viewGroups, viewFilterGroups, viewFieldGroups] =
        await Promise.all([
          bodiesByIndex(reader, 'bridgeViewField', 'by_viewId', 'viewId', viewId),
          bodiesByIndex(reader, 'bridgeViewFilter', 'by_viewId', 'viewId', viewId),
          bodiesByIndex(reader, 'bridgeViewSort', 'by_viewId', 'viewId', viewId),
          bodiesByIndex(reader, 'bridgeViewGroup', 'by_viewId', 'viewId', viewId),
          bodiesByIndex(reader, 'bridgeViewFilterGroup', 'by_viewId', 'viewId', viewId),
          bodiesByIndex(reader, 'bridgeViewFieldGroup', 'by_viewId', 'viewId', viewId),
        ]);
      result.push({
        ...viewRow.body,
        viewFields,
        viewFilters,
        viewSorts,
        viewGroups,
        viewFilterGroups,
        viewFieldGroups: viewFieldGroups.map((group) => ({
          ...group,
          viewFields: viewFields.filter(
            (field) =>
              typeof field === 'object' &&
              field !== null &&
              'viewFieldGroupId' in field &&
              (field as { viewFieldGroupId?: string }).viewFieldGroupId ===
                (group as { id?: string }).id,
          ),
        })),
      });
    }
    return result;
  },
});

export const getPageLayoutsImpl = internalQuery({
  args: { type: v.optional(v.string()) },
  handler: async (ctx, payload) => {
    const reader = ctx.db as unknown as ConvexReader;
    if (payload.type) {
      const rows = await reader
        .query('bridgePageLayout')
        .withIndex('by_type', (q) => q.eq('type', payload.type))
        .collect();
      return rows.map((row) => row.body);
    }
    return allBodies(reader, 'bridgePageLayout');
  },
});

const simpleListQuery = (tableName: string) =>
  internalQuery({
    args: {},
    handler: async (ctx) =>
      allBodies(ctx.db as unknown as ConvexReader, tableName),
  });

export const getNavigationMenuItemsImpl = simpleListQuery(
  'bridgeNavigationMenuItem',
);
export const getCommandMenuItemsImpl = simpleListQuery('bridgeCommandMenuItem');
export const getRolesImpl = simpleListQuery('bridgeRole');
export const getApiKeysImpl = simpleListQuery('bridgeApiKey');
export const getWebhooksImpl = simpleListQuery('bridgeWebhook');
export const getConnectedAccountsImpl = simpleListQuery(
  'bridgeConnectedAccount',
);
export const getMessageChannelsImpl = simpleListQuery('bridgeMessageChannel');
export const getCalendarChannelsImpl = simpleListQuery('bridgeCalendarChannel');
export const getFrontComponentsImpl = simpleListQuery('bridgeFrontComponent');
export const getLogicFunctionsImpl = simpleListQuery('bridgeLogicFunction');

export const getApiKeyImpl = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, payload) => {
    const row = await findById(
      ctx.db as unknown as ConvexReader,
      'bridgeApiKey',
      payload.id,
    );
    return row?.body ?? null;
  },
});

export const getWebhookImpl = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, payload) => {
    const row = await findById(
      ctx.db as unknown as ConvexReader,
      'bridgeWebhook',
      payload.id,
    );
    return row?.body ?? null;
  },
});

// --- Internal mutations (write paths) ---

export const seedImpl = internalMutation({
  args: { snapshot: v.any() },
  handler: async (ctx, payload) => {
    const writer = ctx.db as unknown as ConvexWriter;
    const reader = writer as ConvexReader;

    const existingUser = await reader.query('bridgeUser').first();
    if (existingUser) return { seeded: false };

    const snapshot = payload.snapshot as {
      user?: Record<string, unknown> & { id: string };
      workspace?: Record<string, unknown> & { id: string };
      workspaceMember?: (Record<string, unknown> & { id: string }) | null;
      publicWorkspaceData?: Record<string, unknown>;
      views?: { id: string; type?: string; objectMetadataId?: string }[];
      viewFields?: { id: string; viewId: string }[];
      viewFilters?: { id: string; viewId: string }[];
      viewSorts?: { id: string; viewId: string }[];
      viewGroups?: { id: string; viewId: string }[];
      viewFilterGroups?: { id: string; viewId?: string }[];
      viewFieldGroups?: { id: string; viewId?: string }[];
      navigationMenuItems?: { id: string; applicationId?: string }[];
      commandMenuItems?: { id: string }[];
      roles?: { id: string }[];
      apiKeys?: { id: string }[];
    };

    if (snapshot.user) {
      await writer.insert('bridgeUser', {
        id: snapshot.user.id,
        body: snapshot.user,
      });
    }
    if (snapshot.workspace) {
      await writer.insert('bridgeWorkspace', {
        id: snapshot.workspace.id,
        body: snapshot.workspace,
      });
    }
    if (snapshot.workspaceMember) {
      await writer.insert('bridgeWorkspaceMember', {
        id: snapshot.workspaceMember.id,
        body: snapshot.workspaceMember,
      });
    }
    if (snapshot.publicWorkspaceData) {
      await writer.insert('bridgePublicWorkspaceData', {
        subdomain: PUBLIC_WORKSPACE_SUBDOMAIN_KEY,
        body: snapshot.publicWorkspaceData,
      });
    }
    for (const view of snapshot.views ?? []) {
      await writer.insert('bridgeView', {
        id: view.id,
        body: view,
        type: view.type,
        objectMetadataId: view.objectMetadataId,
      });
    }
    for (const viewField of snapshot.viewFields ?? []) {
      await writer.insert('bridgeViewField', {
        id: viewField.id,
        body: viewField,
        viewId: viewField.viewId,
      });
    }
    for (const viewFilter of snapshot.viewFilters ?? []) {
      await writer.insert('bridgeViewFilter', {
        id: viewFilter.id,
        body: viewFilter,
        viewId: viewFilter.viewId,
      });
    }
    for (const viewSort of snapshot.viewSorts ?? []) {
      await writer.insert('bridgeViewSort', {
        id: viewSort.id,
        body: viewSort,
        viewId: viewSort.viewId,
      });
    }
    for (const viewGroup of snapshot.viewGroups ?? []) {
      await writer.insert('bridgeViewGroup', {
        id: viewGroup.id,
        body: viewGroup,
        viewId: viewGroup.viewId,
      });
    }
    for (const viewFilterGroup of snapshot.viewFilterGroups ?? []) {
      await writer.insert('bridgeViewFilterGroup', {
        id: viewFilterGroup.id,
        body: viewFilterGroup,
        viewId: viewFilterGroup.viewId,
      });
    }
    for (const viewFieldGroup of snapshot.viewFieldGroups ?? []) {
      await writer.insert('bridgeViewFieldGroup', {
        id: viewFieldGroup.id,
        body: viewFieldGroup,
        viewId: viewFieldGroup.viewId,
      });
    }
    for (const item of snapshot.navigationMenuItems ?? []) {
      await writer.insert('bridgeNavigationMenuItem', {
        id: item.id,
        body: item,
        applicationId: item.applicationId,
      });
    }
    for (const item of snapshot.commandMenuItems ?? []) {
      await writer.insert('bridgeCommandMenuItem', {
        id: item.id,
        body: item,
      });
    }
    for (const role of snapshot.roles ?? []) {
      await writer.insert('bridgeRole', { id: role.id, body: role });
    }
    for (const apiKey of snapshot.apiKeys ?? []) {
      await writer.insert('bridgeApiKey', { id: apiKey.id, body: apiKey });
    }
    return { seeded: true };
  },
});

export const createApiKeyImpl = internalMutation({
  args: {
    name: v.string(),
    expiresAt: v.optional(v.union(v.string(), v.null())),
    roleId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, payload) => {
    const writer = ctx.db as unknown as ConvexWriter;
    const reader = writer as ConvexReader;
    const role = payload.roleId
      ? await findById(reader, 'bridgeRole', payload.roleId)
      : null;
    const id = crypto.randomUUID();
    const apiKey = {
      __typename: 'ApiKey',
      id,
      name: payload.name,
      expiresAt: payload.expiresAt ?? null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      role: role
        ? {
            __typename: 'Role',
            id: role.id,
            label: (role.body as { label?: string }).label ?? 'Role',
            icon: (role.body as { icon?: string }).icon ?? null,
          }
        : null,
    };
    await writer.insert('bridgeApiKey', { id, body: apiKey });
    return apiKey;
  },
});

export const updateApiKeyImpl = internalMutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, payload) => {
    const writer = ctx.db as unknown as ConvexWriter;
    const row = await findById(writer as ConvexReader, 'bridgeApiKey', payload.id);
    if (!row) return null;
    const next = {
      ...row.body,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.expiresAt !== undefined
        ? { expiresAt: payload.expiresAt }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    await writer.replace((row as unknown as { _id: string })._id, {
      id: row.id,
      body: next,
    });
    return next;
  },
});

export const revokeApiKeyImpl = internalMutation({
  args: { id: v.string() },
  handler: async (ctx, payload) => {
    const writer = ctx.db as unknown as ConvexWriter;
    const row = await findById(writer as ConvexReader, 'bridgeApiKey', payload.id);
    if (!row) return null;
    const next = {
      ...row.body,
      revokedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writer.replace((row as unknown as { _id: string })._id, {
      id: row.id,
      body: next,
    });
    return next;
  },
});

export const assignRoleToApiKeyImpl = internalMutation({
  args: { apiKeyId: v.string(), roleId: v.string() },
  handler: async (ctx, payload) => {
    const writer = ctx.db as unknown as ConvexWriter;
    const reader = writer as ConvexReader;
    const apiKeyRow = await findById(reader, 'bridgeApiKey', payload.apiKeyId);
    const roleRow = await findById(reader, 'bridgeRole', payload.roleId);
    if (!apiKeyRow || !roleRow) return false;
    const next = {
      ...apiKeyRow.body,
      role: {
        __typename: 'Role',
        id: roleRow.id,
        label: (roleRow.body as { label?: string }).label ?? 'Role',
        icon: (roleRow.body as { icon?: string }).icon ?? null,
      },
      updatedAt: new Date().toISOString(),
    };
    await writer.replace((apiKeyRow as unknown as { _id: string })._id, {
      id: apiKeyRow.id,
      body: next,
    });
    return true;
  },
});

// --- HTTP actions ---

// Local alias for the per-action ok-helper so the auth-gated call sites stay
// tight. CORS + origin echoing live in `bridgeAuth.okResponse`.
const ok = (request: Request, body: unknown) => okResponse(request, body);

const readBodyOrEmpty = async (request: Request) => {
  const contentLength = request.headers.get('content-length');
  if (contentLength && contentLength !== '0') {
    return (await request.json()) as Record<string, unknown>;
  }
  return {} as Record<string, unknown>;
};

export const seedAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = await request.json();
  return ok(request, await ctx.runMutation(internal.systemSource.seedImpl, body));
});

export const getCurrentUserAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, await ctx.runQuery(internal.systemSource.getCurrentUserImpl, {}));
});

export const getPublicWorkspaceDataByDomainAction = httpAction(
  async (ctx, request) => {
    const authError = checkBridgeAuth(request);
    if (authError) return authError;
    await readBodyOrEmpty(request);
    return ok(request, 
      await ctx.runQuery(
        internal.systemSource.getPublicWorkspaceDataByDomainImpl,
        {},
      ),
    );
  },
);

export const getCurrentWorkspaceMemberAction = httpAction(
  async (ctx, request) => {
    const authError = checkBridgeAuth(request);
    if (authError) return authError;
    await readBodyOrEmpty(request);
    return ok(request, 
      await ctx.runQuery(
        internal.systemSource.getCurrentWorkspaceMemberImpl,
        {},
      ),
    );
  },
);

export const getViewsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = (await readBodyOrEmpty(request)) as {
    type?: string;
    objectMetadataId?: string;
  };
  return ok(request, await ctx.runQuery(internal.systemSource.getViewsImpl, body));
});

export const getPageLayoutsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = (await readBodyOrEmpty(request)) as { type?: string };
  return ok(request, await ctx.runQuery(internal.systemSource.getPageLayoutsImpl, body));
});

export const getNavigationMenuItemsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getNavigationMenuItemsImpl, {}),
  );
});
export const getCommandMenuItemsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getCommandMenuItemsImpl, {}),
  );
});
export const getRolesAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, await ctx.runQuery(internal.systemSource.getRolesImpl, {}));
});
export const getApiKeysAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, await ctx.runQuery(internal.systemSource.getApiKeysImpl, {}));
});
export const getWebhooksAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, await ctx.runQuery(internal.systemSource.getWebhooksImpl, {}));
});
export const getConnectedAccountsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getConnectedAccountsImpl, {}),
  );
});
export const getMessageChannelsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getMessageChannelsImpl, {}),
  );
});
export const getCalendarChannelsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getCalendarChannelsImpl, {}),
  );
});
export const getFrontComponentsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getFrontComponentsImpl, {}),
  );
});
export const getLogicFunctionsAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  await readBodyOrEmpty(request);
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getLogicFunctionsImpl, {}),
  );
});

export const getApiKeyAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = (await readBodyOrEmpty(request)) as { id?: string };
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getApiKeyImpl, {
      id: body.id ?? '',
    }),
  );
});

export const getWebhookAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = (await readBodyOrEmpty(request)) as { id?: string };
  return ok(request, 
    await ctx.runQuery(internal.systemSource.getWebhookImpl, {
      id: body.id ?? '',
    }),
  );
});

export const createApiKeyAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = await request.json();
  return ok(request, await ctx.runMutation(internal.systemSource.createApiKeyImpl, body));
});

export const updateApiKeyAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = await request.json();
  return ok(request, await ctx.runMutation(internal.systemSource.updateApiKeyImpl, body));
});

export const revokeApiKeyAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = await request.json();
  return ok(request, await ctx.runMutation(internal.systemSource.revokeApiKeyImpl, body));
});

export const assignRoleToApiKeyAction = httpAction(async (ctx, request) => {
  const authError = checkBridgeAuth(request);
  if (authError) return authError;
  const body = await request.json();
  return ok(request, 
    await ctx.runMutation(internal.systemSource.assignRoleToApiKeyImpl, body),
  );
});
