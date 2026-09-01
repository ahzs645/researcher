import { isNonEmptyString } from '@sniptt/guards';

import { normalizeDoi } from './manuscriptReferenceStore';
import { type SubmissionCheck } from './manuscriptSubmission';
import { type ReferenceLike } from './manuscriptTypes';

// Retracted-reference checking, the job Zotero's Retraction Scanner does for a
// library. Crossref absorbed the Retraction Watch database in 2023 and serves
// it free: a retracted work carries an `update-to` relation whose `type` is
// "retraction", pointing at the DOI of the notice. Corrections, errata and
// expressions of concern arrive through the same relation with a different
// type, and are worth surfacing too — citing a paper without its correction is
// its own kind of error.
//
// The verdict is pure so it can be tested against a recorded Crossref payload.
// The fetching lives in the panel. The distinction that matters most here is
// CLEAN versus UNKNOWN: offline, or a DOI Crossref has never heard of, is *not*
// a clean bill of health, and this module never lets the two collapse.

export type RetractionNoticeType =
  | 'RETRACTION'
  | 'EXPRESSION_OF_CONCERN'
  | 'CORRECTION'
  | 'OTHER';

export type RetractionNotice = {
  type: RetractionNoticeType;
  // Crossref's own wording ("Retraction", "Corrigendum") when it gave one.
  label: string;
  doi: string | null;
  // ISO yyyy-mm-dd of the notice, when Crossref dated it.
  date: string | null;
};

export type RetractionStatus =
  | 'RETRACTED'
  | 'CONCERN'
  | 'CORRECTED'
  | 'CLEAN'
  | 'UNKNOWN';

export type RetractionVerdict = {
  status: RetractionStatus;
  notices: RetractionNotice[];
  // One line fit to show next to the reference.
  summary: string;
};

// Crossref's `update-to` vocabulary. Anything unlisted is reported as OTHER
// rather than silently dropped — a relation we have not seen before is still a
// reason to look at the reference.
const NOTICE_TYPES: Record<string, RetractionNoticeType> = {
  retraction: 'RETRACTION',
  partial_retraction: 'RETRACTION',
  withdrawal: 'RETRACTION',
  removal: 'RETRACTION',
  expression_of_concern: 'EXPRESSION_OF_CONCERN',
  correction: 'CORRECTION',
  corrigendum: 'CORRECTION',
  erratum: 'CORRECTION',
  addendum: 'CORRECTION',
  clarification: 'CORRECTION',
  new_edition: 'OTHER',
  new_version: 'OTHER',
};

const NOTICE_FALLBACK_LABELS: Record<RetractionNoticeType, string> = {
  RETRACTION: 'Retraction',
  EXPRESSION_OF_CONCERN: 'Expression of concern',
  CORRECTION: 'Correction',
  OTHER: 'Update',
};

// Worst notice wins the verdict: a paper both corrected and later retracted is
// retracted.
const STATUS_BY_NOTICE: Record<RetractionNoticeType, RetractionStatus> = {
  RETRACTION: 'RETRACTED',
  EXPRESSION_OF_CONCERN: 'CONCERN',
  CORRECTION: 'CORRECTED',
  OTHER: 'CORRECTED',
};

const STATUS_SEVERITY: Record<RetractionStatus, number> = {
  RETRACTED: 4,
  CONCERN: 3,
  CORRECTED: 2,
  UNKNOWN: 1,
  CLEAN: 0,
};

export const isFlaggedRetractionStatus = (status: RetractionStatus): boolean =>
  status === 'RETRACTED' || status === 'CONCERN' || status === 'CORRECTED';

const UNKNOWN_VERDICT: RetractionVerdict = {
  status: 'UNKNOWN',
  notices: [],
  summary: 'Not checked — no data from Crossref',
};

// ── Request URLs ────────────────────────────────────────────────────────────

const CROSSREF_API = 'https://api.crossref.org/works';

