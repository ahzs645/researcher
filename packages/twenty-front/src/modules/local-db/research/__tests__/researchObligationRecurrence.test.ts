import {
  advanceLabel,
  buildNextObligation,
  isRecurring,
} from '@/local-db/research/researchObligationRecurrence';

describe('researchObligationRecurrence', () => {
  describe('isRecurring', () => {
    it('is true for known cadences and false otherwise', () => {
      expect(isRecurring('ANNUAL')).toBe(true);
      expect(isRecurring('QUARTERLY')).toBe(true);
      expect(isRecurring('ONCE')).toBe(false);
      expect(isRecurring(null)).toBe(false);
      expect(isRecurring('WEEKLY')).toBe(false);
    });
  });

  describe('advanceLabel', () => {
    it('bumps a bare year for whole-year cadences', () => {
      expect(advanceLabel('2026', 'ANNUAL')).toBe('2027');
      // Quarterly leaves a bare year untouched (the dates carry the change).
      expect(advanceLabel('2026', 'QUARTERLY')).toBe('2026');
    });

    it('advances a quarter in place, rolling the year', () => {
      expect(advanceLabel('Q1 2026', 'QUARTERLY')).toBe('Q2 2026');
      expect(advanceLabel('Q4 2026', 'QUARTERLY')).toBe('Q1 2027');
      // Semi-annual = +2 quarters.
      expect(advanceLabel('Q3 2026', 'SEMI_ANNUAL')).toBe('Q1 2027');
    });

    it('advances a half-year marker', () => {
      expect(advanceLabel('H1 2026', 'SEMI_ANNUAL')).toBe('H2 2026');
      expect(advanceLabel('H2 2026', 'SEMI_ANNUAL')).toBe('H1 2027');
    });

    it('bumps "Year N" only for whole-year cadences', () => {
      expect(advanceLabel('Year 2', 'ANNUAL')).toBe('Year 3');
      expect(advanceLabel('Year 2', 'QUARTERLY')).toBe('Year 2');
    });

    it('advances a year embedded in a longer title', () => {
      expect(advanceLabel('2026 annual progress report', 'ANNUAL')).toBe(
        '2027 annual progress report',
      );
      expect(advanceLabel('Q1 2026 financial report', 'QUARTERLY')).toBe(
        'Q2 2026 financial report',
      );
    });

    it('passes through empty/unknown input', () => {
      expect(advanceLabel('', 'ANNUAL')).toBe('');
      expect(advanceLabel(null, 'ANNUAL')).toBeNull();
      expect(advanceLabel('2026', 'ONCE')).toBe('2026');
    });
  });

  describe('buildNextObligation', () => {
    it('returns null for one-time / unknown cadences', () => {
      expect(buildNextObligation({ recurrence: 'ONCE' })).toBeNull();
      expect(buildNextObligation({ recurrence: null })).toBeNull();
    });

    it('advances the annual report name, period, and dates by a year', () => {
      const next = buildNextObligation({
        name: '2026 annual progress report',
        reportingPeriod: '2026',
        recurrence: 'ANNUAL',
        dueDate: '2026-12-31T00:00:00.000Z',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-12-31T00:00:00.000Z',
      });

      expect(next).toEqual({
        name: '2027 annual progress report',
        reportingPeriod: '2027',
        dueDate: '2027-12-31T00:00:00.000Z',
        periodStart: '2027-01-01T00:00:00.000Z',
        periodEnd: '2027-12-31T00:00:00.000Z',
      });
    });

    it('advances a quarterly obligation by three months', () => {
      const next = buildNextObligation({
        name: 'Q1 2026 financial report',
        reportingPeriod: 'Q1 2026',
        recurrence: 'QUARTERLY',
        dueDate: '2026-04-30T00:00:00.000Z',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-03-31T00:00:00.000Z',
      });

      expect(next?.name).toBe('Q2 2026 financial report');
      expect(next?.reportingPeriod).toBe('Q2 2026');
      expect(next?.dueDate).toBe('2026-07-30T00:00:00.000Z');
      expect(next?.periodEnd).toBe('2026-06-30T00:00:00.000Z');
    });

    it('clamps the day when the target month is shorter', () => {
      // Jan 31 + 1 month → Feb 28 (2026 is not a leap year), not March.
      const next = buildNextObligation({
        recurrence: 'MONTHLY',
        dueDate: '2026-01-31T00:00:00.000Z',
      });
      expect(next?.dueDate).toBe('2026-02-28T00:00:00.000Z');
    });

    it('tolerates missing dates', () => {
      const next = buildNextObligation({
        name: 'Annual review',
        recurrence: 'ANNUAL',
      });
      expect(next?.dueDate).toBeNull();
      expect(next?.periodStart).toBeNull();
    });
  });
});
