import { type RecordGqlOperationFilter } from '../../types/RecordGqlOperationFilter';
import { type RecordGqlOperationOrderBy } from '../../types/RecordGqlOperationOrderBy';

// Plain-record value coming out of (and going into) a DataSource. Resolvers
// take care of GraphQL-level shaping (connection wrapping, __typename
// injection, relation expansion). Adapters always work with flat records.
export type DataSourceRecord = Record<string, unknown> & { id: string };

export type DataSourcePageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};

export type DataSourceRecordPage = {
  records: DataSourceRecord[];
  pageInfo: DataSourcePageInfo;
  totalCount: number;
};

export type DataSourcePaginationArgs = {
  first?: number | null;
  after?: string | null;
  last?: number | null;
  before?: string | null;
  offset?: number | null;
};

export type DataSourceFindManyArgs = DataSourcePaginationArgs & {
  filter?: RecordGqlOperationFilter | null;
  orderBy?: RecordGqlOperationOrderBy | null;
};

export type DataSourceFindOneArgs = {
  filter: RecordGqlOperationFilter;
};

export type DataSourceAggregateArgs = {
  filter?: RecordGqlOperationFilter | null;
  // Field names to compute aggregates for, matching the GraphQL aggregate
  // field naming (`totalCount`, `countX`, `minX`, `maxX`, etc.). See
  // `getAvailableAggregationsFromObjectFields` for the naming scheme.
  fields: string[];
};

export type DataSourceAggregateResult = Record<string, number | string | null>;

export type DataSourceSearchArgs = {
  searchInput: string;
  limit: number;
  after?: string | null;
  includedObjectNameSingulars?: string[] | null;
  excludedObjectNameSingulars?: string[] | null;
  filter?: RecordGqlOperationFilter | null;
};

export type DataSourceSearchNode = {
  recordId: string;
  objectNameSingular: string;
  objectLabelSingular: string;
  label: string;
  imageUrl?: string | null;
  tsRankCD?: number | null;
  tsRank?: number | null;
};

export type DataSourceSearchPage = {
  edges: Array<{ node: DataSourceSearchNode; cursor: string | null }>;
  pageInfo: DataSourcePageInfo;
};

export type DataSourceContext = {
  // Identifier for the workspace / tenant the request is scoped to. Optional
  // so single-tenant local Dexie mode can omit it; Convex will always set it.
  workspaceId?: string;
  // Workspace member calling the operation; used to populate `createdBy` /
  // `updatedBy` ACTOR fields when adapters write records.
  workspaceMemberId?: string;
};
