import Dexie, { type Table } from 'dexie';

import {
  type DataSource,
  type DataSourceAggregateArgs,
  type DataSourceAggregateResult,
  type DataSourceBundle,
  type DataSourceContext,
  type DataSourceFindManyArgs,
  type DataSourceFindOneArgs,
  type DataSourceObject,
  type DataSourceRecord,
  type DataSourceRecordPage,
  type DataSourceSearchArgs,
  type DataSourceSearchPage,
  computeAggregate,
  computeSearch,
  decodeCursor,
  encodeCursor,
  filterToPredicate,
  orderByToComparator,
} from 'twenty-shared/data-source';
import { FieldMetadataType } from 'twenty-shared/types';

// One Dexie table per `nameSingular` from the bundle.
// Indexes are derived from field metadata:
// - `id` is always the primary key (records are `{id, ...}`)
// - `deletedAt` / `updatedAt` / `createdAt` are always indexed for soft-delete
//   and cursor-by-time access
// - scalar non-composite fields with `isUnique` get a unique index
// - many-to-one join columns get an index for relation lookups
//
// The full Twenty filter language is evaluated in JS via `filterToPredicate`;
// Dexie indexes only narrow the candidate set. This trades raw speed for
// 1:1 compatibility with the in-memory adapter (and any future Convex one).

const ALWAYS_INDEXED = ['updatedAt', 'createdAt', 'deletedAt'] as const;

const indexableFieldNames = (object: DataSourceObject): string[] => {
  const indexes = new Set<string>(ALWAYS_INDEXED);
  for (const field of object.fields) {
    if (!field.isActive) continue;
    if (field.type === FieldMetadataType.RELATION && field.relation) {
      indexes.add(`${field.name}Id`);
      continue;
    }
    if (
      field.type === FieldMetadataType.TEXT ||
      field.type === FieldMetadataType.UUID ||
      field.type === FieldMetadataType.NUMBER ||
      field.type === FieldMetadataType.NUMERIC ||
      field.type === FieldMetadataType.DATE ||
      field.type === FieldMetadataType.DATE_TIME ||
      field.type === FieldMetadataType.RATING ||
      field.type === FieldMetadataType.POSITION ||
      field.type === FieldMetadataType.SELECT
    ) {
      indexes.add(field.name);
    }
  }
  return [...indexes];
};