// Crossref wants the DOI's slashes left alone; only the rest needs escaping.
const encodeDoiPath = (doi: string): string =>
  doi.split('/').map(encodeURIComponent).join('/');

export const crossrefWorkUrl = (doi: string): string =>
  `${CROSSREF_API}/${encodeDoiPath(normalizeDoi(doi))}`;

// Forty is well inside Crossref's URL and row limits and turns a sixty-item
// bibliography into two requests instead of sixty.
export const CROSSREF_BATCH_SIZE = 40;

// `filter=doi:a,doi:b` is an OR across DOIs, so one request answers a whole
// batch. `select` keeps the reply to the three fields the verdict reads —
// without it Crossref returns every work in full, which is megabytes.
export const crossrefRetractionBatchUrl = (
  dois: string[],
  { select = true }: { select?: boolean } = {},
): string => {
  const filter = dois.map((doi) => `doi:${normalizeDoi(doi)}`).join(',');
  const selectPart = select ? '&select=DOI,update-to,title' : '';
  return `${CROSSREF_API}?filter=${encodeURIComponent(filter)}${selectPart}&rows=${dois.length}`;
};

// A DOI containing a comma would split Crossref's filter list in two, so those
// few have to be asked for one at a time.
export const isBatchableDoi = (doi: string): boolean =>
  !normalizeDoi(doi).includes(',');

export const chunkDoisForCrossref = (
  dois: string[],
  size: number = CROSSREF_BATCH_SIZE,
): string[][] => {
  const chunks: string[][] = [];
  for (let index = 0; index < dois.length; index += size) {
    chunks.push(dois.slice(index, index + size));
  }
  return chunks;
};

// ── Verdict ─────────────────────────────────────────────────────────────────

const noticeDate = (updated: unknown): string | null => {
  if (typeof updated !== 'object' || updated === null) return null;
  const dateTime = (updated as { 'date-time'?: unknown })['date-time'];
  if (typeof dateTime === 'string' && dateTime.length >= 10) {
    return dateTime.slice(0, 10);
  }
  const dateParts = (updated as { 'date-parts'?: unknown })['date-parts'];
  const first = Array.isArray(dateParts) ? dateParts[0] : undefined;
  if (!Array.isArray(first) || typeof first[0] !== 'number') return null;
  const pad = (value: unknown): string =>
    typeof value === 'number' ? String(value).padStart(2, '0') : '01';
  return `${first[0]}-${pad(first[1])}-${pad(first[2])}`;
};

const readNotice = (entry: unknown): RetractionNotice | null => {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const rawType = typeof record.type === 'string' ? record.type : '';
  const type =
    NOTICE_TYPES[rawType.toLowerCase().replace(/[\s-]/g, '_')] ?? 'OTHER';
  const label = isNonEmptyString(record.label)
    ? record.label.trim()
    : NOTICE_FALLBACK_LABELS[type];
  return {
    type,
    label,
    doi: isNonEmptyString(record.DOI) ? normalizeDoi(record.DOI) : null,
    date: noticeDate(record.updated),
  };
};

const summarize = (
  status: RetractionStatus,
  notices: RetractionNotice[],
): string => {
  if (status === 'CLEAN') return 'No retraction or correction on record';
  if (status === 'UNKNOWN') return UNKNOWN_VERDICT.summary;
  const leading =
    notices.find((notice) => STATUS_BY_NOTICE[notice.type] === status) ??
    notices[0];
  const dated = leading.date === null ? '' : ` (${leading.date})`;
  const extra =
    notices.length > 1 ? ` · ${notices.length - 1} further notice(s)` : '';
  return `${leading.label}${dated}${extra}`;
};

// Crossref returns `{ status, message-type, message: {...} }`; a `message` that
// is already unwrapped is accepted too so a batch row feeds straight in.
const crossrefWork = (payload: unknown): Record<string, unknown> | null => {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const message = record.message;
  if (typeof message === 'object' && message !== null) {
    return message as Record<string, unknown>;
  }
  // A bare work always has a DOI; anything else is not a work we can read.
  return isNonEmptyString(record.DOI) ? record : null;
};

