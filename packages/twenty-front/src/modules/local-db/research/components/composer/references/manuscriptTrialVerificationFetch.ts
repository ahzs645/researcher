import {
  clinicalTrialsStudyUrl,
  readClinicalTrialsStudy,
  registeredTrial,
  splitTrialIdentifiers,
  summarizeTrialVerification,
  uncheckedTrial,
  unresolvedTrial,
  type TrialVerification,
  type TrialVerificationSummary,
} from '@/local-db/research/manuscript/screening/trialVerification';

import { isBrowserOffline } from './manuscriptIdentifierFetch';

// The network half of the trial-registration check. A manuscript carries one
// or two registration numbers, so this is a loop over a handful of requests
// rather than a batch — ClinicalTrials.gov has no multi-id endpoint that
// answers with the modules the verdict reads.
//
// Every failure mode ends in a summary that says the check did not run: never
// in a silent confirmation, and never in a throw. A 404 is the one failure
// that is a finding — the registry answered, and the answer is that this
// number was never issued.

export const runTrialVerification = async (
  identifiers: string[],
): Promise<TrialVerificationSummary> => {
  const { verifiable, unsupported } = splitTrialIdentifiers(identifiers);

  if (isBrowserOffline()) {
    return summarizeTrialVerification({
      state: 'OFFLINE',
      verifications: [],
      unsupported,
    });
  }
  if (verifiable.length === 0) {
    return summarizeTrialVerification({
      state: 'DONE',
      verifications: [],
      unsupported,
    });
  }

  const verifications: TrialVerification[] = [];
  let requestCount = 0;
  let answeredCount = 0;

  for (const identifier of verifiable) {
    requestCount += 1;
    try {
      const response = await fetch(clinicalTrialsStudyUrl(identifier), {
        headers: { Accept: 'application/json' },
      });
      // The registry answered, and it has never issued this number.
      if (response.status === 404) {
        answeredCount += 1;
        verifications.push(unresolvedTrial(identifier));
        continue;
      }
      if (!response.ok) {
        verifications.push(
          uncheckedTrial(
            identifier,
            `ClinicalTrials.gov answered ${response.status}`,
          ),
        );
        continue;
      }
      const record = readClinicalTrialsStudy(
        (await response.json()) as unknown,
      );
      answeredCount += 1;
      verifications.push(
        record === null
          ? uncheckedTrial(
              identifier,
              'ClinicalTrials.gov returned a record this app could not read',
            )
          : registeredTrial(record),
      );
    } catch {
      // A blocked request, a dropped connection, a body that is not JSON. One
      // bad identifier must not sink the rest.
      verifications.push(
        uncheckedTrial(identifier, 'Could not reach ClinicalTrials.gov'),
      );
    }
  }

  return summarizeTrialVerification({
    // Not one request got through, so this is a connectivity failure rather
    // than a registry that happens not to know these numbers.
    state: requestCount > 0 && answeredCount === 0 ? 'FAILED' : 'DONE',
    verifications,
    unsupported,
  });
};
