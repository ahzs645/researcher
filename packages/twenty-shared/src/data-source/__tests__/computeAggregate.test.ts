import { computeAggregate } from '../utils/computeAggregate';

const records = [
  { id: 'a', name: 'Acme', employees: 12, isActive: true, tags: ['retail'] },
  { id: 'b', name: 'Initech', employees: 4, isActive: false, tags: [] },
  { id: 'c', name: '', employees: null, isActive: true, tags: ['software'] },
];

describe('computeAggregate', () => {
  it('returns totalCount for every record', () => {
    const result = computeAggregate(records, ['totalCount']);
    expect(result.totalCount).toBe(3);
  });

  it('counts only non-empty values when prefixed countX', () => {
    const result = computeAggregate(records, [
      'countName',
      'countEmployees',
      'countTags',
    ]);
    expect(result.countName).toBe(2);
    expect(result.countEmployees).toBe(2);
    expect(result.countTags).toBe(2); // empty array counts as empty
  });

  it('handles min / max / avg / sum on numeric fields', () => {
    const result = computeAggregate(records, [
      'minEmployees',
      'maxEmployees',
      'avgEmployees',
      'sumEmployees',
    ]);
    expect(result.minEmployees).toBe(4);
    expect(result.maxEmployees).toBe(12);
    expect(result.avgEmployees).toBeCloseTo(8);
    expect(result.sumEmployees).toBe(16);
  });

  it('handles countTrue / countFalse on booleans', () => {
    const result = computeAggregate(records, [
      'countTrueIsActive',
      'countFalseIsActive',
    ]);
    expect(result.countTrueIsActive).toBe(2);
    expect(result.countFalseIsActive).toBe(1);
  });

  it('parses currency aggregates by stripping AmountMicros suffix', () => {
    const result = computeAggregate(
      [
        { id: '1', revenue: { amountMicros: 100, currencyCode: 'USD' } },
        { id: '2', revenue: { amountMicros: 200, currencyCode: 'USD' } },
      ],
      ['sumRevenueAmountMicros', 'avgRevenueAmountMicros'],
    );
    expect(result.sumRevenueAmountMicros).toBe(300);
    expect(result.avgRevenueAmountMicros).toBe(150);
  });

  it('returns percentageEmpty / percentageNotEmpty as fractions of total', () => {
    const result = computeAggregate(records, [
      'percentageEmptyName',
      'percentageNotEmptyEmployees',
    ]);
    expect(result.percentageEmptyName).toBeCloseTo(1 / 3);
    expect(result.percentageNotEmptyEmployees).toBeCloseTo(2 / 3);
  });
});
