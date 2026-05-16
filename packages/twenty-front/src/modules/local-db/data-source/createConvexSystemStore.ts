// Convex-backed implementation of the bridge's system store interface.
// Mirrors `bridgeSystemStore.ts` shape so `bridgeSystemStore.ts` can dispatch
// to either implementation based on `TwentyDataBridgeMode`. POSTs JSON to
// `/system-source/*` HTTP actions (see `convex/systemSource.ts`).

import { splitViewWithRelated } from '@/metadata-store/utils/splitViewWithRelated';
import { getTwentyBridgeSecret } from '@/local-db/twenty-local/getTwentyBridgeSecret';
import { mockedApiKeys } from '~/testing/mock-data/generated/metadata/api-keys/mock-api-keys-data';
import { mockedBackendCommandMenuItems } from '~/testing/mock-data/command-menu-items';
import { mockedNavigationMenuItems } from '~/testing/mock-data/generated/metadata/navigation-menu-items/mock-navigation-menu-items-data';
import { mockedPublicWorkspaceDataBySubdomain } from '~/testing/mock-data/publicWorkspaceDataBySubdomain';
import { mockedRoles } from '~/testing/mock-data/generated/metadata/roles/mock-roles-data';
import { mockedUserData } from '~/testing/mock-data/users';
import { mockedViews } from '~/testing/mock-data/generated/metadata/views/mock-views-data';

const trimTrailingSlash = (url: string) => url.replace(/\/$/, '');

// Convex's self-hosted backend exposes HTTP actions on a separate port (3211
// by default). The frontend stores the *instance* URL (3210); we translate
// `:3210` → `:3211` for the HTTP namespace.
const deriveHttpUrl = (instanceUrl: string): string => {
  const trimmed = trimTrailingSlash(instanceUrl);
  // Self-hosted: instance on 3210, HTTP on 3211.
  if (trimmed.endsWith(':3210')) {
    return trimmed.replace(/:3210$/, ':3211');
  }
  // Cloud deployments: replace `.convex.cloud` with `.convex.site`.
  return trimmed.replace(/\.convex\.cloud$/, '.convex.site');
};

type ConvexFetcher = (path: string, body: unknown) => Promise<unknown>;

