import { ApolloClient, InMemoryCache, gql } from '@apollo/client';
import { buildDataSourceBundle } from 'twenty-shared/data-source';

import { createInMemoryDataSource } from '@/local-db/data-source/createInMemoryDataSource';
import { createSchemaLink } from '@/local-db/data-source/createSchemaLink';

import { mockedStandardObjectMetadataQueryResult } from '~/testing/mock-data/generated/metadata/objects/mock-objects-metadata';

// Boots a full executable schema over the 33-object metadata, attaches an
// in-memory DataSource seeded with two Companies, and runs the actual
// templated GraphQL operations Twenty's frontend would fire. This is the
// smallest credible proof that the design works end-to-end.

const bundle = buildDataSourceBundle(
  mockedStandardObjectMetadataQueryResult as never,
);

type CompanyConnectionData = {
  companies: {
    totalCount: number;
    edges: Array<{ node: { id: string; name?: string; employees?: number } }>;
    pageInfo?: { hasNextPage: boolean };
  };
};

type CompanyData = {
  company: { id: string; name: string; idealCustomerProfile?: boolean };
};

type CreateCompanyData = {
  createCompany: { id: string; name: string; employees: number };
};

type UpdateCompanyData = {
  updateCompany: { id: string; name: string; employees: number };
};

type DeleteCompanyData = {
  deleteCompany: { id: string };
};

type RestoreCompaniesData = {
  restoreCompanies: Array<{ id: string }>;
};

const makeClient = () => {
  const dataSource = createInMemoryDataSource({
    company: [
      {
        id: 'company-1',
        name: 'Acme',
        employees: 12,
        deletedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'company-2',
        name: 'Initech',
        employees: 4,
        deletedAt: null,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ],
  });

  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: createSchemaLink({ bundle, dataSource }),
  });

  return { client, dataSource };
};

describe('executable schema (Company vertical slice)', () => {
  it('finds many companies with filter, ordering, and limit', async () => {
    const { client } = makeClient();

    const result = await client.query({
      query: gql`
        query FindManyCompanies(
          $filter: CompanyFilterInput
          $orderBy: [CompanyOrderByInput!]
        ) {
          companies(filter: $filter, orderBy: $orderBy) {
            edges {
              node {
                id
                name
                employees
              }
              cursor
            }
            totalCount
            pageInfo {
              hasNextPage
            }
          }
        }
      `,
      variables: {
        filter: { name: { ilike: 'a%' } },
        orderBy: [{ name: 'AscNullsLast' }],
      },
    });

    const data = result.data as CompanyConnectionData;
    expect(data.companies.totalCount).toBe(1);
    expect(data.companies.edges).toHaveLength(1);
    expect(data.companies.edges[0].node.name).toBe('Acme');
  });

  it('finds one company by id', async () => {
    const { client } = makeClient();

    const result = await client.query({
      query: gql`
        query FindOneCompany($id: UUID!) {
          company(filter: { id: { eq: $id } }) {
            id
            name
          }
        }
      `,
      variables: { id: 'company-2' },
    });

    const data = result.data as CompanyData;
    expect(data.company).toEqual(
      expect.objectContaining({ id: 'company-2', name: 'Initech' }),
    );
  });

  it('applies metadata defaults before returning non-nullable fields', async () => {
    const { client } = makeClient();

    const result = await client.query({
      query: gql`
        query FindOneCompanyWithDefault($id: UUID!) {
          company(filter: { id: { eq: $id } }) {
            id
            name
            idealCustomerProfile
          }
        }
      `,
      variables: { id: 'company-1' },
    });

    const data = result.data as CompanyData;
    expect(data.company).toEqual(
      expect.objectContaining({
        id: 'company-1',
        idealCustomerProfile: false,
      }),
    );
  });

  it('populates the non-nullable createdBy actor on create without a workspace member', async () => {
    const { client } = makeClient();

    // Reproduces "Cannot return null for non-nullable field Company.createdBy":
    // the bridge runs single-tenant with no workspaceMemberId in context, so
    // the created record must still carry a non-null createdBy composite.
    const created = await client.mutate({
      mutation: gql`
        mutation CreateOneCompanyWithActor($input: CompanyCreateInput!) {
          createCompany(data: $input) {
            id
            name
            createdBy {
              source
              workspaceMemberId
            }
          }
        }
      `,
      variables: { input: { name: 'Hooli' } },
    });

    const createdBy = (
      created.data as { createCompany: { createdBy: unknown } }
    ).createCompany.createdBy;
    expect(createdBy).toEqual(
      expect.objectContaining({ source: 'MANUAL', workspaceMemberId: null }),
    );
  });

  it('creates, updates, soft-deletes, and restores a company', async () => {
    const { client } = makeClient();

    const created = await client.mutate({
      mutation: gql`
        mutation CreateOneCompany($input: CompanyCreateInput!) {
          createCompany(data: $input) {
            id
            name
            employees
          }
        }
      `,
      variables: { input: { name: 'Globex', employees: 7 } },
    });
    const createdData = created.data as CreateCompanyData;
    const newId = createdData.createCompany.id;
    expect(createdData.createCompany.name).toBe('Globex');

    const updated = await client.mutate({
      mutation: gql`
        mutation UpdateOneCompany($id: UUID!, $input: CompanyUpdateInput!) {
          updateCompany(id: $id, data: $input) {
            id
            name
            employees
          }
        }
      `,
      variables: { id: newId, input: { employees: 99 } },
    });
    const updatedData = updated.data as UpdateCompanyData;
    expect(updatedData.updateCompany.employees).toBe(99);

    const deleted = await client.mutate({
      mutation: gql`
        mutation DeleteOneCompany($id: UUID!) {
          deleteCompany(id: $id) {
            id
          }
        }
      `,
      variables: { id: newId },
    });
    const deletedData = deleted.data as DeleteCompanyData;
    expect(deletedData.deleteCompany.id).toBe(newId);

    const refetch = await client.query({
      query: gql`
        query CompaniesAfterDelete {
          companies {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `,
      fetchPolicy: 'network-only',
    });
    const refetchData = refetch.data as CompanyConnectionData;
    expect(refetchData.companies.totalCount).toBe(2);
    expect(
      refetchData.companies.edges.find((edge) => edge.node.id === newId),
    ).toBeUndefined();

    const restored = await client.mutate({
      mutation: gql`
        mutation RestoreManyCompanies($filter: CompanyFilterInput!) {
          restoreCompanies(filter: $filter) {
            id
          }
        }
      `,
      variables: {
        filter: {
          id: { eq: newId },
          deletedAt: { is: 'NOT_NULL' },
        },
      },
    });
    const restoredData = restored.data as RestoreCompaniesData;
    expect(restoredData.restoreCompanies).toEqual([
      expect.objectContaining({ id: newId }),
    ]);

    const finalQuery = await client.query({
      query: gql`
        query CompaniesAfterRestore {
          companies {
            totalCount
          }
        }
      `,
      fetchPolicy: 'network-only',
    });
    const finalData = finalQuery.data as CompanyConnectionData;
    expect(finalData.companies.totalCount).toBe(3);
  });
});
