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

  it('exposes all 30 grant sources and 9 opportunities', async () => {
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
    expect(data.grantSources.totalCount).toBe(30);
    expect(data.grantOpportunities.totalCount).toBe(9);
  });

  it('resolves relations in both directions', async () => {
    const client = makeClient();

    // MANY_TO_ONE: grant -> project, grant -> lead (researcher)
    const grantResult = await client.query({
      query: gql`
        query ActiveGrantWithRelations {
          grants(filter: { status: { eq: "ACTIVE" } }) {
            edges {
              node {
                name
                project {
                  name
                }
                lead {
                  name
                }
              }
            }
          }
        }
      `,
    });
    const grantNode = (
      grantResult.data as {
        grants: {
          edges: Array<{
            node: {
              name: string;
              project: { name: string } | null;
              lead: { name: string } | null;
            };
          }>;
        };
      }
    ).grants.edges[0].node;
    expect(grantNode.project?.name).toBe(
      'Topological insulators for fault-tolerant qubits',
    );
    expect(grantNode.lead?.name).toBe('Dr. Maya Okafor');

    // ONE_TO_MANY: project -> grants (the topological project has 2 grants)
    const projectResult = await client.query({
      query: gql`
        query ProjectGrants {
          projects(filter: { status: { eq: "ACTIVE" } }) {
            edges {
              node {
                name
                grants {
                  totalCount
                }
                milestones {
                  totalCount
                }
              }
            }
          }
        }
      `,
      fetchPolicy: 'network-only',
    });
    const projects = (
      projectResult.data as {
        projects: {
          edges: Array<{
            node: {
              name: string;
              grants: { totalCount: number };
              milestones: { totalCount: number };
            };
          }>;
        };
      }
    ).projects.edges.map((edge) => edge.node);
    const topological = projects.find((project) =>
      project.name.startsWith('Topological insulators'),
    );
    expect(topological?.grants.totalCount).toBe(2);
    expect(topological?.milestones.totalCount).toBe(2);
  });

  it('resolves the application requirement checklist', async () => {
    const client = makeClient();

    const result = await client.query({
      query: gql`
        query ApplicationChecklist {
          grantApplications(filter: { status: { eq: "REVIEWING" } }) {
            edges {
              node {
                name
                requirements {
                  totalCount
                  edges {
                    node {
                      name
                      status
                    }
                  }
                }
              }
            }
          }
        }
      `,
    });

    const application = (
      result.data as {
        grantApplications: {
          edges: Array<{
            node: {
              name: string;
              requirements: {
                totalCount: number;
                edges: Array<{ node: { name: string; status: string } }>;
              };
            };
          }>;
        };
      }
    ).grantApplications.edges[0].node;
    expect(application.requirements.totalCount).toBe(4);
    const statuses = application.requirements.edges.map(
      (edge) => edge.node.status,
    );
    expect(statuses).toContain('READY');
    expect(statuses).toContain('NEEDED');
  });

  it('exposes the reuse objects and resolves application → sections', async () => {
    const client = makeClient();

    const result = await client.query({
      query: gql`
        query Reuse {
          applicantProfiles {
            totalCount
          }
          applicationSections {
            totalCount
          }
          reusableAnswers {
            totalCount
          }
          grantApplications(filter: { status: { eq: "REVIEWING" } }) {
            edges {
              node {
                name
                sections {
                  totalCount
                }
                project {
                  name
                }
              }
            }
          }
        }
      `,
    });

    const data = result.data as {
      applicantProfiles: { totalCount: number };
      applicationSections: { totalCount: number };
      reusableAnswers: { totalCount: number };
      grantApplications: {
        edges: Array<{
          node: {
            name: string;
            sections: { totalCount: number };
            project: { name: string } | null;
          };
        }>;
      };
    };
    expect(data.applicantProfiles.totalCount).toBe(2);
    expect(data.applicationSections.totalCount).toBe(6);
    expect(data.reusableAnswers.totalCount).toBe(6);
    const application = data.grantApplications.edges[0].node;
    // The CIHR team application has 4 narrative sections and links to a project.
    expect(application.sections.totalCount).toBe(4);
    expect(application.project?.name).toBe(
      'Low-power spintronic memory devices',
    );
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
