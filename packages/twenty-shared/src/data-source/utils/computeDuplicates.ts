import { type DataSourceRecord } from '../types/DataSourceTypes';

// Given the records identified by `ids` and the rest of the collection, find
// records that look like duplicates of any of the source records under any of
// the object's `duplicateCriteria` (each criterion is an array of field names
// that must all match for two records to be considered duplicates of each
// other).
//
// Soft-deleted rows are excluded from candidates. Source records are excluded
// from results so a record is never flagged as a duplicate of itself.
//
// Returns deduplicated candidates preserving discovery order.
export const computeDuplicates = (
  sourceRecords: DataSourceRecord[],
  candidateRecords: DataSourceRecord[],
  duplicateCriteria: string[][] | null | undefined,
): DataSourceRecord[] => {
  if (!duplicateCriteria || duplicateCriteria.length === 0) {
    return [];
  }
  if (sourceRecords.length === 0) {
    return [];
  }

  const sourceIds = new Set(sourceRecords.map((record) => record.id));
  const liveCandidates = candidateRecords.filter(
    (record) =>
      !sourceIds.has(record.id) &&
      (record.deletedAt === null || record.deletedAt === undefined),
  );

  const matchedById = new Map<string, DataSourceRecord>();

  for (const source of sourceRecords) {
    for (const criterion of duplicateCriteria) {
      if (criterion.length === 0) continue;
      if (
        criterion.some((fieldName) => {
          const value = source[fieldName];
          return value === null || value === undefined || value === '';
        })
      ) {
        // A criterion only matches when every field on the source has a
        // value to compare against. Twenty's backend treats nulls as
        // non-matching so we don't flag every empty record as a duplicate.
        continue;
      }
      for (const candidate of liveCandidates) {
        const matches = criterion.every(
          (fieldName) =>
            JSON.stringify(candidate[fieldName]) ===
            JSON.stringify(source[fieldName]),
        );
        if (matches) {
          matchedById.set(candidate.id, candidate);
        }
      }
    }
  }

  return [...matchedById.values()];
};
