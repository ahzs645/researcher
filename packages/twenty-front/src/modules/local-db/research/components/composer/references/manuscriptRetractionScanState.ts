import {
  countReferencesWithoutDoi,
  referencesToCheck,
  retractionSubmissionChecks,
  type RetractionScanSummary,
} from '@/local-db/research/manuscript/manuscriptRetraction';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { type SubmissionCheck } from '@/local-db/research/manuscript/manuscriptSubmission';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// Where the Crossref scan lives between the References tab that runs it and the
// Export tab that has to report it. It was component state, which meant the
// export panel could never see a retracted reference the author had already
// been shown.

export type ManuscriptRetractionScan = {
  manuscriptId: string;
  summary: RetractionScanSummary;
  // Every reference the scan ran over — the DOI-less ones included, since the
  // summary counts them — so a bibliography that has changed since can be
  // recognised as a bibliography this scan is not about.
  checkedReferenceIds: string[];
};

// Deliberately in memory only. A scan is true of the reference list as it stood
// when it ran, so persisting one to storage would let a stale all-clear outlive
// the references it was about — and an all-clear is exactly the answer we must
// never give on stale evidence.
export const manuscriptRetractionScanState =
  createAtomState<ManuscriptRetractionScan | null>({
    key: 'manuscriptRetractionScanState',
    defaultValue: null,
  });

// Sorted, so re-ordering a bibliography does not retire a scan that covered
// exactly these references.
export const retractionScanSignature = (referenceIds: string[]): string =>
  [...referenceIds].sort().join('|');

// IDLE and CHECKING describe a scan that has not produced a verdict; OFFLINE
// and FAILED are verdicts of their own ("we could not check"), which
// `retractionSubmissionChecks` already turns into a warning.
const hasFinished = (summary: RetractionScanSummary): boolean =>
  summary.state === 'DONE' ||
  summary.state === 'OFFLINE' ||
  summary.state === 'FAILED';

export const manuscriptRetractionScanSummary = ({
  scan,
  manuscriptId,
}: {
  scan: ManuscriptRetractionScan | null;
  manuscriptId: string;
}): RetractionScanSummary | null =>
  scan !== null &&
  scan.manuscriptId === manuscriptId &&
  hasFinished(scan.summary)
    ? scan.summary
    : null;

// The export panel's whole view of the scan: the finished scan's checks, or a
// nudge to run one. The nudge is a WARNING and so does not gate `ready` —
// refusing to export because a network check has not been run would punish
// working offline, but going quiet about it would let a retracted citation
// ship unexamined.
export const retractionReadinessChecks = ({
  scan,
  manuscriptId,
  references,
}: {
  scan: ManuscriptRetractionScan | null;
  manuscriptId: string;
  references: ReferenceLike[];
}): SubmissionCheck[] => {
  const summary = manuscriptRetractionScanSummary({ scan, manuscriptId });
  if (summary !== null) return retractionSubmissionChecks(summary);

  const checkableCount = referencesToCheck(references).length;
  // Nothing carries a DOI, so there is nothing Crossref could have answered
  // and no scan to ask for.
  if (checkableCount === 0) return [];

  const withoutDoiCount = countReferencesWithoutDoi(references);
  return [
    {
      id: 'retraction-scan-not-run',
      label: 'Retraction check',
      detail: `${checkableCount} reference(s) with a DOI have not been checked against Crossref${
        withoutDoiCount > 0
          ? ` · ${withoutDoiCount} without a DOI cannot be checked`
          : ''
      }`,
      severity: 'WARNING',
      target: 'references',
    },
  ];
};
