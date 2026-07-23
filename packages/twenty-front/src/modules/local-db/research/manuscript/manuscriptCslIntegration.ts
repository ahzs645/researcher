import {
  buildManuscriptBundle,
  manuscriptSectionsForExport,
  type ManuscriptBundle,
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

export const prepareManuscriptBundleWithCsl = async (
  bundle: ManuscriptBundle,
): Promise<ManuscriptBundle> => {
  const styleId = bundle.style.citationStyleId;
  if (!isVendoredCslStyleId(styleId)) return bundle;

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

    return buildManuscriptBundle(
      {
        ...bundle.sourceInput,
        style: bundle.style,
      },
      { bibliography, labelsByCluster },
    );
  } catch {
    return bundle;
  }
};