// Given one Crossref work, is the reference retracted, and what does the notice
// say? A work we could read but that has no `update-to` is genuinely CLEAN.
export const readCrossrefRetraction = (payload: unknown): RetractionVerdict => {
  const work = crossrefWork(payload);
  if (work === null) return UNKNOWN_VERDICT;
  const updateTo = work['update-to'];
  if (!Array.isArray(updateTo)) {
    return {
      status: 'CLEAN',
      notices: [],
      summary: summarize('CLEAN', []),
    };
  }
  const notices = updateTo
    .map(readNotice)
    .filter((notice): notice is RetractionNotice => notice !== null);
  if (notices.length === 0) {
    return { status: 'CLEAN', notices: [], summary: summarize('CLEAN', []) };
  }
  const status = notices.reduce<RetractionStatus>(
    (worst, notice) =>
      STATUS_SEVERITY[STATUS_BY_NOTICE[notice.type]] > STATUS_SEVERITY[worst]
        ? STATUS_BY_NOTICE[notice.type]
        : worst,
    'CLEAN',
  );
  return { status, notices, summary: summarize(status, notices) };
};

// A `/works?filter=doi:…` reply → a verdict per DOI. Anything Crossref left out
// of the reply is simply absent from the map, which the caller reports as
// unchecked rather than clean.
export const readCrossrefRetractionBatch = (
  payload: unknown,
): Map<string, RetractionVerdict> => {
  const verdicts = new Map<string, RetractionVerdict>();
  const message = crossrefWork(payload);
  const items = message === null ? undefined : message.items;
  if (!Array.isArray(items)) return verdicts;
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const doi = (item as { DOI?: unknown }).DOI;
    if (!isNonEmptyString(doi)) continue;
    verdicts.set(normalizeDoi(doi), readCrossrefRetraction(item));
  }
  return verdicts;
};

// ── Scanning a manuscript's references ──────────────────────────────────────

export type CheckableReference = {
  referenceId: string;
  citationKey: string;
  title: string;
  doi: string;
};

export type ReferenceRetractionResult = CheckableReference & {
  verdict: RetractionVerdict;
};

export type RetractionScanState =
  | 'IDLE'
  | 'CHECKING'
  | 'DONE'
  | 'OFFLINE'
  | 'FAILED';

export type RetractionScanSummary = {
  state: RetractionScanState;
  // References Crossref answered for.
  checkedCount: number;
  // References with a DOI that Crossref did not answer for (a DataCite DOI, or
  // a request that failed).
  uncheckedCount: number;
  // References with no DOI at all — nothing to look up.
  withoutDoiCount: number;
  flagged: ReferenceRetractionResult[];
  message: string;
};

// Only a DOI can be checked, and each distinct DOI only once however many
// reference records share it.
export const referencesToCheck = (
  references: ReferenceLike[],
): CheckableReference[] => {
  const seen = new Set<string>();
  const checkable: CheckableReference[] = [];
  for (const reference of references) {
    const doi = normalizeDoi(reference.doi);
    if (doi.length === 0 || seen.has(doi)) continue;
    seen.add(doi);
    checkable.push({
      referenceId: reference.id,
      citationKey: reference.citationKey?.trim() ?? '',
      title: reference.name?.trim() ?? 'Untitled',
      doi,
    });
  }
  return checkable;
};

export const countReferencesWithoutDoi = (
  references: ReferenceLike[],
): number =>
  references.filter((reference) => normalizeDoi(reference.doi).length === 0)
    .length;

const countPhrase = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

