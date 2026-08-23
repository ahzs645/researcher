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
  extractCitationClusters,
  type FormattedBibliographyEntry,
} from './manuscriptCitations';

const exportableSectionContent = (bundle: ManuscriptBundle): string[] =>
  manuscriptSectionsForExport(bundle.sourceInput).map(
    (section) => section.content ?? '',
  );

const rebuildWithOptions = (
  bundle: ManuscriptBundle,
  citationFormatting: ManuscriptCitationFormatting | undefined,
  options: ManuscriptBundleOptions,
): ManuscriptBundle =>
  buildManuscriptBundle(
    { ...bundle.sourceInput, style: bundle.style },
    citationFormatting,
    options,
  );

export const prepareManuscriptBundleWithCsl = async (
  bundle: ManuscriptBundle,
  options: ManuscriptBundleOptions = {},
): Promise<ManuscriptBundle> => {
  const styleId = bundle.style.citationStyleId;
  if (!isVendoredCslStyleId(styleId)) {
    // No CSL engine for this style, but an exporter that asked for citation
    // anchors still needs them, so rebuild from the same source input.
    return options.citationAnchors === true
      ? rebuildWithOptions(bundle, undefined, options)
      : bundle;
  }

  try {
    const engine = await createCiteprocEngine({
      styleId,
      references: bundle.sourceInput.references,
    });
    if (engine === null) return bundle;

    const clusters = exportableSectionContent(bundle).flatMap(
      extractCitationClusters,
    );
    const labels = formatCslCitations(engine, clusters);
    const labelsByCluster = new Map(
      clusters.map((cluster, index) => [
        citationClusterKey(cluster),
        labels[index],
      ]),
    );
    const bibliography: FormattedBibliographyEntry[] =
      formatCslBibliography(engine);

    return rebuildWithOptions(
      bundle,
      { bibliography, labelsByCluster },
      options,
    );
  } catch {
    return options.citationAnchors === true
      ? rebuildWithOptions(bundle, undefined, options)
      : bundle;
  }
};
