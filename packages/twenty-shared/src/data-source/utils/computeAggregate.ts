import {
  type DataSourceAggregateResult,
  type DataSourceRecord,
} from '../types/DataSourceTypes';

// Map a requested aggregate field name (e.g. `minEmployees`, `countTrueIsActive`,
// `totalCount`, `minRevenueAmountMicros`) onto the actual operation and the
// underlying record field. Mirrors `getAvailableAggregationsFromObjectFields`
// on the twenty-front side so the dispatch is the inverse of how the
// frontend builds aggregate field names.

type AggregateOp =
  | 'totalCount'
  | 'count'
  | 'countUniqueValues'
  | 'countEmpty'
  | 'countNotEmpty'
  | 'countTrue'
  | 'countFalse'
  | 'percentageEmpty'
  | 'percentageNotEmpty'
  | 'min'
  | 'max'
  | 'avg'
  | 'sum';

type ParsedAggregate = {
  op: AggregateOp;
  fieldName: string | null;
  // For Currency aggregates Twenty emits `<op><FieldName>AmountMicros`. The
  // adapter has to read the numeric amount from the composite field value.
  compositeAccessor: 'amountMicros' | null;
};

const lowerFirst = (str: string) =>
  str.length === 0 ? str : str[0].toLowerCase() + str.slice(1);

const parseAggregateField = (fieldName: string): ParsedAggregate | null => {
  if (fieldName === 'totalCount') {
    return { op: 'totalCount', fieldName: null, compositeAccessor: null };
  }

  const prefixes: Array<{ prefix: string; op: AggregateOp }> = [
    { prefix: 'countUniqueValues', op: 'countUniqueValues' },
    { prefix: 'countNotEmpty', op: 'countNotEmpty' },
    { prefix: 'countEmpty', op: 'countEmpty' },
    { prefix: 'countTrue', op: 'countTrue' },
    { prefix: 'countFalse', op: 'countFalse' },
    { prefix: 'percentageEmpty', op: 'percentageEmpty' },
    { prefix: 'percentageNotEmpty', op: 'percentageNotEmpty' },
    { prefix: 'count', op: 'count' },
    { prefix: 'min', op: 'min' },
    { prefix: 'max', op: 'max' },
    { prefix: 'avg', op: 'avg' },
    { prefix: 'sum', op: 'sum' },
  ];

  for (const { prefix, op } of prefixes) {
    if (!fieldName.startsWith(prefix) || fieldName.length === prefix.length) {
      continue;
    }
    const remainder = fieldName.slice(prefix.length);
    if (remainder.endsWith('AmountMicros')) {
      const stripped = remainder.slice(0, -'AmountMicros'.length);
      return {
        op,
        fieldName: lowerFirst(stripped),
        compositeAccessor: 'amountMicros',
      };
    }
    return { op, fieldName: lowerFirst(remainder), compositeAccessor: null };
  }

  return null;
};

const readNumeric = (
  record: DataSourceRecord,
  fieldName: string,
  compositeAccessor: ParsedAggregate['compositeAccessor'],
): number | null => {
  const raw = record[fieldName];
  if (raw === null || raw === undefined) return null;
  if (
    compositeAccessor &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw !== null
  ) {
    const candidate = (raw as Record<string, unknown>)[compositeAccessor];
    return typeof candidate === 'number' ? candidate : null;
  }
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

export const computeAggregate = (
  records: DataSourceRecord[],
  requestedFields: string[],
): DataSourceAggregateResult => {
  const result: DataSourceAggregateResult = {};

  for (const aggregateFieldName of requestedFields) {
    const parsed = parseAggregateField(aggregateFieldName);
    if (!parsed) continue;

    if (parsed.op === 'totalCount') {
      result[aggregateFieldName] = records.length;
      continue;
    }
    const fieldName = parsed.fieldName;
    if (!fieldName) continue;

    if (parsed.op === 'count') {
      result[aggregateFieldName] = records.filter(
        (record) => !isEmpty(record[fieldName]),
      ).length;
      continue;
    }

    if (parsed.op === 'countEmpty') {
      result[aggregateFieldName] = records.filter((record) =>
        isEmpty(record[fieldName]),
      ).length;
      continue;
    }

    if (parsed.op === 'countNotEmpty') {
      result[aggregateFieldName] = records.filter(
        (record) => !isEmpty(record[fieldName]),
      ).length;
      continue;
    }

    if (parsed.op === 'countUniqueValues') {
      const distinct = new Set<unknown>();
      for (const record of records) {
        const value = record[fieldName];
        if (isEmpty(value)) continue;
        distinct.add(typeof value === 'object' ? JSON.stringify(value) : value);
      }
      result[aggregateFieldName] = distinct.size;
      continue;
    }

    if (parsed.op === 'percentageEmpty' || parsed.op === 'percentageNotEmpty') {
      if (records.length === 0) {
        result[aggregateFieldName] = 0;
        continue;
      }
      const emptyCount = records.filter((record) =>
        isEmpty(record[fieldName]),
      ).length;
      const fraction =
        parsed.op === 'percentageEmpty'
          ? emptyCount / records.length
          : (records.length - emptyCount) / records.length;
      result[aggregateFieldName] = fraction;
      continue;
    }

    if (parsed.op === 'countTrue' || parsed.op === 'countFalse') {
      const target = parsed.op === 'countTrue';
      result[aggregateFieldName] = records.filter(
        (record) => record[fieldName] === target,
      ).length;
      continue;
    }

    if (
      parsed.op === 'min' ||
      parsed.op === 'max' ||
      parsed.op === 'avg' ||
      parsed.op === 'sum'
    ) {
      const numericValues = records
        .map((record) =>
          readNumeric(record, fieldName, parsed.compositeAccessor),
        )
        .filter((value): value is number => value !== null);
      if (numericValues.length === 0) {
        result[aggregateFieldName] = null;
        continue;
      }
      if (parsed.op === 'min')
        result[aggregateFieldName] = Math.min(...numericValues);
      else if (parsed.op === 'max')
        result[aggregateFieldName] = Math.max(...numericValues);
      else if (parsed.op === 'sum')
        result[aggregateFieldName] = numericValues.reduce(
          (acc, value) => acc + value,
          0,
        );
      else if (parsed.op === 'avg')
        result[aggregateFieldName] =
          numericValues.reduce((acc, value) => acc + value, 0) /
          numericValues.length;
    }
  }

  return result;
};
