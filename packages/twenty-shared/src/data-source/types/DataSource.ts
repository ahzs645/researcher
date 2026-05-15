import {
  type DataSourceAggregateArgs,
  type DataSourceAggregateResult,
  type DataSourceContext,
  type DataSourceFindManyArgs,
  type DataSourceFindOneArgs,
  type DataSourceRecord,
  type DataSourceRecordPage,
  type DataSourceSearchArgs,
  type DataSourceSearchPage,
} from './DataSourceTypes';

// The single backend-agnostic contract shared by every adapter (Dexie,
// Convex, in-memory test stub, …). The executable GraphQL schema's resolvers
// only ever talk to this interface; everything above the `DataSource` line
// (SDL generation, filter translation, cursor encoding, connection wrapping,
// `__typename` injection) lives in the shared executable-schema layer.
//
// Adapters MUST implement soft-delete semantics: `deleteOne` sets `deletedAt`
// and `findMany`/`findOne` exclude soft-deleted rows by default. `destroyOne`
// is the hard delete and `restoreMany` reverses a soft-delete.
//
// Methods may return promises or synchronous values; resolvers always await.
export type DataSource = {
  readonly mode: 'dexie' | 'convex' | string;

  findMany: (
    objectName: string,
    args: DataSourceFindManyArgs,
    context: DataSourceContext,
  ) => Promise<DataSourceRecordPage>;

  findOne: (
    objectName: string,
    args: DataSourceFindOneArgs,
    context: DataSourceContext,
  ) => Promise<DataSourceRecord | null>;

  findDuplicates: (
    objectName: string,
    ids: string[],
    context: DataSourceContext,
  ) => Promise<DataSourceRecordPage>;

  createOne: (
    objectName: string,
    input: Record<string, unknown>,
    context: DataSourceContext,
  ) => Promise<DataSourceRecord>;

  updateOne: (
    objectName: string,
    id: string,
    input: Record<string, unknown>,
    context: DataSourceContext,
  ) => Promise<DataSourceRecord>;

  // Soft delete — record stays in storage with `deletedAt` set.
  deleteOne: (
    objectName: string,
    id: string,
    context: DataSourceContext,
  ) => Promise<DataSourceRecord>;

  // Hard delete — record is gone, only `{ id }` is returned.
  destroyOne: (
    objectName: string,
    id: string,
    context: DataSourceContext,
  ) => Promise<{ id: string }>;

  // Restore every soft-deleted record matching the filter.
  restoreMany: (
    objectName: string,
    args: DataSourceFindOneArgs,
    context: DataSourceContext,
  ) => Promise<Array<{ id: string }>>;

  aggregate: (
    objectName: string,
    args: DataSourceAggregateArgs,
    context: DataSourceContext,
  ) => Promise<DataSourceAggregateResult>;

  search: (
    args: DataSourceSearchArgs,
    context: DataSourceContext,
  ) => Promise<DataSourceSearchPage>;
};
