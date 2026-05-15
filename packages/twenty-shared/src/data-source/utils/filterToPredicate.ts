import { type RecordGqlOperationFilter } from '../../types/RecordGqlOperationFilter';

// Translate a Twenty GraphQL record filter into an in-memory predicate.
// Adapters that store records in JS arrays / Maps (Dexie's `toArray` result,
// in-memory test stubs, Convex's full-collection fetches before native
// translation lands) can use this directly: `records.filter(predicate)`.
//
// Leaf semantics intentionally mirror what Twenty's NestJS resolver produces
// (TypeORM ilike → case-insensitive; like → case-sensitive; is: NULL matches
// `null` and `undefined`; etc.). When in doubt about a corner case, the
// twenty-server `record-filter` package is the source of truth.

type Predicate = (record: Record<string, unknown>) => boolean;

const TRUE: Predicate = () => true;
const getNested = (record: Record<string, unknown>, fieldName: string) =>
  record[fieldName];

const stringEquals = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' && a === b;

const stringIncludes = (a: unknown, needle: unknown, ci = false) => {
  if (typeof a !== 'string' || typeof needle !== 'string') return false;
  const haystack = ci ? a.toLowerCase() : a;
  const search = ci ? needle.toLowerCase() : needle;
  return haystack.includes(search);
};

const matchLikePattern = (
  value: unknown,
  pattern: unknown,
  ci = false,
): boolean => {
  if (typeof value !== 'string' || typeof pattern !== 'string') return false;
  const regexSource = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  const flags = ci ? 'i' : '';
  return new RegExp(`^${regexSource}$`, flags).test(value);
};

const matchRegex = (value: unknown, pattern: unknown, ci = false) => {
  if (typeof value !== 'string' || typeof pattern !== 'string') return false;
  return new RegExp(pattern, ci ? 'i' : '').test(value);
};

const compareNumeric = (a: unknown, b: unknown): number | null => {
  const aNum = typeof a === 'string' ? Number(a) : a;
  const bNum = typeof b === 'string' ? Number(b) : b;
  if (typeof aNum !== 'number' || typeof bNum !== 'number') return null;
  if (Number.isNaN(aNum) || Number.isNaN(bNum)) return null;
  return aNum - bNum;
};

const compareDates = (a: unknown, b: unknown): number | null => {
  const aDate = typeof a === 'string' || a instanceof Date ? new Date(a) : null;
  const bDate = typeof b === 'string' || b instanceof Date ? new Date(b) : null;
  if (!aDate || !bDate) return null;
  const aTime = aDate.getTime();
  const bTime = bDate.getTime();
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) return null;
  return aTime - bTime;
};

const compareGeneric = (a: unknown, b: unknown): number | null => {
  const numeric = compareNumeric(a, b);
  if (numeric !== null) return numeric;
  return compareDates(a, b);
};

const isNullish = (value: unknown) => value === null || value === undefined;

