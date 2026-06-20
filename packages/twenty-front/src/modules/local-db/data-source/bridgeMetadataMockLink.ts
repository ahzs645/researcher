import { ApolloLink, Observable, type FetchResult } from '@apollo/client';

import {
  assignRoleToApiKey,
  createApiKey,
  generateApiKeyToken,
  getApiKey,
  getApiKeys,
  getCalendarChannels,
  getCommandMenuItems,
  getConnectedAccounts,
  getCurrentUser,
  getCurrentWorkspaceMember,
  getFrontComponents,
  getLogicFunctions,
  getMessageChannels,
  getNavigationMenuItems,
  getPageLayouts,
  getPublicWorkspaceDataByDomain,
  getViews,
  getWebhook,
  getWebhooks,
  revokeApiKey,
  updateApiKey,
} from '@/local-db/data-source/bridgeSystemStore';
import { augmentObjectMetadataWithResearch } from '@/local-db/research/bridgeResearchAugmentation';
import { mockedClientConfig } from '~/testing/mock-data/config';
import { mockedMinimalMetadata } from '~/testing/mock-data/generated/metadata/minimal/mock-minimal-metadata';
import { mockedStandardObjectMetadataQueryResult } from '~/testing/mock-data/generated/metadata/objects/mock-objects-metadata';

// Standard 33-object bundle plus the appended research objects. Computed once
// at module load — object metadata is read into the Jotai metadata store at
// boot, so callers must see the same merged payload every time.
const bridgeObjectMetadataQueryResult = augmentObjectMetadataWithResearch(
  mockedStandardObjectMetadataQueryResult as never,
);

// Apollo Link that short-circuits known metadata / auth operations against the
// bridge's persistent system Dexie database (`bridgeSystemStore`). Mutations
// write back to the same store so settings pages mutate state that survives
// reload. Unknown operations are forwarded to `next` (where MSW still handles
// plain HTTP fallbacks). Adding a new operation means registering a handler
// here and, if needed, a table+seed in `bridgeSystemDexie`/`bridgeSystemSeed`.

type Variables = Record<string, unknown>;

type MockHandler = (variables: Variables) => Promise<unknown> | unknown;

const handlers: Record<string, MockHandler> = {
  IntrospectionQuery: () => ({
    __schema: {
      queryType: { name: 'Query' },
      types: [
        {
          kind: 'OBJECT',
          name: 'Query',
          fields: [
            { name: 'name', type: { kind: 'SCALAR', name: 'String' }, args: [] },
          ],
          interfaces: [],
          args: [],
        },
        { kind: 'SCALAR', name: 'String', fields: [], interfaces: [], args: [] },
      ],
      directives: [],
    },
  }),

  GetCurrentUser: async () => ({
    currentUser: await getCurrentUser(),
  }),

  GetPublicWorkspaceDataByDomain: async () => ({
    getPublicWorkspaceDataByDomain: await getPublicWorkspaceDataByDomain(),
  }),

  TrackAnalytics: () => ({
    trackAnalytics: { __typename: 'Analytics', success: true },
  }),

  FindOneWorkspaceMember: async () => ({
    workspaceMember: await getCurrentWorkspaceMember(),
  }),

  MyConnectedAccounts: async () => ({
    myConnectedAccounts: await getConnectedAccounts(),
  }),
  MyMessageChannels: async () => ({
    myMessageChannels: await getMessageChannels(),
  }),
  MyCalendarChannels: async () => ({
    myCalendarChannels: await getCalendarChannels(),
  }),
  FindManyFrontComponents: async () => ({
    frontComponents: await getFrontComponents(),
  }),

  // Object metadata + minimal metadata aren't yet persisted — they're large,
  // static, and read once at boot into the Jotai metadata-store. Stub the
  // Apollo metadata-client return so any caller that still goes through it
  // gets the same payload.
  FindManyObjectMetadataItems: () => bridgeObjectMetadataQueryResult,
  FindMinimalMetadata: () => ({ minimalMetadata: mockedMinimalMetadata }),

  FindAllViews: async () => ({ getViews: await getViews() }),
  FindFieldsWidgetViews: async () => ({
    getViews: await getViews({ type: 'FIELDS_WIDGET' }),
  }),
  FindTableWidgetViews: async () => ({
    getViews: await getViews({ type: 'TABLE_WIDGET' }),
  }),

  FindAllRecordPageLayouts: async () => ({
    getPageLayouts: await getPageLayouts({ type: 'RECORD_PAGE' }),
  }),
  FindManyLogicFunctions: async () => ({
    findManyLogicFunctions: await getLogicFunctions(),
  }),
  FindManyNavigationMenuItems: async () => ({
    navigationMenuItems: await getNavigationMenuItems(),
  }),
  FindManyCommandMenuItems: async () => ({
    commandMenuItems: await getCommandMenuItems(),
  }),

  GetApiKeys: async () => ({ apiKeys: await getApiKeys() }),
  GetApiKey: async (variables) => ({
    apiKey: await getApiKey(
      (variables.input as { id?: string } | undefined)?.id ?? '',
    ),
  }),
  CreateApiKey: async (variables) => ({
    createApiKey: await createApiKey(
      (variables.input as {
        name: string;
        expiresAt?: string | null;
        roleId?: string | null;
      }) ?? { name: 'Untitled' },
    ),
  }),
  UpdateApiKey: async (variables) => {
    const input = variables.input as {
      id: string;
      name?: string;
      expiresAt?: string | null;
    };
    return { updateApiKey: await updateApiKey(input) };
  },
  RevokeApiKey: async (variables) => {
    const input = variables.input as { id: string };
    return { revokeApiKey: await revokeApiKey(input.id) };
  },
  AssignRoleToApiKey: async (variables) => {
    const input = variables.input as { apiKeyId: string; roleId: string };
    return { assignRoleToApiKey: await assignRoleToApiKey(input) };
  },
  GenerateApiKeyToken: (variables) => {
    const input = variables.input as { apiKeyId: string };
    return {
      generateApiKeyToken: {
        __typename: 'ApiKeyToken',
        ...generateApiKeyToken(input.apiKeyId),
      },
    };
  },

  GetWebhooks: async () => ({ webhooks: await getWebhooks() }),
  GetWebhook: async (variables) => ({
    webhook: await getWebhook(
      (variables.input as { id?: string } | undefined)?.id ?? '',
    ),
  }),
};

const CLIENT_CONFIG = {
  ...mockedClientConfig,
  sentry: {
    dsn: null,
    release: null,
    environment: null,
  },
};

export { CLIENT_CONFIG as bridgeClientConfig };

export const bridgeMetadataMockLink = new ApolloLink((operation, forward) => {
  const operationName = operation.operationName;
  const handler = operationName ? handlers[operationName] : undefined;

  if (!handler) {
    return forward(operation);
  }

  return new Observable<FetchResult>((subscriber) => {
    Promise.resolve(handler(operation.variables ?? {}))
      .then((data) => {
        subscriber.next({ data: data as Record<string, unknown> });
        subscriber.complete();
      })
      .catch((error) => {
        subscriber.error(error);
      });
  });
});
