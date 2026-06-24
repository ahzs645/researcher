import { type GraphQLFieldResolver } from 'graphql';

import {
  type DataSource,
  type DataSourceBundle,
  type DataSourceContext,
  type DataSourceObject,
  type DataSourceRecord,
  applyDataSourceRecordDefaults,
  encodeCursor,
  getAggregateFieldsForObject,
} from 'twenty-shared/data-source';
import {
  FieldMetadataType,
  type RecordGqlOperationFilter,
  RelationType,
} from 'twenty-shared/types';

import { customScalarResolvers } from './customScalars';

// Build Apollo-compatible resolvers from a DataSourceBundle.
// One resolver per templated operation (Query.<nameSingular>,
// Query.<namePlural>, Mutation.create<NameSingular>, …) that delegates to
// the supplied DataSource. Everything dynamic (filter shape, field
// selection, connection wrapping) is handled here so adapters stay simple.

type ResolverContext = {
  dataSource: DataSource;
  dataSourceContext?: DataSourceContext;
};

type GenericResolver = GraphQLFieldResolver<unknown, ResolverContext>;

const capitalize = (str: string) =>
  str.length === 0 ? str : str[0].toUpperCase() + str.slice(1);

const TYPENAME_BY_OBJECT = new Map<string, string>();

const typenameFor = (object: DataSourceObject): string =>
  TYPENAME_BY_OBJECT.get(object.nameSingular) ??
  TYPENAME_BY_OBJECT.set(
    object.nameSingular,
    capitalize(object.nameSingular),
  ).get(object.nameSingular)!;

const decorateRecord = (
  object: DataSourceObject,
  record: DataSourceRecord | null,
): (DataSourceRecord & { __typename: string }) | null => {
  if (!record) return null;
  return {
    __typename: typenameFor(object),
    ...applyDataSourceRecordDefaults(object, record),
  };
};

const FILTER_SYMBOL = Symbol.for('bridge:connection-filter');

type ConnectionWithFilter = {
  __typename: string;
  [FILTER_SYMBOL]: RecordGqlOperationFilter | null;
  edges: unknown[];
  pageInfo: unknown;
  totalCount: number;
};

const wrapAsConnection = (
  object: DataSourceObject,
  records: DataSourceRecord[],
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  },
  totalCount: number,
  filter: RecordGqlOperationFilter | null = null,
): ConnectionWithFilter => ({
  __typename: `${typenameFor(object)}Connection`,
  [FILTER_SYMBOL]: filter,
  edges: records.map((record, index) => ({
    __typename: `${typenameFor(object)}Edge`,
    node: decorateRecord(object, record),
    cursor: pageInfo.startCursor ? encodeCursor(index) : null,
  })),
  pageInfo: { __typename: 'PageInfo', ...pageInfo },
  totalCount,
});

// Per-field aggregate fields (e.g. `maxEmployees`, `countNotEmptyAddress`) live
// on the Connection type. Each aggregate resolver delegates to
// `dataSource.aggregate`, which parses the field name and computes the value.
const connectionAggregateResolver: GenericResolver = async (
  parent,
  _args,
  context,
  info,
) => {
  const aggregateFieldName = info.fieldName;
  const filter = (parent as ConnectionWithFilter)[FILTER_SYMBOL] ?? null;
  const typenameWithoutConnection = (
    parent as ConnectionWithFilter
  ).__typename.replace(/Connection$/, '');
  const nameSingular =
    typenameWithoutConnection[0].toLowerCase() +
    typenameWithoutConnection.slice(1);
  const aggregates = await context.dataSource.aggregate(
    nameSingular,
    {
      filter,
      fields: [aggregateFieldName],
    },
    context.dataSourceContext ?? {},
  );
  return aggregates[aggregateFieldName] ?? null;
};

const objectFieldResolvers = (
  bundle: DataSourceBundle,
  object: DataSourceObject,
): Record<string, GenericResolver> => {
  const resolvers: Record<string, GenericResolver> = {};

  for (const field of object.fields) {
    if (!field.isActive) continue;
    if (field.type === FieldMetadataType.RELATION) {
      const relation = field.relation;
      if (!relation) continue;
      const target = bundle.objectsByNameSingular.get(
        relation.targetObjectNameSingular,
      );
      if (!target) continue;
      const isManyToOne = relation.type === RelationType.MANY_TO_ONE;
      if (isManyToOne) {
        // Object reference field: `accountOwner` resolves to a Person looked
        // up via the join column `accountOwnerId`.
        resolvers[field.name] = async (parent, _args, context) => {
          const joinColumn = `${field.name}Id`;
          const targetId = (parent as Record<string, unknown>)[joinColumn];
          if (typeof targetId !== 'string') return null;
          const found = await context.dataSource.findOne(
            target.nameSingular,
            {
              filter: { id: { eq: targetId } } as RecordGqlOperationFilter,
            },
            context.dataSourceContext ?? {},
          );
          return decorateRecord(target, found);
        };
      } else {
        // One-to-many: `companies` on Person resolves to a Connection of
        // Company records whose `accountOwnerId` matches this record's id.
        const reverseJoinColumn = `${relation.targetFieldName}Id`;
        resolvers[field.name] = async (parent, _args, context) => {
          const parentId = (parent as Record<string, unknown>).id;
          if (typeof parentId !== 'string') {
            return wrapAsConnection(
              target,
              [],
              {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: null,
              },
              0,
            );
          }
          const page = await context.dataSource.findMany(
            target.nameSingular,
            {
              filter: {
                [reverseJoinColumn]: { eq: parentId },
              } as RecordGqlOperationFilter,
            },
            context.dataSourceContext ?? {},
          );
          return wrapAsConnection(
            target,
            page.records,
            page.pageInfo,
            page.totalCount,
          );
        };
      }
    }
  }

  return resolvers;
};

