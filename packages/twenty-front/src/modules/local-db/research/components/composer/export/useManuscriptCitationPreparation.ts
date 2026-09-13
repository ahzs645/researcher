import { useEffect, useState } from 'react';

import {
  buildManuscriptBundle,
  type ManuscriptBundle,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { citationFormattingErrorMessage } from '@/local-db/research/manuscript/manuscriptCitationProvenance';
import { prepareManuscriptBundleWithCsl } from '@/local-db/research/manuscript/manuscriptCslIntegration';

type PreparedState = {
  source: ManuscriptBundle;
  revision: number;
  bundle: ManuscriptBundle;
  error: string | null;
};

export const useManuscriptCitationPreparation = (source: ManuscriptBundle) => {
  const [revision, setRevision] = useState(0);
  const [prepared, setPrepared] = useState<PreparedState | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The asynchronous engine result belongs to this input and retry, not
    // whichever journal or manuscript is selected when it finishes.
    void Promise.resolve()
      .then(() =>
        prepareManuscriptBundleWithCsl(
          buildManuscriptBundle({
            ...source.sourceInput,
            style: source.style,
          }),
        ),
      )
      .then(
        (bundle) => {
          if (!cancelled) {
            setPrepared({ source, revision, bundle, error: null });
          }
        },
        (error: unknown) => {
          // Formatting failures resolve with provenance; construction errors
          // must also stop the spinner and remain visible.
          if (!cancelled) {
            setPrepared({
              source,
              revision,
              bundle: source,
              error: citationFormattingErrorMessage(error),
            });
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [source, revision]);

  const current =
    prepared?.source === source && prepared.revision === revision
      ? prepared
      : null;
  return {
    bundle: current?.bundle ?? source,
    isPreparing: current === null,
    preparationError: current?.error ?? null,
    retry: () => setRevision((previous) => previous + 1),
  };
};
