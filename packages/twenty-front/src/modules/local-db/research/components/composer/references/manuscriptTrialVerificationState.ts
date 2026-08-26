import { type TrialVerificationSummary } from '@/local-db/research/manuscript/screening/trialVerification';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// Where a ClinicalTrials.gov lookup lives between the screening panel that
// runs it and anything else that has to report it.
//
// Scoped by the identifiers rather than by the manuscript, because that is
// what the answer is about: NCT04280705 resolves to the same record whichever
// paper cites it, and a manuscript whose registration number has been edited
// is a manuscript this run never covered.

export type ManuscriptTrialVerification = {
  // The identifiers the run was given, unsupported registries included, so a
  // manuscript that has since gained an ISRCTN is recognised as one this run
  // is not about.
  identifiers: string[];
  summary: TrialVerificationSummary;
};

// Deliberately in memory only. A verification is true of the identifiers as
// they stood when it ran, so persisting one to storage would let a stale
// confirmation outlive the number it was about — and a confirmation is exactly
// the answer we must never give on stale evidence.
export const manuscriptTrialVerificationState =
  createAtomState<ManuscriptTrialVerification | null>({
    key: 'manuscriptTrialVerificationState',
    defaultValue: null,
  });

// Sorted, so re-ordering the identifiers a manuscript carries does not retire
// a run that covered exactly these.
export const trialVerificationSignature = (identifiers: string[]): string =>
  [...identifiers].sort().join('|');

// IDLE and CHECKING describe a run that has not produced an answer; OFFLINE
// and FAILED are answers of their own ("we could not check"), and the panel
// shows them as such.
const hasFinished = (summary: TrialVerificationSummary): boolean =>
  summary.state === 'DONE' ||
  summary.state === 'OFFLINE' ||
  summary.state === 'FAILED';

export const manuscriptTrialVerificationSummary = ({
  verification,
  identifiers,
}: {
  verification: ManuscriptTrialVerification | null;
  identifiers: string[];
}): TrialVerificationSummary | null =>
  verification !== null &&
  trialVerificationSignature(verification.identifiers) ===
    trialVerificationSignature(identifiers) &&
  hasFinished(verification.summary)
    ? verification.summary
    : null;
