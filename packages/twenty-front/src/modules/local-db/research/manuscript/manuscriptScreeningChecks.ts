// The bridge from screening to the submission readiness list, kept out of
// `manuscriptScreening` so the screening logic stays free of anything about
// exports, and out of `validateSubmission` so that function stays pure over the
// bundle: screening reads manuscript sections the bundle never carries.

import {
  MANUSCRIPT_SCREENING_CHECKS,
  type ScreeningDeclination,
  type ScreeningFinding,
} from './manuscriptScreening';
import { type TrialVerificationSummary } from './screening/trialVerification';
import { type SubmissionCheck } from './manuscriptSubmission';

const SCREENING_CHECK_ID = 'automated-screening';

const listLabels = (findings: ScreeningFinding[]): string =>
  findings.map((finding) => finding.label).join(', ');

// One aggregate line, never an error. The screening panel promises the author
// that these are screening findings rather than journal requirements and that
// none of them blocks an export — a heuristic that gated the export would make
// that promise false and would strand a finished paper on a false negative. And
// one line rather than one per finding because a dozen new rows would bury the
// handful of real errors in a list that already runs about fifteen checks.
// The detail names the items so the line is worth acting on rather than a count
// the author has to go elsewhere to decode.
export const screeningSubmissionChecks = (
  findings: ScreeningFinding[],
): SubmissionCheck[] => {
  // Nothing screened means nothing to report; an all-clear here would be a
  // verdict we never reached.
  if (findings.length === 0) return [];

  const absent = findings.filter(({ verdict }) => verdict === 'ABSENT');
  const weak = findings.filter(({ verdict }) => verdict === 'WEAK');

  if (absent.length === 0 && weak.length === 0) {
    return [
      {
        id: SCREENING_CHECK_ID,
        label: 'Automated screening',
        detail: `All ${findings.length} screening checks found a statement`,
        severity: 'READY',
        // The screening panel lives on the submission tab, so this is where
        // "fix it" has to land.
        target: 'submission',
      },
    ];
  }

  return [
    {
      id: SCREENING_CHECK_ID,
      label: 'Automated screening',
      detail: [
        absent.length > 0 ? `not found: ${listLabels(absent)}` : '',
        weak.length > 0 ? `weak: ${listLabels(weak)}` : '',
      ]
        .filter((part) => part.length > 0)
        .join(' · '),
      severity: 'WARNING',
      target: 'submission',
    },
  ];
};

const SCREENING_QUESTIONS = new Map(
  MANUSCRIPT_SCREENING_CHECKS.map((definition) => [
    definition.key,
    definition.question,
  ]),
);

const VERDICT_ORDER: Record<ScreeningFinding['verdict'], number> = {
  ABSENT: 0,
  WEAK: 1,
  PRESENT: 2,
};

// What the report can carry beyond the findings themselves: the checks that
// declined to apply, and a registry lookup if one has been run. Both are
// optional, so the callers that build a package offline keep working and the
// report never implies a verification that never happened.
export type ScreeningReportExtras = {
  declinations?: ScreeningDeclination[];
  trialVerification?: TrialVerificationSummary;
};

// An identifier line is only worth printing if it says what is known about the
// identifier. Without a registry lookup that is "recognised from the text";
// with one it is the registry's own answer, which is the whole point of having
// run it.
const identifierLines = (
  finding: ScreeningFinding,
  trialVerification: TrialVerificationSummary | undefined,
): string[] => {
  const identifiers = finding.identifiers ?? [];
  if (identifiers.length === 0) return [];

  const verifications = trialVerification?.verifications ?? [];
  if (verifications.length === 0) {
    return [
      `  Identifiers (recognised, not verified): ${identifiers.join(', ')}`,
    ];
  }

  return [
    '  Identifiers:',
    ...identifiers.map((identifier) => {
      const verification = verifications.find(
        (candidate) => candidate.identifier === identifier,
      );
      return `    ${identifier} — ${
        verification === undefined
          ? 'recognised from the text, not verified'
          : verification.summary
      }`;
    }),
  ];
};

// The artifact a coauthor or an editor can be handed: until now the screening
// existed only as rows on a tab, which is nothing anyone can pass on. Plain
// text like `submission-readiness.txt`, and it quotes the matched sentence so
// the reader judges the verdict instead of trusting it.
export const buildScreeningReport = (
  findings: ScreeningFinding[],
  manuscriptTitle: string,
  { declinations = [], trialVerification }: ScreeningReportExtras = {},
): string =>
  [
    'Automated screening',
    manuscriptTitle,
    `Generated: ${new Date().toISOString()}`,
    '',
    'What the BIH Charité screening tools look for in a finished paper, run',
    'over the manuscript text. These are screening findings, not journal',
    'requirements, and none of them blocks a submission.',
    '',
    ...[...findings]
      .sort(
        (left, right) =>
          VERDICT_ORDER[left.verdict] - VERDICT_ORDER[right.verdict],
      )
      .flatMap((finding) => [
        `[${finding.verdict}] ${finding.label} · ${finding.tool}`,
        `  Question: ${SCREENING_QUESTIONS.get(finding.key) ?? ''}`,
        `  Finding: ${finding.detail}`,
        ...(finding.evidence.length > 0
          ? [
              `  Evidence: "${finding.evidence}"${
                (finding.sectionName ?? finding.figureLabel) === undefined
                  ? ''
                  : ` — ${finding.sectionName ?? finding.figureLabel}`
              }`,
            ]
          : []),
        ...(finding.figureLabel === undefined
          ? []
          : [`  Figure: ${finding.figureLabel}`]),
        ...identifierLines(finding, trialVerification),
        '',
      ]),
    // Named rather than dropped: a reader who wonders whether this manuscript
    // was screened for blinding gets an answer, and the answer is not "no".
    ...(declinations.length === 0
      ? []
      : [
          'Not applicable to this manuscript',
          ...declinations.map(
            (declination) =>
              `  ${declination.label} · ${declination.tool} — ${declination.reason}`,
          ),
          '',
        ]),
  ].join('\n');
