import { type OrderBy } from '../../types/OrderBy';
import { type RecordGqlOperationOrderBy } from '../../types/RecordGqlOperationOrderBy';

type Comparator = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) => number;

const getDirection = (value: OrderBy): number =>
  value === 'AscNullsFirst' || value === 'AscNullsLast' ? 1 : -1;

const nullsFirst = (value: OrderBy): boolean =>
  value === 'AscNullsFirst' || value === 'DescNullsFirst';

const isOrderByLiteral = (value: unknown): value is OrderBy =>
  value === 'AscNullsFirst' ||
  value === 'AscNullsLast' ||
  value === 'DescNullsFirst' ||
  value === 'DescNullsLast';

const compareValues = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  // Dates serialize as ISO strings in records — string compare is monotone.
  return String(a).localeCompare(String(b));
};

const buildScalarComparator = (
  fieldName: string,
  orderBy: OrderBy,
): Comparator => {
  const direction = getDirection(orderBy);
  const wantNullsFirst = nullsFirst(orderBy);
  return (a, b) => {
    const aValue = a[fieldName];
    const bValue = b[fieldName];
    const aIsNull = aValue === null || aValue === undefined;
    const bIsNull = bValue === null || bValue === undefined;
    if (aIsNull && bIsNull) return 0;
    if (aIsNull) return wantNullsFirst ? -1 : 1;
    if (bIsNull) return wantNullsFirst ? 1 : -1;
    return compareValues(aValue, bValue) * direction;
  };
};

const buildNestedComparator = (
  fieldName: string,
  subEntries: Array<[string, OrderBy]>,
): Comparator => {
  const subComparators = subEntries.map(([subField, orderBy]) => {
    const direction = getDirection(orderBy);
    const wantNullsFirst = nullsFirst(orderBy);
    return (a: Record<string, unknown>, b: Record<string, unknown>): number => {
      const aOuter = a[fieldName];
      const bOuter = b[fieldName];
      const aValue =
        typeof aOuter === 'object' && aOuter !== null
          ? (aOuter as Record<string, unknown>)[subField]
          : undefined;
      const bValue =
        typeof bOuter === 'object' && bOuter !== null
          ? (bOuter as Record<string, unknown>)[subField]
          : undefined;
      const aIsNull = aValue === null || aValue === undefined;
      const bIsNull = bValue === null || bValue === undefined;
      if (aIsNull && bIsNull) return 0;
      if (aIsNull) return wantNullsFirst ? -1 : 1;
      if (bIsNull) return wantNullsFirst ? 1 : -1;
      return compareValues(aValue, bValue) * direction;
    };
  });

  return (a, b) => {
    for (const compare of subComparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
};

export const orderByToComparator = (
  orderBy: RecordGqlOperationOrderBy | null | undefined,
): Comparator => {
  if (!orderBy || orderBy.length === 0) {
    return () => 0;
  }

  const comparators: Comparator[] = orderBy.flatMap((clause) =>
    Object.entries(clause).map(([fieldName, value]) => {
      if (isOrderByLiteral(value)) {
        return buildScalarComparator(fieldName, value);
      }
      if (typeof value === 'object' && value !== null) {
        const subEntries: Array<[string, OrderBy]> = [];
        for (const [subField, subValue] of Object.entries(value)) {
          if (isOrderByLiteral(subValue)) {
            subEntries.push([subField, subValue]);
          }
        }
        if (subEntries.length > 0) {
          return buildNestedComparator(fieldName, subEntries);
        }
      }
      return () => 0;
    }),
  );

  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
};
