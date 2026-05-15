// Translate Twenty's record filter language into Convex's native filter
// expressions. The translator is best-effort: if any leaf operator is not
// natively expressible (`ilike`, `regex`, `containsAny`, …), the whole filter
// degrades to JS post-filtering via `filterToPredicate`. This keeps semantics
// identical to the Dexie + in-memory adapters while pushing the common case
// (eq / neq / in / gt / gte / lt / lte / is / and / or / not) down to Convex's
// indexed `.filter()` API.
//
// Convex's filter builder has no `in`, `like`, `ilike`, or array-containment
// operators, so anything richer falls back. Composite leaf filters (Address,
// Links, FullName, …) drill into nested keys via dotted paths, which Convex's
// `q.field('parent.child')` supports.
//
// Caller pattern:
//   const native = tryBuildConvexFilter(filter);
//   const results = native
//     ? await ctx.db.query(table).filter((q) => native(q)).collect()
//     : (await ctx.db.query(table).collect()).filter(filterToPredicate(filter));

import { type RecordGqlOperationFilter } from '../../types/RecordGqlOperationFilter';

// Convex's `FilterBuilder` shape — typing imported as `any` here so this file
// stays portable between Convex generated typings and tests.
type ConvexExpr = unknown;
type ConvexFilterBuilder = {
  field: (path: string) => ConvexExpr;
  eq: (a: ConvexExpr, b: ConvexExpr) => ConvexExpr;
  neq: (a: ConvexExpr, b: ConvexExpr) => ConvexExpr;
  lt: (a: ConvexExpr, b: ConvexExpr) => ConvexExpr;
  lte: (a: ConvexExpr, b: ConvexExpr) => ConvexExpr;
  gt: (a: ConvexExpr, b: ConvexExpr) => ConvexExpr;
  gte: (a: ConvexExpr, b: ConvexExpr) => ConvexExpr;
  and: (...exprs: ConvexExpr[]) => ConvexExpr;
  or: (...exprs: ConvexExpr[]) => ConvexExpr;
  not: (expr: ConvexExpr) => ConvexExpr;
};

type NativeBuilder = (q: ConvexFilterBuilder) => ConvexExpr;

const UNTRANSLATABLE = Symbol.for('convex-filter:untranslatable');
type BuildResult = NativeBuilder | typeof UNTRANSLATABLE;

const isLogicalKey = (key: string) =>
  key === 'and' || key === 'or' || key === 'not';

const buildLeaf = (
  fieldPath: string,
  leaf: Record<string, unknown>,
): BuildResult => {
  const operators = Object.keys(leaf).filter((key) => leaf[key] !== undefined);

  // Composite leaf (e.g. `name: { firstName: { eq: '…' } }`): every sub-key
  // points to another leaf operator (an object, not an array — `in: […]` is a
  // scalar list, not a sub-leaf). Drill via dotted paths.
  const isComposite =
    operators.length > 0 &&
    operators.every(
      (key) =>
        typeof leaf[key] === 'object' &&
        leaf[key] !== null &&
        !Array.isArray(leaf[key]),
    );
  if (isComposite) {
    const subBuilders: BuildResult[] = operators.map((subKey) =>
      buildLeaf(`${fieldPath}.${subKey}`, leaf[subKey] as Record<string, unknown>),
    );
    return reduceAnd(subBuilders);
  }

  const builders: BuildResult[] = operators.map((op): BuildResult => {
    const value = leaf[op];
    switch (op) {
      case 'is':
        // `is: NULL` matches `null` and `undefined`; Convex distinguishes them
        // so we OR both. `NOT_NULL` mirrors that as a NOT.
        if (value === 'NULL') {
          return (q) =>
            q.or(q.eq(q.field(fieldPath), null), q.eq(q.field(fieldPath), undefined));
        }
        if (value === 'NOT_NULL') {
          return (q) =>
            q.and(
              q.neq(q.field(fieldPath), null),
              q.neq(q.field(fieldPath), undefined),
            );
        }
        return UNTRANSLATABLE;
      case 'eq':
        return (q) => q.eq(q.field(fieldPath), value as ConvexExpr);
      case 'neq':
        return (q) => q.neq(q.field(fieldPath), value as ConvexExpr);
      case 'gt':
        return (q) => q.gt(q.field(fieldPath), value as ConvexExpr);
      case 'gte':
        return (q) => q.gte(q.field(fieldPath), value as ConvexExpr);
      case 'lt':
        return (q) => q.lt(q.field(fieldPath), value as ConvexExpr);
      case 'lte':
        return (q) => q.lte(q.field(fieldPath), value as ConvexExpr);
      case 'in': {
        if (!Array.isArray(value) || value.length === 0) {
          // Empty `in` matches nothing — emit `eq(field, neverValue)` which is
          // always false because we generate a unique sentinel.
          return (q) => q.eq(q.field(fieldPath), '__convex_filter_never__');
        }
        return (q) =>
          q.or(
            ...value.map((candidate) =>
              q.eq(q.field(fieldPath), candidate as ConvexExpr),
            ),
          );
      }
      default:
        // `like`, `ilike`, `regex`, `iregex`, `startsWith`, `isEmptyArray`,
        // `containsAny`, `containsIlike` — Convex has no equivalent.
        return UNTRANSLATABLE;
    }
  });

  return reduceAnd(builders);
};

const reduceAnd = (parts: BuildResult[]): BuildResult => {
  const native = parts.filter((part): part is NativeBuilder => part !== UNTRANSLATABLE);
  if (native.length !== parts.length) return UNTRANSLATABLE;
  if (native.length === 0) return () => true as never;
  if (native.length === 1) return native[0];
  return (q) => q.and(...native.map((part) => part(q)));
};

const buildFilter = (
  filter: RecordGqlOperationFilter | null | undefined,
): BuildResult => {
  if (!filter || Object.keys(filter).length === 0) return () => true as never;

  if ('and' in filter && Array.isArray(filter.and)) {
    return reduceAnd(filter.and.map(buildFilter));
  }
  if ('or' in filter && filter.or !== undefined) {
    const orValue = filter.or as
      | RecordGqlOperationFilter
      | RecordGqlOperationFilter[];
    const orList = Array.isArray(orValue) ? orValue : [orValue];
    const children = orList.map(buildFilter);
    const native = children.filter(
      (child): child is NativeBuilder => child !== UNTRANSLATABLE,
    );
    if (native.length !== children.length) return UNTRANSLATABLE;
    if (native.length === 0) return () => true as never;
    if (native.length === 1) return native[0];
    return (q) => q.or(...native.map((child) => child(q)));
  }
  if ('not' in filter && filter.not) {
    const child = buildFilter(filter.not as RecordGqlOperationFilter);
    if (child === UNTRANSLATABLE) return UNTRANSLATABLE;
    return (q) => q.not(child(q));
  }

  const leafEntries = Object.entries(filter).filter(
    ([key]) => !isLogicalKey(key),
  );
  const children = leafEntries
    .filter(([, leaf]) => typeof leaf === 'object' && leaf !== null)
    .map(([fieldName, leaf]) =>
      buildLeaf(fieldName, leaf as Record<string, unknown>),
    );
  return reduceAnd(children);
};

export const tryBuildConvexFilter = (
  filter: RecordGqlOperationFilter | null | undefined,
): NativeBuilder | null => {
  const result = buildFilter(filter);
  return result === UNTRANSLATABLE ? null : result;
};
