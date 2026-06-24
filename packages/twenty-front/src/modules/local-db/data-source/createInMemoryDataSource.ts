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
  buildActorFromContext,
  computeAggregate,
  computeDuplicates,
  computeSearch,
  decodeCursor,
  encodeCursor,
  applyDataSourceRecordPosition,
  filterToPredicate,
  orderByToComparator,
} from 'twenty-shared/data-source';

// In-memory DataSource over plain object-name → record-array maps.
// Backs unit tests for the executable schema and the SchemaLink bridge.
// Adapters (Dexie / Convex) reuse the same filter + comparator helpers.
//
// Soft-delete: `deletedAt` is an ISO string; `findMany`/`findOne` exclude
// rows where it's set unless the filter explicitly looks for them.

const cloneSeed = (
  seed: Record<string, DataSourceRecord[]>,
): Map<string, DataSourceRecord[]> => {
  const map = new Map<string, DataSourceRecord[]>();
  for (const [key, records] of Object.entries(seed)) {
    map.set(
      key,
      records.map((record) => ({ ...record })),
    );
  }
  return map;
};

const includesDeletedClause = (
  filter: DataSourceFindOneArgs['filter'] | null | undefined,
): boolean => {
  if (!filter || typeof filter !== 'object') return false;
  const candidate = filter as Record<string, unknown>;
  if (typeof candidate.deletedAt === 'object' && candidate.deletedAt !== null) {
    return true;
  }
  if (Array.isArray(candidate.or)) {
    return candidate.or.some((subFilter) =>
      includesDeletedClause(subFilter as DataSourceFindOneArgs['filter']),
    );
  }
  return false;
};

export type InMemoryDataSource = DataSource & {
  reset: (seed?: Record<string, DataSourceRecord[]>) => void;
  exportAll: () => Record<string, DataSourceRecord[]>;
};