const evaluateLeafFilter = (
  fieldValue: unknown,
  leaf: Record<string, unknown>,
): boolean => {
  if (leaf.is === 'NULL') return isNullish(fieldValue);
  if (leaf.is === 'NOT_NULL') return !isNullish(fieldValue);

  if ('eq' in leaf && leaf.eq !== undefined) {
    if (typeof fieldValue === typeof leaf.eq) {
      if (typeof fieldValue === 'string')
        return stringEquals(fieldValue, leaf.eq);
      if (typeof fieldValue === 'number' || typeof fieldValue === 'boolean')
        return fieldValue === leaf.eq;
    }
    if (fieldValue instanceof Date && typeof leaf.eq === 'string') {
      return fieldValue.toISOString() === leaf.eq;
    }
    return fieldValue === leaf.eq;
  }
  if ('neq' in leaf && leaf.neq !== undefined) {
    return fieldValue !== leaf.neq;
  }
  if ('in' in leaf && Array.isArray(leaf.in)) {
    return leaf.in.some((candidate) => candidate === fieldValue);
  }
  if ('startsWith' in leaf && typeof leaf.startsWith === 'string') {
    return (
      typeof fieldValue === 'string' && fieldValue.startsWith(leaf.startsWith)
    );
  }
  if ('like' in leaf && typeof leaf.like === 'string') {
    return matchLikePattern(fieldValue, leaf.like, false);
  }
  if ('ilike' in leaf && typeof leaf.ilike === 'string') {
    return matchLikePattern(fieldValue, leaf.ilike, true);
  }
  if ('regex' in leaf && typeof leaf.regex === 'string') {
    return matchRegex(fieldValue, leaf.regex, false);
  }
  if ('iregex' in leaf && typeof leaf.iregex === 'string') {
    return matchRegex(fieldValue, leaf.iregex, true);
  }
  if ('gt' in leaf && leaf.gt !== undefined) {
    const diff = compareGeneric(fieldValue, leaf.gt);
    return diff !== null && diff > 0;
  }
  if ('gte' in leaf && leaf.gte !== undefined) {
    const diff = compareGeneric(fieldValue, leaf.gte);
    return diff !== null && diff >= 0;
  }
  if ('lt' in leaf && leaf.lt !== undefined) {
    const diff = compareGeneric(fieldValue, leaf.lt);
    return diff !== null && diff < 0;
  }
  if ('lte' in leaf && leaf.lte !== undefined) {
    const diff = compareGeneric(fieldValue, leaf.lte);
    return diff !== null && diff <= 0;
  }
  if ('isEmptyArray' in leaf && typeof leaf.isEmptyArray === 'boolean') {
    return leaf.isEmptyArray
      ? Array.isArray(fieldValue) && fieldValue.length === 0
      : Array.isArray(fieldValue) && fieldValue.length > 0;
  }
  if ('containsAny' in leaf && Array.isArray(leaf.containsAny)) {
    if (!Array.isArray(fieldValue)) return false;
    return leaf.containsAny.some((candidate) => fieldValue.includes(candidate));
  }
  if ('containsIlike' in leaf && typeof leaf.containsIlike === 'string') {
    if (!Array.isArray(fieldValue)) return false;
    return fieldValue.some((value) =>
      stringIncludes(value, leaf.containsIlike, true),
    );
  }
  // For composite leaf filters (e.g. AddressFilter / FullNameFilter): the
  // value at each sub-field key is itself a leaf filter against the matching
  // sub-property of the composite field value.
  if (
    typeof fieldValue === 'object' &&
    fieldValue !== null &&
    Object.values(leaf).some(
      (value) => typeof value === 'object' && value !== null,
    )
  ) {
    return Object.entries(leaf).every(([subField, subLeaf]) => {
      if (typeof subLeaf !== 'object' || subLeaf === null) return true;
      return evaluateLeafFilter(
        (fieldValue as Record<string, unknown>)[subField],
        subLeaf as Record<string, unknown>,
      );
    });
  }
  // No operator matched — treat as "no constraint".
  return true;
};

const isLogicalKey = (key: string) =>
  key === 'and' || key === 'or' || key === 'not';

export const filterToPredicate = (
  filter: RecordGqlOperationFilter | null | undefined,
): Predicate => {
  if (!filter || Object.keys(filter).length === 0) return TRUE;

  if ('and' in filter && Array.isArray(filter.and)) {
    const children = filter.and.map((subFilter) =>
      filterToPredicate(subFilter as RecordGqlOperationFilter),
    );
    return (record) => children.every((predicate) => predicate(record));
  }
  if ('or' in filter && filter.or !== undefined) {
    const orValue = filter.or as
      | RecordGqlOperationFilter
      | RecordGqlOperationFilter[];
    const orList = Array.isArray(orValue) ? orValue : [orValue];
    const children = orList.map((subFilter) =>
      filterToPredicate(subFilter as RecordGqlOperationFilter),
    );
    if (children.length === 0) return TRUE;
    return (record) => children.some((predicate) => predicate(record));
  }
  if ('not' in filter && filter.not) {
    const child = filterToPredicate(filter.not as RecordGqlOperationFilter);
    return (record) => !child(record);
  }

  const leafEntries = Object.entries(filter).filter(
    ([key]) => !isLogicalKey(key),
  );
  if (leafEntries.length === 0) return TRUE;

  return (record) =>
    leafEntries.every(([fieldName, leaf]) => {
      if (typeof leaf !== 'object' || leaf === null) return true;
      return evaluateLeafFilter(
        getNested(record, fieldName),
        leaf as Record<string, unknown>,
      );
    });
};
