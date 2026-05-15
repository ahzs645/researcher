import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
  gql,
  type DocumentNode,
} from '@apollo/client';

import { bridgeMetadataMockLink } from '@/local-db/data-source/bridgeMetadataMockLink';

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
  link = bridgeMetadataMockLink,
) => {
  const client = buildClient(link);
  const result = await client.mutate({
    mutation,
    errorPolicy: 'all',
  });
  return result.data;
};

describe('bridgeMetadataMockLink', () => {
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
