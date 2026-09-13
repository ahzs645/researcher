// A missing CSL request is intentional generic formatting, not a failed style.
export type ManuscriptCitationProvenance =
  | {
      requestedStyleId: null;
      appliedStyleId: 'built-in';
      engineOutcome: 'not-requested';
    }
  | {
      requestedStyleId: string;
      appliedStyleId: 'built-in';
      engineOutcome: 'not-prepared';
    }
  | {
      requestedStyleId: string;
      appliedStyleId: 'built-in';
      engineOutcome: 'style-not-vendored';
    }
  | {
      requestedStyleId: string;
      appliedStyleId: 'built-in';
      engineOutcome: 'engine-unavailable';
    }
  | {
      requestedStyleId: string;
      appliedStyleId: 'built-in';
      engineOutcome: 'engine-error';
      errorMessage: string;
    }
  | {
      requestedStyleId: string;
      appliedStyleId: string;
      engineOutcome: 'applied';
    };

export const requestedCitationStyleId = (
  styleId: string | null | undefined,
): string | null => styleId?.trim() || null;

export const initialCitationProvenance = (
  styleId: string | null | undefined,
): ManuscriptCitationProvenance => {
  const requestedStyleId = requestedCitationStyleId(styleId);
  return requestedStyleId === null
    ? {
        requestedStyleId: null,
        appliedStyleId: 'built-in',
        engineOutcome: 'not-requested',
      }
    : {
        requestedStyleId,
        appliedStyleId: 'built-in',
        engineOutcome: 'not-prepared',
      };
};

export const citationFormattingFailed = (
  provenance: ManuscriptCitationProvenance,
): boolean =>
  provenance.engineOutcome === 'style-not-vendored' ||
  provenance.engineOutcome === 'engine-unavailable' ||
  provenance.engineOutcome === 'engine-error';

export const citationFormattingReady = (
  provenance: ManuscriptCitationProvenance,
): boolean =>
  provenance.engineOutcome === 'not-requested' ||
  (provenance.engineOutcome === 'applied' &&
    provenance.requestedStyleId === provenance.appliedStyleId);

export const citationFormattingErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error || 'Empty thrown string';
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    // A thrown value need not be an Error or even JSON-serializable.
    return 'Non-serializable exception thrown by the citation engine';
  }
};

export const describeCitationProvenance = (
  provenance: ManuscriptCitationProvenance,
): string => {
  if (provenance.engineOutcome === 'not-requested') {
    return 'No CSL style requested. Applied: built-in formatter (generic formatting by configuration).';
  }
  const requested = `Requested CSL style: "${provenance.requestedStyleId}".`;
  if (provenance.engineOutcome === 'applied') {
    return `${requested} Applied: "${provenance.appliedStyleId}" via citeproc.`;
  }
  if (provenance.engineOutcome === 'not-prepared') {
    return `${requested} Applied: built-in formatter for now. Citation-style verification is pending; the submission package is blocked.`;
  }
  const reason =
    provenance.engineOutcome === 'style-not-vendored'
      ? 'The requested style is not bundled.'
      : provenance.engineOutcome === 'engine-unavailable'
        ? 'The citation engine is unavailable.'
        : `Citation engine error: ${provenance.errorMessage}`;
  return `${requested} Not applied. Applied: built-in fallback formatter. ${reason} Draft exports remain available with this warning; the submission package is blocked.`;
};
