import { type DataSourceRecord } from '../types/DataSourceTypes';

const numericPositions = (records: DataSourceRecord[]): number[] =>
  records
    .map((record) => record.position)
    .filter(
      (position): position is number =>
        typeof position === 'number' && Number.isFinite(position),
    );

export const resolveDataSourceRecordPosition = (
  position: unknown,
  records: DataSourceRecord[],
): unknown => {
  if (position === 'first') {
    const positions = numericPositions(records);
    return positions.length === 0 ? 0 : Math.min(...positions) - 1;
  }

  if (position === 'last') {
    const positions = numericPositions(records);
    return positions.length === 0 ? 0 : Math.max(...positions) + 1;
  }

  return position;
};

export const applyDataSourceRecordPosition = (
  input: Record<string, unknown>,
  records: DataSourceRecord[],
): Record<string, unknown> => {
  if (!Object.prototype.hasOwnProperty.call(input, 'position')) {
    return input;
  }

  const position = resolveDataSourceRecordPosition(input.position, records);

  return position === input.position ? input : { ...input, position };
};
