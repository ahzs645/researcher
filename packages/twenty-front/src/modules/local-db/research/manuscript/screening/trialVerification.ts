// ── Verifying a trial registration against the registry ────────────────────
//
// `trialRegistration` recognises eight registries by pattern, and a pattern is
// only a pattern: NCT00000000 is perfectly well-formed and resolves to
// nothing. This is the half that asks the registry whether the record exists,
// which is a much stronger finding in both directions — a number that does not
// resolve is a real problem, and one that does brings back the registered
// title, status and enrolment to compare against the manuscript.
//
// ClinicalTrials.gov's v2 REST API answers `GET /api/v2/studies/{nctId}` with
// the study's `protocolSection`; a number it has never issued is a 404 whose
// body is plain text, and a malformed one is a 400. It sends
// `access-control-allow-origin: *`, so a browser reaches it directly — no
// proxy, no key, no preflight for a plain GET with an Accept header.
//
// Only ClinicalTrials.gov is verified. ISRCTN, ChiCTR, EudraCT and the rest
// have no equally open endpoint, and saying so is honest where reporting them
// as "not found" would be a lie.
//
// The distinction that matters most is REGISTERED versus UNKNOWN: being
// offline, a blocked request or a 500 is not evidence that a trial is
// unregistered, and this module never lets the two collapse.
//
// The reading is pure so it can be tested against a recorded payload. The
// fetching lives in `components/composer/references`.

const CLINICAL_TRIALS_API = 'https://clinicaltrials.gov/api/v2/studies';

// The three modules the verdict reads. Asking for the whole study brings back
// every arm, outcome and location, which is hundreds of kilobytes we throw
// away.
const STUDY_FIELDS = [
  'protocolSection.identificationModule',
  'protocolSection.statusModule',
  'protocolSection.designModule',
].join(',');

export const NCT_IDENTIFIER = /^NCT\d{8}$/;

export const clinicalTrialsStudyUrl = (nctId: string): string =>
  `${CLINICAL_TRIALS_API}/${encodeURIComponent(nctId.toLocaleUpperCase())}?fields=${STUDY_FIELDS}`;

export const clinicalTrialsRecordUrl = (nctId: string): string =>
  `https://clinicaltrials.gov/study/${encodeURIComponent(nctId.toLocaleUpperCase())}`;

export type TrialRecord = {
  nctId: string;
  title: string;
  overallStatus: string;
  studyType: string | null;
  allocation: string | null;
  masking: string | null;
  enrollmentCount: number | null;
  startDate: string | null;
  firstSubmitDate: string | null;
  // Whether the registry had the record before the study started. Null when
  // either date is missing — an unknown is not a "no".
  isProspective: boolean | null;
};

export type TrialVerificationStatus = 'REGISTERED' | 'NOT_FOUND' | 'UNKNOWN';

export type TrialVerification = {
  identifier: string;
  status: TrialVerificationStatus;
  record: TrialRecord | null;
  // One line fit to show next to the identifier.
  summary: string;
};

export type TrialVerificationState =
  | 'IDLE'
  | 'CHECKING'
  | 'DONE'
  | 'OFFLINE'
  | 'FAILED';

export type TrialVerificationSummary = {
  state: TrialVerificationState;
  verifications: TrialVerification[];
  // Identifiers from registries with no open endpoint we can call.
  unsupported: string[];
  message: string;
};

