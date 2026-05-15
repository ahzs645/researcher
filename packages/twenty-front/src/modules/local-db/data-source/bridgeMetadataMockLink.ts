import { ApolloLink, Observable, type FetchResult } from '@apollo/client';

import { mockedClientConfig } from '~/testing/mock-data/config';
import { mockedBackendCommandMenuItems } from '~/testing/mock-data/command-menu-items';
import { mockedApiKeys } from '~/testing/mock-data/generated/metadata/api-keys/mock-api-keys-data';
import { mockedMinimalMetadata } from '~/testing/mock-data/generated/metadata/minimal/mock-minimal-metadata';
import { mockedNavigationMenuItems } from '~/testing/mock-data/generated/metadata/navigation-menu-items/mock-navigation-menu-items-data';
import { mockedStandardObjectMetadataQueryResult } from '~/testing/mock-data/generated/metadata/objects/mock-objects-metadata';
import { mockedViews } from '~/testing/mock-data/generated/metadata/views/mock-views-data';
import { mockedPublicWorkspaceDataBySubdomain } from '~/testing/mock-data/publicWorkspaceDataBySubdomain';
import { mockedUserData } from '~/testing/mock-data/users';

// Apollo Link that short-circuits known metadata / auth operations with fixed
// mock data. Used as the bridge's metadata-client terminating link in place
// of MSW + HTTP — every operation listed here resolves synchronously without
// hitting the network. Unknown operations are forwarded to `next`, which lets
// MSW (still mounted for HTTP-shaped requests like /client-config and file
// proxies) keep working until those callers are migrated too.
//
// Adding an operation here is the equivalent of writing an MSW handler, but
// without the schema-introspection or HTTP-shape overhead. Variables aren't
// validated — the bridge trusts its own callers.

type MockHandler = (variables: Record<string, unknown>) =>
  | Record<string, unknown>
  | null
  | undefined;

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

  GetCurrentUser: () => ({
    currentUser: {
      ...mockedUserData,
      currentWorkspace: {
        ...mockedUserData.currentWorkspace,
        logo: null,
      },
    },
  }),

  GetPublicWorkspaceDataByDomain: () => ({
    getPublicWorkspaceDataByDomain: {
      ...mockedPublicWorkspaceDataBySubdomain,
      logo: null,
    },
  }),

  TrackAnalytics: () => ({
    trackAnalytics: { __typename: 'Analytics', success: true },
  }),

  FindOneWorkspaceMember: () => ({ workspaceMember: null }),

  MyConnectedAccounts: () => ({ myConnectedAccounts: [] }),
  MyMessageChannels: () => ({ myMessageChannels: [] }),
  MyCalendarChannels: () => ({ myCalendarChannels: [] }),
  FindManyFrontComponents: () => ({ frontComponents: [] }),

  FindManyObjectMetadataItems: () => mockedStandardObjectMetadataQueryResult,
  FindMinimalMetadata: () => ({ minimalMetadata: mockedMinimalMetadata }),

  FindAllViews: () => ({ getViews: mockedViews }),
  FindFieldsWidgetViews: () => ({
    getViews: mockedViews.filter((view) => view.type === 'FIELDS_WIDGET'),
  }),
  FindTableWidgetViews: () => ({
    getViews: mockedViews.filter((view) => view.type === 'TABLE_WIDGET'),
  }),

  FindAllRecordPageLayouts: () => ({ getPageLayouts: [] }),
  FindManyLogicFunctions: () => ({ findManyLogicFunctions: [] }),
  FindManyNavigationMenuItems: () => ({
    navigationMenuItems: mockedNavigationMenuItems,
  }),
  FindManyCommandMenuItems: () => ({
    commandMenuItems: mockedBackendCommandMenuItems,
  }),

  GetApiKeys: () => ({ apiKeys: mockedApiKeys }),
  GetApiKey: (variables) => ({
    apiKey:
      mockedApiKeys.find(
        (key) => key.id === (variables.input as { id?: string } | undefined)?.id,
      ) ?? null,
  }),

  GetWebhooks: () => ({
    webhooks: [],
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

// Some operations are HTTP GETs (not GraphQL) — e.g. /client-config. The link
// only handles GraphQL operations, so plain HTTP requests still fall through
// to MSW. Surface this as a constant so the bridge HTTP handlers can read the
// same data.
export { CLIENT_CONFIG as bridgeClientConfig };

export const bridgeMetadataMockLink = new ApolloLink((operation, forward) => {
  const operationName = operation.operationName;
  const handler = operationName ? handlers[operationName] : undefined;

  if (!handler) {
    // Unknown operation — let the next link handle it. In bridge mode there's
    // no real backend, so this typically results in a fetch error which the
    // caller treats as "no data". Add to `handlers` if you need a real stub.
    return forward(operation);
  }

  const data = handler(operation.variables ?? {});

  return new Observable<FetchResult>((subscriber) => {
    subscriber.next({ data });
    subscriber.complete();
  });
});
