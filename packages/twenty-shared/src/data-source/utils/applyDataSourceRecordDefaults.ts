import { type DataSourceField } from '../types/DataSourceField';
import { type DataSourceObject } from '../types/DataSourceObject';
import { type DataSourceRecord } from '../types/DataSourceTypes';

const cloneDefaultValue = (defaultValue: unknown): unknown => {
  if (defaultValue === null || typeof defaultValue !== 'object') {
    return defaultValue;
  }

  return JSON.parse(JSON.stringify(defaultValue)) as unknown;
};

const shouldApplyDefault = (
  field: DataSourceField,
  value: unknown,
): boolean => {
  if (field.defaultValue === undefined) {
    return false;
  }

  return value === undefined || (field.isNullable === false && value === null);
};

export const applyDataSourceRecordDefaults = (
  object: DataSourceObject,
  record: DataSourceRecord,
): DataSourceRecord => {
  let next: DataSourceRecord | undefined;

  for (const field of object.fields) {
    if (!field.isActive || !shouldApplyDefault(field, record[field.name])) {
      continue;
    }

    next ??= { ...record };
    next[field.name] = cloneDefaultValue(field.defaultValue);
  }

  return next ?? record;
};
