import {
  buildManuscriptBundle,
  manuscriptSectionsForExport,
  type ManuscriptBundle,
  type ManuscriptBundleOptions,
  type ManuscriptCitationFormatting,
} from './manuscriptAssembly';
import {
  createCiteprocEngine,
  formatCslBibliography,
  formatCslCitations,
  isVendoredCslStyleId,
} from './manuscriptCiteproc';
import {
  citationClusterKey,
  extractCitationClusterItems,
} from './manuscriptCitations';
import {
  citationFormattingErrorMessage,
  initialCitationProvenance,
  requestedCitationStyleId,
  type ManuscriptCitationProvenance,
} from './manuscriptCitationProvenance';

// Reuse the exact formatting checked by preflight, rather than trying the
// engine again inside each renderer and possibly switching to a fallback.
type PreparedCitations = {
  sourceInput: ManuscriptBundle['sourceInput'];
  styleSignature: string;
  citationFormatting: ManuscriptCitationFormatting | undefined;
  citationAnchors: boolean;
};
const preparedCitations = new WeakMap<ManuscriptBundle, PreparedCitations>();

const exportableCitationContent = (bundle: ManuscriptBundle): string[] => [
  ...manuscriptSectionsForExport(bundle.sourceInput).map(
    (section) => section.content ?? '',
  ),
  // Assembly also renders citations in these fields. Omitting them would
  // falsely certify a mixed CSL/built-in output as entirely CSL-formatted.
  ...bundle.numberedFigures.flatMap((figure) => [
    figure.caption ?? '',
    figure.tableData ?? '',
  ]),
];

const rebuildWithOutcome = (
  bundle: ManuscriptBundle,
  citationFormatting: ManuscriptCitationFormatting | undefined,
  citationProvenance: ManuscriptCitationProvenance,
  options: ManuscriptBundleOptions,
): ManuscriptBundle => {
  const prepared = {
    ...buildManuscriptBundle(
      { ...bundle.sourceInput, style: bundle.style },
      citationFormatting,
      options,
    ),
    citationProvenance,
  };
  preparedCitations.set(prepared, {
    sourceInput: prepared.sourceInput,
    styleSignature: JSON.stringify(prepared.style),
    citationFormatting,
    citationAnchors: options.citationAnchors === true,
  });
  return prepared;
};

export const prepareManuscriptBundleWithCsl = async (
  bundle: ManuscriptBundle,
  options: ManuscriptBundleOptions = {},
): Promise<ManuscriptBundle> => {
  const cached = preparedCitations.get(bundle);
  if (
    cached !== undefined &&
    cached.sourceInput === bundle.sourceInput &&
    cached.styleSignature === JSON.stringify(bundle.style)
  ) {
    return cached.citationAnchors === (options.citationAnchors === true)
      ? bundle
      : rebuildWithOutcome(
          bundle,
          cached.citationFormatting,
          bundle.citationProvenance,
          options,
        );
  }

  const styleId = requestedCitationStyleId(bundle.style.citationStyleId);
  if (styleId === null) {
    return rebuildWithOutcome(
      bundle,
      undefined,
      initialCitationProvenance(null),
      options,
    );
  }
  const fallback = (
    provenance: ManuscriptCitationProvenance,
  ): ManuscriptBundle =>
    rebuildWithOutcome(bundle, undefined, provenance, options);
  if (!isVendoredCslStyleId(styleId)) {
    return fallback({
      requestedStyleId: styleId,
      appliedStyleId: 'built-in',
      engineOutcome: 'style-not-vendored',
    });
  }

  try {
    const engine = await createCiteprocEngine({
      styleId,
      references: bundle.sourceInput.references,
    });
    if (engine === null) {
      return fallback({
        requestedStyleId: styleId,
        appliedStyleId: 'built-in',
        engineOutcome: 'engine-unavailable',
      });
    }

    const clusters = exportableCitationContent(bundle).flatMap(
      extractCitationClusterItems,
    );
    const labels = formatCslCitations(engine, clusters);
    const labelsByCluster = new Map(
      clusters.map((cluster, index) => [
        citationClusterKey(cluster),
        labels[index],
      ]),
    );
    const bibliography = formatCslBibliography(engine);
    return rebuildWithOutcome(
      bundle,
      { bibliography, labelsByCluster },
      {
        requestedStyleId: styleId,
        appliedStyleId: styleId,
        engineOutcome: 'applied',
      },
      options,
    );
  } catch (error) {
    return fallback({
      requestedStyleId: styleId,
      appliedStyleId: 'built-in',
      engineOutcome: 'engine-error',
      errorMessage: citationFormattingErrorMessage(error),
    });
  }
};
