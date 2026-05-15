import {
  type DataSource,
  type DataSourceAggregateArgs,
  type DataSourceAggregateResult,
  type DataSourceBundle,
  type DataSourceContext,
  type DataSourceFindManyArgs,
  type DataSourceFindOneArgs,
  type DataSourceRecord,
  type DataSourceRecordPage,
  type DataSourceSearchArgs,
  type DataSourceSearchPage,
} from 'twenty-shared/data-source';

// Skeleton ConvexDataSource. Production builds will:
//
//  1. Speak to Convex via HTTP actions registered under `/data-source/*`
//     that wrap Convex queries / mutations.
//  2. Translate the DataSource arguments into the Convex query AST so
//     filtering / sorting happens server-side instead of in JS. The filter
//     translator lives next to `filterToPredicate.ts` and is shared.
//  3. Have its own auth scope; `context.workspaceId` and
//     `context.workspaceMemberId` get forwarded as HTTP headers.
//
// Until then this adapter just forwards every call to the configured Convex
// HTTP endpoint, which is expected to honour the same DataSource argument
// shape as a single JSON body. Convex's serverless functions implement the
// dispatch on their side. This file is intentionally narrow — once Convex
// resolver functions land, the only thing here is glue.

export type ConvexDataSourceOptions = {
  bundle: DataSourceBundle;
  convexUrl: string;
  fetchImpl?: typeof fetch;
};

const requireJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(
      `ConvexDataSource request failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
};

export const createConvexDataSource = ({
  convexUrl,
  fetchImpl = fetch,
}: ConvexDataSourceOptions): DataSource => {
  const url = (path: string) => `${convexUrl.replace(/\/$/, '')}/${path}`;

  const call = async <T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> => {
    const response = await fetchImpl(url(`data-source/${method}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return requireJson<T>(response);
  };

  return {
    mode: 'convex',
    async findMany(
      objectName: string,
      args: DataSourceFindManyArgs,
      context: DataSourceContext,
    ): Promise<DataSourceRecordPage> {
      return call('findMany', { objectName, args, context });
    },
    async findOne(
      objectName: string,
      args: DataSourceFindOneArgs,
      context: DataSourceContext,
    ): Promise<DataSourceRecord | null> {
      return call('findOne', { objectName, args, context });
    },
    async findDuplicates(
      objectName: string,
      ids: string[],
      context: DataSourceContext,
    ): Promise<DataSourceRecordPage> {
      return call('findDuplicates', { objectName, ids, context });
    },
    async createOne(
      objectName: string,
      input: Record<string, unknown>,
      context: DataSourceContext,
    ): Promise<DataSourceRecord> {
      return call('createOne', { objectName, input, context });
    },
    async updateOne(
      objectName: string,
      id: string,
      input: Record<string, unknown>,
      context: DataSourceContext,
    ): Promise<DataSourceRecord> {
      return call('updateOne', { objectName, id, input, context });
    },
    async deleteOne(
      objectName: string,
      id: string,
      context: DataSourceContext,
    ): Promise<DataSourceRecord> {
      return call('deleteOne', { objectName, id, context });
    },
    async destroyOne(
      objectName: string,
      id: string,
      context: DataSourceContext,
    ): Promise<{ id: string }> {
      return call('destroyOne', { objectName, id, context });
    },
    async restoreMany(
      objectName: string,
      args: DataSourceFindOneArgs,
      context: DataSourceContext,
    ): Promise<Array<{ id: string }>> {
      return call('restoreMany', { objectName, args, context });
    },
    async aggregate(
      objectName: string,
      args: DataSourceAggregateArgs,
      context: DataSourceContext,
    ): Promise<DataSourceAggregateResult> {
      return call('aggregate', { objectName, args, context });
    },
    async search(
      args: DataSourceSearchArgs,
      context: DataSourceContext,
    ): Promise<DataSourceSearchPage> {
      return call('search', { args, context });
    },
  };
};
