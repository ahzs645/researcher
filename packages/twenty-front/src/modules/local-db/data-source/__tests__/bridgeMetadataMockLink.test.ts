// Sets up an in-memory IndexedDB before any Dexie-backed import loads.
import 'fake-indexeddb/auto';

import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
  gql,
  type DocumentNode,
} from '@apollo/client';

import { bridgeMetadataMockLink } from '@/local-db/data-source/bridgeMetadataMockLink';
import { getBridgeSystemDexie } from '@/local-db/data-source/bridgeSystemDexie';
import { __resetBridgeSystemSeedForTests } from '@/local-db/data-source/bridgeSystemSeed';

// The mock link short-circuits known operations in-process. Verifying a few
// representative shapes guards against accidental handler removal.

const buildClient = (link: ApolloLink) =>
  new ApolloClient({
    cache: new InMemoryCache(),
    link,
  });

const runQuery = async (query: DocumentNode, link = bridgeMetadataMockLink) => {
  const client = buildClient(link);
  const result = await client.query({
    query,
    fetchPolicy: 'no-cache',
    errorPolicy: 'all',
  });
  return result.data;
};

const runMutation = async (
  mutation: DocumentNode,
  variables: Record<string, unknown> = {},
  link = bridgeMetadataMockLink,
) => {
  const client = buildClient(link);
  const result = await client.mutate({
    mutation,
    variables,
    errorPolicy: 'all',
  });
  return result.data;
};

describe('bridgeMetadataMockLink', () => {
  beforeEach(async () => {
    const db = getBridgeSystemDexie();
    await Promise.all([
      db.user.clear(),
      db.workspace.clear(),
      db.workspaceMember.clear(),
      db.view.clear(),
      db.viewField.clear(),
      db.viewFilter.clear(),
      db.viewSort.clear(),
      db.viewGroup.clear(),
      db.viewFilterGroup.clear(),
      db.viewFieldGroup.clear(),
      db.publicWorkspaceData.clear(),
      db.navigationMenuItem.clear(),
      db.commandMenuItem.clear(),
      db.role.clear(),
      db.apiKey.clear(),
      db.webhook.clear(),
      db.pageLayout.clear(),
    ]);
    __resetBridgeSystemSeedForTests();
  });

  it('returns mocked currentUser for GetCurrentUser', async () => {
    const data = await runQuery(gql`
      query GetCurrentUser {
        currentUser {
          id
        }
      }
    `);
    expect((data as Record<string, unknown>).currentUser).toBeTruthy();
  });

  it('returns success: true for TrackAnalytics', async () => {
    const data = await runMutation(gql`
      mutation TrackAnalytics {
        trackAnalytics {
          success
        }
      }
    `);
    const trackAnalytics = (data as Record<string, unknown>)
      .trackAnalytics as { success: boolean };
    expect(trackAnalytics.success).toBe(true);
  });

  it('returns an empty array for MyConnectedAccounts', async () => {
    const data = await runQuery(gql`
      query MyConnectedAccounts {
        myConnectedAccounts {
          id
        }
      }
    `);
    expect((data as Record<string, unknown>).myConnectedAccounts).toEqual([]);
  });

  it('persists CreateApiKey through to subsequent GetApiKeys', async () => {
    const createData = await runMutation(
      gql`
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            id
            name
          }
        }
      `,
      { input: { name: 'Test', expiresAt: null, roleId: null } },
    );
    const created = (createData as Record<string, unknown>).createApiKey as {
      id: string;
      name: string;
    };
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Test');

    const listData = await runQuery(gql`
      query GetApiKeys {
        apiKeys {
          id
          name
        }
      }
    `);
    const apiKeys = (listData as Record<string, unknown>).apiKeys as {
      id: string;
    }[];
    expect(apiKeys.some((key) => key.id === created.id)).toBe(true);
  });

  it('forwards unknown operations to the next link', async () => {
    let forwarded = false;
    const downstream = new ApolloLink(() => {
      forwarded = true;
      return new Observable((subscriber) => {
        subscriber.next({ data: null });
        subscriber.complete();
      });
    });
    const composed = ApolloLink.from([bridgeMetadataMockLink, downstream]);
    await runQuery(
      gql`
        query UnknownOperation {
          __typename
        }
      `,
      composed,
    ).catch(() => undefined);
    expect(forwarded).toBe(true);
  });
});
