import {
  chunkDoisForCrossref,
  countReferencesWithoutDoi,
  crossrefRetractionBatchUrl,
  crossrefWorkUrl,
  isBatchableDoi,
  readCrossrefRetraction,
  readCrossrefRetractionBatch,
  referencesToCheck,
  summarizeRetractionScan,
  type ReferenceRetractionResult,
  type RetractionScanSummary,
  type RetractionVerdict,
} from '@/local-db/research/manuscript/manuscriptRetraction';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

import { isBrowserOffline } from './manuscriptIdentifierFetch';

// The network half of the retraction check. Crossref answers a whole batch of
// DOIs in one request, so a sixty-item bibliography costs two calls rather than
// sixty. Every failure mode ends in a summary that says the check did not run —
// never in a silent all-clear, and never in a throw.

const UNKNOWN_VERDICT: RetractionVerdict = {
  status: 'UNKNOWN',
  notices: [],
  summary: 'Not checked — no data from Crossref',
};

const fetchJson = async (url: string): Promise<unknown | null> => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  return response.ok ? ((await response.json()) as unknown) : null;
};

export const runRetractionScan = async (
  references: ReferenceLike[],
): Promise<RetractionScanSummary> => {
  const withoutDoiCount = countReferencesWithoutDoi(references);
  const checkable = referencesToCheck(references);

  if (isBrowserOffline()) {
    return summarizeRetractionScan({
      state: 'OFFLINE',
      results: [],
      withoutDoiCount,
      uncheckedCount: checkable.length,
    });
  }
  if (checkable.length === 0) {
    return summarizeRetractionScan({
      state: 'DONE',
      results: [],
      withoutDoiCount,
      uncheckedCount: 0,
    });
  }

  const verdicts = new Map<string, RetractionVerdict>();
  let requestCount = 0;
  let succeededCount = 0;

  const batches = chunkDoisForCrossref(
    checkable.map((entry) => entry.doi).filter(isBatchableDoi),
  );
  for (const batch of batches) {
    requestCount += 1;
    try {
      // `select` trims the reply to the fields the verdict reads. If Crossref
      // ever rejects that field list, ask again for the whole work rather than
      // reporting the batch as unchecked.
      const payload =
        (await fetchJson(crossrefRetractionBatchUrl(batch))) ??
        (await fetchJson(crossrefRetractionBatchUrl(batch, { select: false })));
      if (payload === null) continue;
      succeededCount += 1;
      for (const [doi, verdict] of readCrossrefRetractionBatch(payload)) {
        verdicts.set(doi, verdict);
      }
    } catch {
      // Left unchecked below; one bad batch must not sink the whole scan.
    }
  }

  // A DOI containing a comma cannot ride in the filter list, so it goes alone.
  for (const entry of checkable.filter(
    (candidate) => !isBatchableDoi(candidate.doi),
  )) {
    requestCount += 1;
    try {
      const payload = await fetchJson(crossrefWorkUrl(entry.doi));
      if (payload === null) continue;
      succeededCount += 1;
      verdicts.set(entry.doi, readCrossrefRetraction(payload));
    } catch {
      // As above.
    }
  }

  const results: ReferenceRetractionResult[] = checkable.map((entry) => ({
    ...entry,
    verdict: verdicts.get(entry.doi) ?? UNKNOWN_VERDICT,
  }));
  const uncheckedCount = results.filter(
    (result) => result.verdict.status === 'UNKNOWN',
  ).length;

  return summarizeRetractionScan({
    // Not one request got through, so this is a connectivity failure rather
    // than a bibliography Crossref happens not to know.
    state: requestCount > 0 && succeededCount === 0 ? 'FAILED' : 'DONE',
    results,
    withoutDoiCount,
    uncheckedCount,
  });
};