export const createInMemoryDataSource = (
  initialSeed: Record<string, DataSourceRecord[]> = {},
  options: { bundle?: DataSourceBundle } = {},
): InMemoryDataSource => {
  let records = cloneSeed(initialSeed);
  const { bundle } = options;

  const getOrCreate = (objectName: string): DataSourceRecord[] => {
    const existing = records.get(objectName);
    if (existing) return existing;
    const list: DataSourceRecord[] = [];
    records.set(objectName, list);
    return list;
  };

  const filteredRecords = (
    objectName: string,
    args: { filter?: DataSourceFindManyArgs['filter'] },
  ): DataSourceRecord[] => {
    const all = records.get(objectName) ?? [];
    const showDeleted = includesDeletedClause(args.filter ?? undefined);
    const visible = showDeleted
      ? all
      : all.filter(
          (record) =>
            record.deletedAt === null || record.deletedAt === undefined,
        );
    const predicate = filterToPredicate(args.filter ?? undefined);
    return visible.filter(predicate);
  };

  const findMany = async (
    objectName: string,
    args: DataSourceFindManyArgs,
  ): Promise<DataSourceRecordPage> => {
    const matched = filteredRecords(objectName, args);
    const sorted = [...matched].sort(orderByToComparator(args.orderBy ?? null));

    const offset = args.offset ?? 0;
    const startCursor = decodeCursor(args.after);
    const baseIndex = (startCursor !== null ? startCursor + 1 : 0) + offset;
    const limit =
      typeof args.first === 'number'
        ? args.first
        : typeof args.last === 'number'
          ? args.last
          : sorted.length - baseIndex;

    const slice = sorted.slice(baseIndex, baseIndex + limit);

    const startIndex = baseIndex;
    const endIndex = baseIndex + slice.length - 1;

    return {
      records: slice,
      pageInfo: {
        hasNextPage: baseIndex + slice.length < sorted.length,
        hasPreviousPage: startIndex > 0,
        startCursor: slice.length > 0 ? encodeCursor(startIndex) : null,
        endCursor: slice.length > 0 ? encodeCursor(endIndex) : null,
      },
      totalCount: matched.length,
    };
  };

  const findOne = async (
    objectName: string,
    args: DataSourceFindOneArgs,
  ): Promise<DataSourceRecord | null> => {
    const filtered = filteredRecords(objectName, args);
    return filtered[0] ?? null;
  };

  const aggregate = async (
    objectName: string,
    args: DataSourceAggregateArgs,
  ): Promise<DataSourceAggregateResult> => {
    const matched = filteredRecords(objectName, args);
    return computeAggregate(matched, args.fields);
  };

  const search = async (
    args: DataSourceSearchArgs,
  ): Promise<DataSourceSearchPage> => {
    const sources = Array.from(records.entries()).map(([objectName, list]) => ({
      objectName,
      objectLabelSingular: objectName,
      records: list.filter(
        (record) => record.deletedAt === null || record.deletedAt === undefined,
      ),
    }));
    return computeSearch(args, sources);
  };

  const findDuplicates = async (
    objectName: string,
    ids: string[],
  ): Promise<DataSourceRecordPage> => {
    const object = bundle?.objectsByNameSingular.get(objectName);
    if (!object || ids.length === 0) {
      return {
        records: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        totalCount: 0,
      };
    }
    const list = records.get(objectName) ?? [];
    const sourceRecords = list.filter((record) => ids.includes(record.id));
    const duplicates = computeDuplicates(
      sourceRecords,
      list,
      object.duplicateCriteria,
    );
    return {
      records: duplicates,
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: duplicates.length > 0 ? encodeCursor(0) : null,
        endCursor:
          duplicates.length > 0 ? encodeCursor(duplicates.length - 1) : null,
      },
      totalCount: duplicates.length,
    };
  };

  const createOne = async (
    objectName: string,
    input: Record<string, unknown>,
    context: DataSourceContext,
  ): Promise<DataSourceRecord> => {
    const list = getOrCreate(objectName);
    const normalizedInput = applyDataSourceRecordPosition(input, list);
    const now = new Date().toISOString();
    const actor = buildActorFromContext(context);
    const record: DataSourceRecord = {
      id:
        typeof normalizedInput.id === 'string'
          ? normalizedInput.id
          : crypto.randomUUID(),
      ...normalizedInput,
      ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
      ...(actor !== null && normalizedInput.createdBy === undefined
        ? { createdBy: actor, updatedBy: actor }
        : {}),
      createdAt:
        typeof normalizedInput.createdAt === 'string'
          ? normalizedInput.createdAt
          : now,
      updatedAt: now,
      deletedAt: null,
    } as DataSourceRecord;
    list.unshift(record);
    return record;
  };

  const updateOne = async (
    objectName: string,
    id: string,
    input: Record<string, unknown>,
    context: DataSourceContext,
  ): Promise<DataSourceRecord> => {
    const list = getOrCreate(objectName);
    const index = list.findIndex((record) => record.id === id);
    if (index < 0) throw new Error(`${objectName} not found: ${id}`);
    const normalizedInput = applyDataSourceRecordPosition(input, list);
    const actor = buildActorFromContext(context);
    const updated: DataSourceRecord = {
      ...list[index],
      ...normalizedInput,
      ...(actor !== null && normalizedInput.updatedBy === undefined
        ? { updatedBy: actor }
        : {}),
      id: list[index].id,
      updatedAt: new Date().toISOString(),
    };
    list[index] = updated;
    return updated;
  };

  const deleteOne = async (
    objectName: string,
    id: string,
  ): Promise<DataSourceRecord> => {
    const list = getOrCreate(objectName);
    const index = list.findIndex((record) => record.id === id);
    if (index < 0) throw new Error(`${objectName} not found: ${id}`);
    const now = new Date().toISOString();
    const updated: DataSourceRecord = {
      ...list[index],
      deletedAt: now,
      updatedAt: now,
    };
    list[index] = updated;
    return updated;
  };

  const destroyOne = async (
    objectName: string,
    id: string,
  ): Promise<{ id: string }> => {
    const list = getOrCreate(objectName);
    const before = list.length;
    const filtered = list.filter((record) => record.id !== id);
    if (filtered.length === before)
      throw new Error(`${objectName} not found: ${id}`);
    records.set(objectName, filtered);
    return { id };
  };

  const restoreMany = async (
    objectName: string,
    args: DataSourceFindOneArgs,
  ): Promise<Array<{ id: string }>> => {
    const list = getOrCreate(objectName);
    const predicate = filterToPredicate(args.filter);
    const restored: Array<{ id: string }> = [];
    for (let index = 0; index < list.length; index++) {
      if (predicate(list[index]) && list[index].deletedAt) {
        list[index] = {
          ...list[index],
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        };
        restored.push({ id: list[index].id });
      }
    }
    return restored;
  };

  return {
    mode: 'in-memory',
    findMany,
    findOne,
    findDuplicates,
    createOne,
    updateOne,
    deleteOne,
    destroyOne,
    restoreMany,
    aggregate,
    search,
    reset: (seed: Record<string, DataSourceRecord[]> = {}) => {
      records = cloneSeed(seed);
    },
    exportAll: () => {
      const snapshot: Record<string, DataSourceRecord[]> = {};
      for (const [key, list] of records.entries()) {
        snapshot[key] = list.map((record) => ({ ...record }));
      }
      return snapshot;
    },
  };
};
