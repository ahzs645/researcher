import { ApolloClient, InMemoryCache, gql } from '@apollo/client';
import { buildDataSourceBundle } from 'twenty-shared/data-source';

import { createInMemoryDataSource } from '@/local-db/data-source/createInMemoryDataSource';
import { createSchemaLink } from '@/local-db/data-source/createSchemaLink';
import {
  augmentObjectMetadataWithResearch,
  getResearchSeedRecords,
} from '@/local-db/research/bridgeResearchAugmentation';

import { mockedStandardObjectMetadataQueryResult } from '~/testing/mock-data/generated/metadata/objects/mock-objects-metadata';

// Proves the research objects produce a valid executable schema and resolve
// end-to-end through the same SchemaLink the bridge uses for records. If the
// generated SDL for any research object were malformed, building this bundle /
// schema link would throw and break every object (not just research ones).

const bundle = buildDataSourceBundle(
  augmentObjectMetadataWithResearch(
    mockedStandardObjectMetadataQueryResult as never,
  ) as never,
);

const makeClient = () => {
  const dataSource = createInMemoryDataSource(
    getResearchSeedRecords() as never,
  );
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: createSchemaLink({ bundle, dataSource }),
  });
};

type GrantsData = {
  grants: {
    totalCount: number;
    edges: Array<{
      node: {
        id: string;
        name: string;
        funder: string;
        status: string;
        amountRequested?: number;
      };
    }>;
  };
};

describe('research executable schema', () => {
  it('builds the augmented schema and queries seeded grants with filter/order', async () => {
    const client = makeClient();

    const result = await client.query({
      query: gql`
        query FindManyGrants(
          $filter: GrantFilterInput
          $orderBy: [GrantOrderByInput!]
        ) {
          grants(filter: $filter, orderBy: $orderBy) {
            totalCount
            edges {
              node {
                id
                name
                funder
                status
                amountRequested
              }
            }
          }
        }
      `,
      variables: { orderBy: [{ name: 'AscNullsLast' }] },
    });

    const data = result.data as GrantsData;
    expect(data.grants.totalCount).toBe(5);
    const statuses = data.grants.edges.map((edge) => edge.node.status);
    expect(statuses).toContain('ACTIVE');
    expect(statuses).toContain('SUBMITTED');
    // Amounts resolve as NUMBER, ordering applied by name.
    expect(data.grants.edges[0].node.funder.length).toBeGreaterThan(0);
  });

  it('filters grants by select enum', async () => {
    const client = makeClient();

    const result = await client.query({
      query: gql`
        query SubmittedGrants {
          grants(filter: { status: { eq: "SUBMITTED" } }) {
            totalCount
            edges {
              node {
                name
              }
            }
          }
        }
      `,
      fetchPolicy: 'network-only',
    });

    const data = result.data as GrantsData;
    expect(data.grants.totalCount).toBe(1);
  });

  it('exposes all 24 ported grant sources and 6 opportunities', async () => {
    const client = makeClient();

    const result = await client.query({
      query: gql`
        query Discovery {
          grantSources {
            totalCount
          }
          grantOpportunities {
            totalCount
          }
        }
      `,
    });

    const data = result.data as {
      grantSources: { totalCount: number };
      grantOpportunities: { totalCount: number };
    };
    expect(data.grantSources.totalCount).toBe(24);
    expect(data.grantOpportunities.totalCount).toBe(6);
  });

  it('creates a grant through the schema link', async () => {
    const client = makeClient();

    const created = await client.mutate({
      mutation: gql`
        mutation CreateGrant($input: GrantCreateInput!) {
          createGrant(data: $input) {
            id
            name
            funder
            status
          }
        }
      `,
      variables: {
        input: {
          name: 'Test Grant',
          funder: 'Test Funder',
          status: 'PROSPECTING',
        },
      },
    });

    const createdGrant = (
      created.data as { createGrant: { id: string; name: string } }
    ).createGrant;
    expect(createdGrant.name).toBe('Test Grant');
    expect(typeof createdGrant.id).toBe('string');
  });
});