// The wording is the feature. When we could not check, the summary has to say
// so plainly — "0 retracted" would read as a clean bill of health that we have
// no right to give.
export const summarizeRetractionScan = ({
  state,
  results,
  withoutDoiCount,
  uncheckedCount,
}: {
  state: RetractionScanState;
  results: ReferenceRetractionResult[];
  withoutDoiCount: number;
  uncheckedCount: number;
}): RetractionScanSummary => {
  const flagged = results
    .filter((result) => isFlaggedRetractionStatus(result.verdict.status))
    .sort(
      (left, right) =>
        STATUS_SEVERITY[right.verdict.status] -
        STATUS_SEVERITY[left.verdict.status],
    );
  const checkedCount = results.filter(
    (result) => result.verdict.status !== 'UNKNOWN',
  ).length;
  const base = {
    state,
    checkedCount,
    uncheckedCount,
    withoutDoiCount,
    flagged,
  };

  if (state === 'OFFLINE') {
    return {
      ...base,
      message:
        'Offline — references were not checked against Crossref. This is not a clean result.',
    };
  }
  if (state === 'FAILED') {
    return {
      ...base,
      message:
        'Could not reach Crossref — references were not checked. This is not a clean result.',
    };
  }
  if (state === 'CHECKING') {
    return { ...base, message: 'Checking references against Crossref…' };
  }
  if (state === 'IDLE') {
    return { ...base, message: 'References have not been checked yet.' };
  }

  const gaps = [
    uncheckedCount > 0
      ? `${countPhrase(uncheckedCount, 'DOI')} not found in Crossref`
      : '',
    withoutDoiCount > 0
      ? `${countPhrase(withoutDoiCount, 'reference')} without a DOI`
      : '',
  ].filter((part) => part.length > 0);
  const caveat = gaps.length > 0 ? ` · not checked: ${gaps.join(', ')}` : '';

  if (flagged.length === 0) {
    return {
      ...base,
      message: `No retractions or corrections found in ${countPhrase(checkedCount, 'reference')}${caveat}`,
    };
  }
  const retracted = flagged.filter(
    (result) => result.verdict.status === 'RETRACTED',
  ).length;
  const headline =
    retracted > 0
      ? `${countPhrase(retracted, 'retracted reference')}`
      : `${countPhrase(flagged.length, 'flagged reference')}`;
  const others = flagged.length - retracted;
  const withOthers =
    retracted > 0 && others > 0
      ? `${headline}, ${others} with a correction or concern`
      : headline;
  return { ...base, message: `${withOthers}${caveat}` };
};

// ── Handoff to submission readiness ─────────────────────────────────────────

// `validateSubmission` is where unresolved citations surface, and a retracted
// reference belongs beside them. That module is owned elsewhere, so this
// returns the checks ready-made: call it with a completed scan and concatenate.
// An unchecked scan yields nothing rather than a false all-clear — except when
// the author asked for a check that could not run, which is itself worth a
// warning.
export const retractionSubmissionChecks = (
  summary: RetractionScanSummary,
): SubmissionCheck[] => {
  if (summary.state === 'IDLE' || summary.state === 'CHECKING') return [];
  if (summary.state === 'OFFLINE' || summary.state === 'FAILED') {
    return [
      {
        id: 'retraction-scan-unavailable',
        label: 'Retraction check',
        detail: summary.message,
        severity: 'WARNING',
        target: 'references',
      },
    ];
  }
  return summary.flagged.map((result) => ({
    id: `retraction-${result.referenceId}`,
    label:
      result.verdict.status === 'RETRACTED'
        ? 'Retracted reference'
        : result.verdict.status === 'CONCERN'
          ? 'Reference under expression of concern'
          : 'Corrected reference',
    detail: `[@${result.citationKey.length > 0 ? result.citationKey : result.doi}] ${result.title} — ${result.verdict.summary}`,
    // A retraction is an error: citing a retracted paper unknowingly is the
    // thing this check exists to stop. A correction is a warning.
    severity: result.verdict.status === 'RETRACTED' ? 'ERROR' : 'WARNING',
    target: 'references',
  }));
};
