import { type ManuscriptBundle } from './manuscriptAssembly';
import {
  citationFormattingFailed,
  describeCitationProvenance,
} from './manuscriptCitationProvenance';
import { type ExportFile } from './manuscriptExport';

export const CITATION_FORMATTING_REPORT_FILENAME = 'citation-formatting.json';

export const withCitationFormattingReport = (
  bundle: ManuscriptBundle,
  files: ExportFile[],
): ExportFile[] => [
  ...files.map((file) => ({
    ...file,
    citationProvenance: bundle.citationProvenance,
  })),
  {
    filename: CITATION_FORMATTING_REPORT_FILENAME,
    mimeType: 'application/json',
    citationProvenance: bundle.citationProvenance,
    content: JSON.stringify(
      {
        ...bundle.citationProvenance,
        description: describeCitationProvenance(bundle.citationProvenance),
        warnings: [
          ...bundle.warnings,
          ...(citationFormattingFailed(bundle.citationProvenance)
            ? [describeCitationProvenance(bundle.citationProvenance)]
            : []),
        ],
      },
      null,
      2,
    ),
  },
];