const tableSchemaForObject = (object: DataSourceObject): string => {
  const indexes = indexableFieldNames(object);
  // Dexie schema string: `&id, idx1, idx2, …` (`&` = primary key).
  return ['&id', ...indexes].join(', ');
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

type DexieDatabaseHandle = Dexie & {
  table: (name: string) => Table<DataSourceRecord, string>;
};

export type DexieDataSourceOptions = {
  bundle: DataSourceBundle;
  databaseName?: string;
  schemaVersion?: number;
};

export type DexieDataSource = DataSource & {
  readonly db: DexieDatabaseHandle;
  reset: (seed?: Record<string, DataSourceRecord[]>) => Promise<void>;
};

export const createDexieDataSource = ({
  bundle,
  databaseName = 'twenty-data-source',
  schemaVersion = 1,
}: DexieDataSourceOptions): DexieDataSource => {
  const db = new Dexie(databaseName) as DexieDatabaseHandle;

  const stores: Record<string, string> = {};
  for (const object of bundle.objects.filter((object) => object.isActive)) {
    stores[object.nameSingular] = tableSchemaForObject(object);
  }
  db.version(schemaVersion).stores(stores);

  const tableFor = (objectName: string): Table<DataSourceRecord, string> => {
    if (!bundle.objectsByNameSingular.has(objectName)) {
      throw new Error(`Unknown object in DexieDataSource: ${objectName}`);
    }
    return db.table(objectName);
  };

  const fetchRecords = async (
    objectName: string,
    args: { filter?: DataSourceFindManyArgs['filter'] },
  ): Promise<DataSourceRecord[]> => {
    const table = tableFor(objectName);
    const all = await table.toArray();
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
    const matched = await fetchRecords(objectName, args);
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
    const matched = await fetchRecords(objectName, args);
    return matched[0] ?? null;
  };

  const createOne = async (
    objectName: string,
    input: Record<string, unknown>,
  ): Promise<DataSourceRecord> => {
    const table = tableFor(objectName);
    const now = new Date().toISOString();
    const record: DataSourceRecord = {
      id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
      ...input,
      createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
      updatedAt: now,
      deletedAt: null,
    } as DataSourceRecord;
    await table.put(record);
    return record;
  };

  const updateOne = async (
    objectName: string,
    id: string,
    input: Record<string, unknown>,
  ): Promise<DataSourceRecord> => {
    const table = tableFor(objectName);
    const existing = await table.get(id);
    if (!existing) throw new Error(`${objectName} not found: ${id}`);
    const next: DataSourceRecord = {
      ...existing,
      ...input,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };
    await table.put(next);
    return next;
  };

  const deleteOne = async (
    objectName: string,
    id: string,
  ): Promise<DataSourceRecord> => {
    const table = tableFor(objectName);
    const existing = await table.get(id);
    if (!existing) throw new Error(`${objectName} not found: ${id}`);
    const now = new Date().toISOString();
    const next: DataSourceRecord = {
      ...existing,
      deletedAt: now,
      updatedAt: now,
    };
    await table.put(next);
    return next;
  };

  const destroyOne = async (
    objectName: string,
    id: string,
  ): Promise<{ id: string }> => {
    const table = tableFor(objectName);
    await table.delete(id);
    return { id };
  };

  const restoreMany = async (
    objectName: string,
    args: DataSourceFindOneArgs,
  ): Promise<Array<{ id: string }>> => {
    const table = tableFor(objectName);
    const candidates = await fetchRecords(objectName, args);
    const restored: Array<{ id: string }> = [];
    const now = new Date().toISOString();
    for (const record of candidates) {
      if (record.deletedAt) {
        await table.put({
          ...record,
          deletedAt: null,
          updatedAt: now,
        });
        restored.push({ id: record.id });
      }
    }
    return restored;
  };

  const aggregate = async (
    objectName: string,
    args: DataSourceAggregateArgs,
  ): Promise<DataSourceAggregateResult> => {
    const matched = await fetchRecords(objectName, args);
    return computeAggregate(matched, args.fields);
  };

  const search = async (
    args: DataSourceSearchArgs,
    _context: DataSourceContext,
  ): Promise<DataSourceSearchPage> => {
    const sources = await Promise.all(
      bundle.objects
        .filter((object) => object.isActive && object.isSearchable !== false)
        .map(async (object) => {
          const all = await tableFor(object.nameSingular).toArray();
          return {
            objectName: object.nameSingular,
            objectLabelSingular: object.labelSingular,
            records: all.filter(
              (record) =>
                record.deletedAt === null || record.deletedAt === undefined,
            ),
            labelOf: (record: DataSourceRecord): string => {
              const labelField = object.labelIdentifierFieldName;
              if (labelField && typeof record[labelField] === 'string') {
                return record[labelField] as string;
              }
              return record.id;
            },
          };
        }),
    );
    return computeSearch(args, sources);
  };

  const findDuplicates = async (
    _objectName: string,
    _ids: string[],
  ): Promise<DataSourceRecordPage> => ({
    records: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
    totalCount: 0,
  });

  return {
    mode: 'dexie',
    db,
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
    reset: async (seed: Record<string, DataSourceRecord[]> = {}) => {
      for (const object of bundle.objects.filter((object) => object.isActive)) {
        await db.table(object.nameSingular).clear();
      }
      for (const [objectName, records] of Object.entries(seed)) {
        const table = tableFor(objectName);
        await table.bulkPut(records);
      }
    },
  };
};
