import { type RecordGqlOperationFilter } from '../../types/RecordGqlOperationFilter';
import { tryBuildConvexFilter } from '../utils/buildConvexFilter';

// Mock Convex filter builder that produces structural objects, so the test
// asserts the *shape* of the expression tree rather than depending on Convex
// runtime semantics.
type Expr =
  | { op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; lhs: Expr; rhs: unknown }
  | { op: 'and' | 'or'; args: Expr[] }
  | { op: 'not'; arg: Expr }
  | { op: 'field'; path: string };

const q = {
  field: (path: string) => ({ op: 'field', path }) as Expr,
  eq: (lhs: Expr, rhs: unknown) => ({ op: 'eq', lhs, rhs }) as Expr,
  neq: (lhs: Expr, rhs: unknown) => ({ op: 'neq', lhs, rhs }) as Expr,
  lt: (lhs: Expr, rhs: unknown) => ({ op: 'lt', lhs, rhs }) as Expr,
  lte: (lhs: Expr, rhs: unknown) => ({ op: 'lte', lhs, rhs }) as Expr,
  gt: (lhs: Expr, rhs: unknown) => ({ op: 'gt', lhs, rhs }) as Expr,
  gte: (lhs: Expr, rhs: unknown) => ({ op: 'gte', lhs, rhs }) as Expr,
  and: (...args: Expr[]) => ({ op: 'and', args }) as Expr,
  or: (...args: Expr[]) => ({ op: 'or', args }) as Expr,
  not: (arg: Expr) => ({ op: 'not', arg }) as Expr,
};

const build = (filter: RecordGqlOperationFilter | null | undefined): Expr | null => {
  const fn = tryBuildConvexFilter(filter);
  if (fn === null) return null;
  return fn(q as never) as Expr;
};

describe('tryBuildConvexFilter', () => {
  it('returns a true-equivalent for empty / nullish input', () => {
    expect(build(null)).toBe(true);
    expect(build(undefined)).toBe(true);
    expect(build({})).toBe(true);
  });

  it('translates eq on a top-level field', () => {
    expect(build({ name: { eq: 'Acme' } })).toEqual({
      op: 'eq',
      lhs: { op: 'field', path: 'name' },
      rhs: 'Acme',
    });
  });

  it('translates the full set of comparison operators', () => {
    const filter = {
      employees: { gte: 10, lt: 100 },
    } as RecordGqlOperationFilter;
    expect(build(filter)).toEqual({
      op: 'and',
      args: [
        { op: 'gte', lhs: { op: 'field', path: 'employees' }, rhs: 10 },
        { op: 'lt', lhs: { op: 'field', path: 'employees' }, rhs: 100 },
      ],
    });
  });

  it('expands `in` into an OR over equality', () => {
    expect(
      build({ status: { in: ['ACTIVE', 'PENDING'] } } as RecordGqlOperationFilter),
    ).toEqual({
      op: 'or',
      args: [
        { op: 'eq', lhs: { op: 'field', path: 'status' }, rhs: 'ACTIVE' },
        { op: 'eq', lhs: { op: 'field', path: 'status' }, rhs: 'PENDING' },
      ],
    });
  });

  it('translates `is: NULL` to null OR undefined equality', () => {
    expect(build({ deletedAt: { is: 'NULL' } })).toEqual({
      op: 'or',
      args: [
        { op: 'eq', lhs: { op: 'field', path: 'deletedAt' }, rhs: null },
        { op: 'eq', lhs: { op: 'field', path: 'deletedAt' }, rhs: undefined },
      ],
    });
  });

  it('drills composite leaves via dotted paths', () => {
    const filter = {
      name: { firstName: { eq: 'Ada' }, lastName: { eq: 'Lovelace' } },
    } as RecordGqlOperationFilter;
    expect(build(filter)).toEqual({
      op: 'and',
      args: [
        { op: 'eq', lhs: { op: 'field', path: 'name.firstName' }, rhs: 'Ada' },
        { op: 'eq', lhs: { op: 'field', path: 'name.lastName' }, rhs: 'Lovelace' },
      ],
    });
  });

  it('translates logical and/or/not', () => {
    const filter = {
      and: [
        { status: { eq: 'ACTIVE' } },
        { or: [{ region: { eq: 'EU' } }, { region: { eq: 'US' } }] },
        { not: { archived: { eq: true } } },
      ],
    } as RecordGqlOperationFilter;
    expect(build(filter)).toEqual({
      op: 'and',
      args: [
        { op: 'eq', lhs: { op: 'field', path: 'status' }, rhs: 'ACTIVE' },
        {
          op: 'or',
          args: [
            { op: 'eq', lhs: { op: 'field', path: 'region' }, rhs: 'EU' },
            { op: 'eq', lhs: { op: 'field', path: 'region' }, rhs: 'US' },
          ],
        },
        {
          op: 'not',
          arg: { op: 'eq', lhs: { op: 'field', path: 'archived' }, rhs: true },
        },
      ],
    });
  });

  it('returns null for ilike (no native equivalent)', () => {
    expect(build({ name: { ilike: '%acme%' } } as RecordGqlOperationFilter)).toBeNull();
  });

  it('returns null for regex / iregex', () => {
    expect(build({ name: { regex: '^A' } } as RecordGqlOperationFilter)).toBeNull();
    expect(build({ name: { iregex: '^a' } } as RecordGqlOperationFilter)).toBeNull();
  });

  it('returns null for array operators (containsAny / isEmptyArray)', () => {
    expect(
      build({ tags: { containsAny: ['retail'] } } as RecordGqlOperationFilter),
    ).toBeNull();
    expect(
      build({ tags: { isEmptyArray: true } } as RecordGqlOperationFilter),
    ).toBeNull();
  });

  it('returns null if any leaf in an AND is untranslatable (all-or-nothing)', () => {
    const filter = {
      and: [{ name: { eq: 'Acme' } }, { tagline: { ilike: '%maker%' } }],
    } as RecordGqlOperationFilter;
    expect(build(filter)).toBeNull();
  });
});