export const buildResolvers = (bundle: DataSourceBundle) => {
  const queryResolvers: Record<string, GenericResolver> = {};
  const mutationResolvers: Record<string, GenericResolver> = {};
  const typeResolvers: Record<string, Record<string, GenericResolver>> = {};

  for (const object of bundle.objects.filter((object) => object.isActive)) {
    const typeName = typenameFor(object);
    const fieldResolvers = objectFieldResolvers(bundle, object);
    if (Object.keys(fieldResolvers).length > 0) {
      typeResolvers[typeName] = fieldResolvers;
    }

    // Wire per-field aggregate resolvers (`maxEmployees`, `countNotEmpty…`,
    // etc.) onto each `<Type>Connection`. The SDL emits matching field names
    // via `getAggregateFieldsForObject`, so this loop registers a resolver for
    // each one — `totalCount` keeps its eager value from `wrapAsConnection`.
    const connectionTypeName = `${typeName}Connection`;
    const connectionResolvers: Record<string, GenericResolver> = {};
    for (const aggregateFieldName of getAggregateFieldsForObject(
      object,
    ).keys()) {
      if (aggregateFieldName === 'totalCount') continue;
      connectionResolvers[aggregateFieldName] = connectionAggregateResolver;
    }
    if (Object.keys(connectionResolvers).length > 0) {
      typeResolvers[connectionTypeName] = connectionResolvers;
    }

    // Query.<nameSingular>
    queryResolvers[object.nameSingular] = async (
      _parent,
      args: { filter?: RecordGqlOperationFilter | null },
      context,
    ) => {
      const found = await context.dataSource.findOne(
        object.nameSingular,
        { filter: args.filter ?? ({} as RecordGqlOperationFilter) },
        context.dataSourceContext ?? {},
      );
      return decorateRecord(object, found);
    };

    // Query.<namePlural>
    queryResolvers[object.namePlural] = async (
      _parent,
      args: {
        filter?: RecordGqlOperationFilter | null;
        orderBy?: unknown;
        first?: number;
        after?: string;
        last?: number;
        before?: string;
        offset?: number;
      },
      context,
    ) => {
      const page = await context.dataSource.findMany(
        object.nameSingular,
        {
          filter: args.filter ?? null,
          orderBy: (args.orderBy as never) ?? null,
          first: args.first ?? null,
          after: args.after ?? null,
          last: args.last ?? null,
          before: args.before ?? null,
          offset: args.offset ?? null,
        },
        context.dataSourceContext ?? {},
      );
      return wrapAsConnection(
        object,
        page.records,
        page.pageInfo,
        page.totalCount,
        args.filter ?? null,
      );
    };

    // Query.<nameSingular>Duplicates
    queryResolvers[`${object.nameSingular}Duplicates`] = async (
      _parent,
      args: { ids: string[] },
      context,
    ) => {
      const page = await context.dataSource.findDuplicates(
        object.nameSingular,
        args.ids,
        context.dataSourceContext ?? {},
      );
      return wrapAsConnection(
        object,
        page.records,
        page.pageInfo,
        page.totalCount,
      );
    };

    // Mutation.create<NameSingular>
    mutationResolvers[`create${capitalize(object.nameSingular)}`] = async (
      _parent,
      args: { data: Record<string, unknown> },
      context,
    ) => {
      const record = await context.dataSource.createOne(
        object.nameSingular,
        args.data,
        context.dataSourceContext ?? {},
      );
      return decorateRecord(object, record);
    };

    // Mutation.update<NameSingular>
    mutationResolvers[`update${capitalize(object.nameSingular)}`] = async (
      _parent,
      args: { id: string; data: Record<string, unknown> },
      context,
    ) => {
      const record = await context.dataSource.updateOne(
        object.nameSingular,
        args.id,
        args.data,
        context.dataSourceContext ?? {},
      );
      return decorateRecord(object, record);
    };

    // Mutation.delete<NameSingular>
    mutationResolvers[`delete${capitalize(object.nameSingular)}`] = async (
      _parent,
      args: { id: string },
      context,
    ) => {
      const record = await context.dataSource.deleteOne(
        object.nameSingular,
        args.id,
        context.dataSourceContext ?? {},
      );
      return decorateRecord(object, record);
    };

    // Mutation.destroy<NameSingular>
    mutationResolvers[`destroy${capitalize(object.nameSingular)}`] = async (
      _parent,
      args: { id: string },
      context,
    ) => {
      return await context.dataSource.destroyOne(
        object.nameSingular,
        args.id,
        context.dataSourceContext ?? {},
      );
    };

    // Mutation.restore<NamePlural>
    mutationResolvers[`restore${capitalize(object.namePlural)}`] = async (
      _parent,
      args: { filter: RecordGqlOperationFilter },
      context,
    ) => {
      return await context.dataSource.restoreMany(
        object.nameSingular,
        { filter: args.filter },
        context.dataSourceContext ?? {},
      );
    };
  }

  // Cross-object search
  queryResolvers.search = (async (_parent, args, context) => {
    return await context.dataSource.search(
      args as never,
      context.dataSourceContext ?? {},
    );
  }) as GenericResolver;

  return {
    ...customScalarResolvers,
    Query: queryResolvers,
    Mutation: mutationResolvers,
    ...typeResolvers,
  };
};