const buildFetcher = (httpUrl: string): ConvexFetcher =>
  async (path, body) => {
    // Resolve the bridge secret per-call so a freshly-injected
    // `?bridgeToken=…` URL param applies immediately without a reload.
    const secret = getTwentyBridgeSecret();
    const response = await fetch(`${httpUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-Bridge-Token': secret } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `Convex system-source ${path} failed: ${response.status} ${response.statusText}`,
      );
    }
    return response.json();
  };

const buildSeedSnapshot = () => {
  const {
    flatViews,
    flatViewFields,
    flatViewFilters,
    flatViewSorts,
    flatViewGroups,
    flatViewFilterGroups,
    flatViewFieldGroups,
  } = splitViewWithRelated(mockedViews);

  return {
    user: { ...mockedUserData, id: mockedUserData.id },
    workspace: mockedUserData.currentWorkspace,
    workspaceMember: mockedUserData.workspaceMember,
    publicWorkspaceData: mockedPublicWorkspaceDataBySubdomain,
    views: flatViews,
    viewFields: flatViewFields,
    viewFilters: flatViewFilters,
    viewSorts: flatViewSorts,
    viewGroups: flatViewGroups,
    viewFilterGroups: flatViewFilterGroups,
    viewFieldGroups: flatViewFieldGroups,
    navigationMenuItems: mockedNavigationMenuItems,
    commandMenuItems: mockedBackendCommandMenuItems,
    roles: mockedRoles,
    apiKeys: mockedApiKeys,
  };
};

let seedPromise: Promise<void> | undefined;

const seedOnce = async (fetcher: ConvexFetcher): Promise<void> => {
  if (seedPromise === undefined) {
    seedPromise = (async () => {
      await fetcher('/system-source/seed', { snapshot: buildSeedSnapshot() });
    })();
  }
  return seedPromise;
};

const stripBridgeUserId = (user: Record<string, unknown> | null) => {
  if (!user) return user;
  // Convex stores the user under the original mocked id; nothing to strip on
  // this side, but we keep the helper symmetric with the Dexie adapter.
  return user;
};

export type ConvexSystemStore = {
  getCurrentUser(): Promise<Record<string, unknown> | null>;
  getPublicWorkspaceDataByDomain(): Promise<Record<string, unknown> | null>;
  getCurrentWorkspaceMember(): Promise<Record<string, unknown> | null>;
  getViews(filter?: {
    type?: string;
    objectMetadataId?: string;
  }): Promise<Record<string, unknown>[]>;
  getPageLayouts(filter?: {
    type?: string;
  }): Promise<Record<string, unknown>[]>;
  getNavigationMenuItems(): Promise<Record<string, unknown>[]>;
  getCommandMenuItems(): Promise<Record<string, unknown>[]>;
  getRoles(): Promise<Record<string, unknown>[]>;
  getApiKeys(): Promise<Record<string, unknown>[]>;
  getApiKey(id: string): Promise<Record<string, unknown> | null>;
  createApiKey(input: {
    name: string;
    expiresAt?: string | null;
    roleId?: string | null;
  }): Promise<Record<string, unknown>>;
  updateApiKey(input: {
    id: string;
    name?: string;
    expiresAt?: string | null;
  }): Promise<Record<string, unknown> | null>;
  revokeApiKey(id: string): Promise<Record<string, unknown> | null>;
  assignRoleToApiKey(input: {
    apiKeyId: string;
    roleId: string;
  }): Promise<boolean>;
  getWebhooks(): Promise<Record<string, unknown>[]>;
  getWebhook(id: string): Promise<Record<string, unknown> | null>;
  getConnectedAccounts(): Promise<Record<string, unknown>[]>;
  getMessageChannels(): Promise<Record<string, unknown>[]>;
  getCalendarChannels(): Promise<Record<string, unknown>[]>;
  getFrontComponents(): Promise<Record<string, unknown>[]>;
  getLogicFunctions(): Promise<Record<string, unknown>[]>;
};

export const createConvexSystemStore = (
  convexUrl: string,
): ConvexSystemStore => {
  const httpUrl = deriveHttpUrl(convexUrl);
  const fetcher = buildFetcher(httpUrl);

  const withSeed = async <T>(fn: () => Promise<T>): Promise<T> => {
    await seedOnce(fetcher);
    return fn();
  };

  return {
    getCurrentUser: () =>
      withSeed(async () =>
        stripBridgeUserId(
          (await fetcher('/system-source/getCurrentUser', {})) as
            | Record<string, unknown>
            | null,
        ),
      ),
    getPublicWorkspaceDataByDomain: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getPublicWorkspaceDataByDomain', {})) as
          | Record<string, unknown>
          | null,
      ),
    getCurrentWorkspaceMember: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getCurrentWorkspaceMember', {})) as
          | Record<string, unknown>
          | null,
      ),
    getViews: (filter) =>
      withSeed(async () =>
        (await fetcher('/system-source/getViews', filter ?? {})) as Record<
          string,
          unknown
        >[],
      ),
    getPageLayouts: (filter) =>
      withSeed(async () =>
        (await fetcher('/system-source/getPageLayouts', filter ?? {})) as Record<
          string,
          unknown
        >[],
      ),
    getNavigationMenuItems: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getNavigationMenuItems', {})) as Record<
          string,
          unknown
        >[],
      ),
    getCommandMenuItems: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getCommandMenuItems', {})) as Record<
          string,
          unknown
        >[],
      ),
    getRoles: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getRoles', {})) as Record<
          string,
          unknown
        >[],
      ),
    getApiKeys: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getApiKeys', {})) as Record<
          string,
          unknown
        >[],
      ),
    getApiKey: (id) =>
      withSeed(async () =>
        (await fetcher('/system-source/getApiKey', { id })) as Record<
          string,
          unknown
        > | null,
      ),
    createApiKey: (input) =>
      withSeed(async () =>
        (await fetcher('/system-source/createApiKey', input)) as Record<
          string,
          unknown
        >,
      ),
    updateApiKey: (input) =>
      withSeed(async () =>
        (await fetcher('/system-source/updateApiKey', input)) as Record<
          string,
          unknown
        > | null,
      ),
    revokeApiKey: (id) =>
      withSeed(async () =>
        (await fetcher('/system-source/revokeApiKey', { id })) as Record<
          string,
          unknown
        > | null,
      ),
    assignRoleToApiKey: (input) =>
      withSeed(async () =>
        (await fetcher(
          '/system-source/assignRoleToApiKey',
          input,
        )) as boolean,
      ),
    getWebhooks: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getWebhooks', {})) as Record<
          string,
          unknown
        >[],
      ),
    getWebhook: (id) =>
      withSeed(async () =>
        (await fetcher('/system-source/getWebhook', { id })) as Record<
          string,
          unknown
        > | null,
      ),
    getConnectedAccounts: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getConnectedAccounts', {})) as Record<
          string,
          unknown
        >[],
      ),
    getMessageChannels: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getMessageChannels', {})) as Record<
          string,
          unknown
        >[],
      ),
    getCalendarChannels: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getCalendarChannels', {})) as Record<
          string,
          unknown
        >[],
      ),
    getFrontComponents: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getFrontComponents', {})) as Record<
          string,
          unknown
        >[],
      ),
    getLogicFunctions: () =>
      withSeed(async () =>
        (await fetcher('/system-source/getLogicFunctions', {})) as Record<
          string,
          unknown
        >[],
      ),
  };
};

export const __resetConvexSystemSeedForTests = (): void => {
  seedPromise = undefined;
};
