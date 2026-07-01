import {
  type DataSourceRecord,
  type DataSourceSearchArgs,
  type DataSourceSearchPage,
} from '../types/DataSourceTypes';
import { encodeCursor } from './cursor';

// Adapter-agnostic substring search across whichever object names the caller
// hands us. Each record is scored by how many of its string-valued fields
// contain the search input (case-insensitive). Resolves to the
// `SearchRecordConnection` shape Twenty's frontend expects.

type SearchSources = {
  objectName: string;
  objectLabelSingular: string;
  records: DataSourceRecord[];
  // Function used to derive the display label for a hit — usually the value
  // of the object's `labelIdentifierFieldName`. If omitted, the search node
  // falls back to the record id.
  labelOf?: (record: DataSourceRecord) => string;
  imageOf?: (record: DataSourceRecord) => string | null;
};

const collectStringValues = (
  record: DataSourceRecord,
  acc: string[] = [],
): string[] => {
  for (const value of Object.values(record)) {
    if (typeof value === 'string') {
      acc.push(value);
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      collectStringValues(value as DataSourceRecord, acc);
    }
  }
  return acc;
};

const matchScore = (record: DataSourceRecord, needle: string): number => {
  // An empty needle means the caller hasn't typed a query yet (e.g. a record
  // picker's initial state) — treat it as "match everything" so pickers show
  // a default list instead of an empty "No records found" state.
  if (needle.length === 0) return 1;
  const lower = needle.toLowerCase();
  let score = 0;
  for (const value of collectStringValues(record)) {
    if (value.toLowerCase().includes(lower)) score += 1;
  }
  return score;
};

export const computeSearch = (
  args: DataSourceSearchArgs,
  sources: SearchSources[],
): DataSourceSearchPage => {
  const included = new Set(args.includedObjectNameSingulars ?? []);
  const excluded = new Set(args.excludedObjectNameSingulars ?? []);
  const targetSources = sources.filter(
    (source) =>
      !excluded.has(source.objectName) &&
      (included.size === 0 || included.has(source.objectName)),
  );

  const hits = targetSources.flatMap((source) =>
    source.records.flatMap((record) => {
      const score = matchScore(record, args.searchInput);
      if (score === 0) return [];
      return [
        {
          score,
          record,
          source,
        },
      ];
    }),
  );

  hits.sort((a, b) => b.score - a.score);
  const limited = hits.slice(0, args.limit);

  const edges = limited.map((hit, index) => ({
    node: {
      recordId: hit.record.id,
      objectNameSingular: hit.source.objectName,
      objectLabelSingular: hit.source.objectLabelSingular,
      label: hit.source.labelOf?.(hit.record) ?? hit.record.id,
      imageUrl: hit.source.imageOf?.(hit.record) ?? null,
      tsRank: hit.score,
      tsRankCD: hit.score,
    },
    cursor: encodeCursor(index),
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage: limited.length < hits.length,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
