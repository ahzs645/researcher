// Recurring obligations — generate the next instance when a recurring obligation
// is completed. Funder reporting repeats on a fixed cadence (annual progress
// reports, quarterly financials), so finishing this year's report should tee up
// next year's rather than leaving a gap.
//
// Pure and deterministic like the rest of the bridge: it computes the next
// period label + dates from the cadence, with no backend.

export type RecurrenceCadence =
  | 'ONCE'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUAL'
  | 'ANNUAL';

const MONTHS_BY_CADENCE: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

// What the caller needs to compute the next instance. All optional so it maps
// straight from an obligation record.
export type RecurringObligationInput = {
  name?: string | null;
  reportingPeriod?: string | null;
  recurrence?: string | null;
  dueDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

// The advanced fields for the next obligation. The caller carries over the
// unchanged fields (assignee, project, grant, type, priority, recurrence).
export type NextObligationFields = {
  name: string;
  reportingPeriod: string | null;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

// True when a recurrence value should spawn a follow-up instance.
export const isRecurring = (recurrence: string | null | undefined): boolean =>
  typeof recurrence === 'string' && recurrence in MONTHS_BY_CADENCE;

// Add whole months to an ISO date, clamping the day to the target month's last
// day (so Jan 31 + 1 month → Feb 28/29, not an overflow into March).
const addMonths = (
  iso: string | null | undefined,
  months: number,
): string | null => {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return date.toISOString();
};

// Advance any period markers found in a label/title in place, so both the
// reporting period ("2026", "Q1 2026") and the title ("2026 annual report")
// roll forward. Replacement is in place to preserve surrounding words.
export const advanceLabel = (
  label: string | null | undefined,
  cadence: string | null | undefined,
): string | null => {
  if (typeof label !== 'string' || label.length === 0) {
    return label ?? null;
  }
  const months = MONTHS_BY_CADENCE[cadence ?? ''];
  if (months === undefined) return label;

  // Quarter, e.g. "Q1 2026" → advance by months/3 quarters, rolling the year.
  const quarter = /\bQ([1-4])\s*(\d{4})\b/i;
  if (quarter.test(label)) {
    return label.replace(quarter, (_match, q: string, year: string) => {
      const index = Number(q) - 1 + months / 3;
      const newYear = Number(year) + Math.floor(index / 4);
      const newQuarter = (((index % 4) + 4) % 4) + 1;
      return `Q${newQuarter} ${newYear}`;
    });
  }

  // Half, e.g. "H2 2026" → advance by months/6 halves.
  const half = /\bH([1-2])\s*(\d{4})\b/i;
  if (half.test(label)) {
    return label.replace(half, (_match, h: string, year: string) => {
      const index = Number(h) - 1 + months / 6;
      const newYear = Number(year) + Math.floor(index / 2);
      const newHalf = (((index % 2) + 2) % 2) + 1;
      return `H${newHalf} ${newYear}`;
    });
  }

  // "Year N" → only meaningful for whole-year cadences.
  const yearN = /\b(Year\s+)(\d+)\b/i;
  if (months % 12 === 0 && yearN.test(label)) {
    return label.replace(
      yearN,
      (_match, prefix: string, n: string) =>
        `${prefix}${Number(n) + months / 12}`,
    );
  }

  // Plain four-digit year(s) — bump by the whole-year delta. Quarterly/monthly
  // cadences leave a bare year untouched (the dates carry the change instead).
  if (months % 12 === 0) {
    return label.replace(
      /\b(19|20)\d{2}\b/,
      (yearMatch) => `${Number(yearMatch) + months / 12}`,
    );
  }

  return label;
};

// Compute the next instance of a recurring obligation, or null for a one-time
// obligation (or an unknown cadence).
export const buildNextObligation = (
  input: RecurringObligationInput,
): NextObligationFields | null => {
  const months = MONTHS_BY_CADENCE[input.recurrence ?? ''];
  if (months === undefined) return null;

  return {
    name: advanceLabel(input.name, input.recurrence) ?? input.name ?? '',
    reportingPeriod: advanceLabel(input.reportingPeriod, input.recurrence),
    dueDate: addMonths(input.dueDate, months),
    periodStart: addMonths(input.periodStart, months),
    periodEnd: addMonths(input.periodEnd, months),
  };
};