// ── Reading a study ─────────────────────────────────────────────────────────

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const asCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const childRecord = (
  parent: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null =>
  parent === null ? null : asRecord(parent[key]);

// Registry dates are "2020-02-21" or "2020-04" depending on how precisely the
// sponsor knew them, so the comparison drops to whichever is coarser rather
// than pretending to a precision neither has.
export const isProspectiveRegistration = (
  firstSubmitDate: string | null,
  startDate: string | null,
): boolean | null => {
  if (firstSubmitDate === null || startDate === null) return null;
  const length = Math.min(firstSubmitDate.length, startDate.length);
  return firstSubmitDate.slice(0, length) <= startDate.slice(0, length);
};

export const readClinicalTrialsStudy = (
  payload: unknown,
): TrialRecord | null => {
  const protocol = childRecord(asRecord(payload), 'protocolSection');
  const identification = childRecord(protocol, 'identificationModule');
  const nctId = asText(identification?.nctId);
  if (nctId === null) return null;

  const status = childRecord(protocol, 'statusModule');
  const design = childRecord(protocol, 'designModule');
  const designInfo = childRecord(design, 'designInfo');
  const startDate = asText(childRecord(status, 'startDateStruct')?.date);
  const firstSubmitDate = asText(status?.studyFirstSubmitDate);

  return {
    nctId,
    title:
      asText(identification?.briefTitle) ??
      asText(identification?.officialTitle) ??
      'Untitled study',
    overallStatus: asText(status?.overallStatus) ?? 'UNKNOWN',
    studyType: asText(design?.studyType),
    allocation: asText(designInfo?.allocation),
    masking: asText(childRecord(designInfo, 'maskingInfo')?.masking),
    enrollmentCount: asCount(childRecord(design, 'enrollmentInfo')?.count),
    startDate,
    firstSubmitDate,
    isProspective: isProspectiveRegistration(firstSubmitDate, startDate),
  };
};

// ── Verifications ───────────────────────────────────────────────────────────

const humanStatus = (value: string): string =>
  value.toLocaleLowerCase().replace(/_/g, ' ');

export const registeredTrial = (record: TrialRecord): TrialVerification => ({
  identifier: record.nctId,
  status: 'REGISTERED',
  record,
  summary: [
    `Registered — ${record.title}`,
    `status ${humanStatus(record.overallStatus)}`,
    record.enrollmentCount === null
      ? ''
      : `enrolment ${record.enrollmentCount}`,
    record.isProspective === false
      ? `registered ${record.firstSubmitDate} after the study started ${record.startDate}`
      : '',
  ]
    .filter((part) => part.length > 0)
    .join(' · '),
});

export const unresolvedTrial = (identifier: string): TrialVerification => ({
  identifier,
  status: 'NOT_FOUND',
  record: null,
  summary: `ClinicalTrials.gov has no study with this number. Check the identifier before submitting.`,
});

export const uncheckedTrial = (
  identifier: string,
  reason: string,
): TrialVerification => ({
  identifier,
  status: 'UNKNOWN',
  record: null,
  summary: `${reason} — not checked. This is not a confirmation.`,
});

// ── Which identifiers can be checked ────────────────────────────────────────

export const splitTrialIdentifiers = (
  identifiers: string[],
): { verifiable: string[]; unsupported: string[] } => {
  const verifiable: string[] = [];
  const unsupported: string[] = [];
  for (const identifier of identifiers) {
    const trimmed = identifier.trim();
    if (trimmed.length === 0) continue;
    const target = NCT_IDENTIFIER.test(trimmed.toLocaleUpperCase())
      ? verifiable
      : unsupported;
    if (!target.includes(trimmed)) target.push(trimmed);
  }
  return { verifiable, unsupported };
};

// ── The summary ─────────────────────────────────────────────────────────────

const countPhrase = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

const unsupportedPhrase = (unsupported: string[]): string =>
  unsupported.length === 0
    ? ''
    : ` · ${countPhrase(unsupported.length, 'identifier')} from another registry cannot be checked here (${unsupported.join(', ')})`;

// The wording is the feature. When we could not check, the summary has to say
// so plainly — silence would read as a confirmation we have no right to give.
export const summarizeTrialVerification = ({
  state,
  verifications,
  unsupported,
}: {
  state: TrialVerificationState;
  verifications: TrialVerification[];
  unsupported: string[];
}): TrialVerificationSummary => {
  const base = { state, verifications, unsupported };

  if (state === 'OFFLINE') {
    return {
      ...base,
      message:
        'Offline — the registration was not checked against ClinicalTrials.gov. This is not a confirmation.',
    };
  }
  if (state === 'FAILED') {
    return {
      ...base,
      message:
        'Could not reach ClinicalTrials.gov — the registration was not checked. This is not a confirmation.',
    };
  }
  if (state === 'CHECKING') {
    return { ...base, message: 'Checking against ClinicalTrials.gov…' };
  }
  if (state === 'IDLE') {
    return {
      ...base,
      message: 'The registration has not been checked against the registry.',
    };
  }

  if (verifications.length === 0) {
    return {
      ...base,
      message:
        unsupported.length === 0
          ? 'No ClinicalTrials.gov identifier to check.'
          : `No ClinicalTrials.gov identifier to check${unsupportedPhrase(unsupported)}`,
    };
  }

  const missing = verifications.filter(
    (verification) => verification.status === 'NOT_FOUND',
  );
  const unchecked = verifications.filter(
    (verification) => verification.status === 'UNKNOWN',
  );
  const registered = verifications.filter(
    (verification) => verification.status === 'REGISTERED',
  );
  const retrospective = registered.filter(
    (verification) => verification.record?.isProspective === false,
  );

  const parts = [
    missing.length > 0
      ? `${countPhrase(missing.length, 'identifier')} not found in ClinicalTrials.gov`
      : '',
    registered.length > 0
      ? `${countPhrase(registered.length, 'identifier')} resolved to a registered study`
      : '',
    retrospective.length > 0
      ? `${countPhrase(retrospective.length, 'registration')} filed after the study started`
      : '',
    unchecked.length > 0
      ? `${countPhrase(unchecked.length, 'identifier')} could not be checked`
      : '',
  ].filter((part) => part.length > 0);

  return {
    ...base,
    message: `${parts.join(' · ')}${unsupportedPhrase(unsupported)}`,
  };
};
