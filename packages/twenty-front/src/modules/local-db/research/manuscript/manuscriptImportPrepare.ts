import { isDefined } from 'twenty-shared/utils';

import { reconcileImportedCitations } from './manuscriptCitationReconcile';
import {
  extractCaptionOnlyFigures,
  extractImagesToFigures,
  extractTablesToFigures,
  linkImportedAssetReferences,
  type ImportedDocument,
  type ImportedFigureDraft,
  type ImportedSectionDraft,
} from './manuscriptDocImport';
import {
  preparePortableResearchPaperImport,
  type PreparedPortableResearchPaperImport,
} from './manuscriptPortableImport';
import { type ReferenceDraft } from './manuscriptReferenceImport';

export type PreparedStandardManuscriptImport = {
  sections: ImportedSectionDraft[];
  references: ReferenceDraft[];
  linkedCount: number;
  figures: ImportedFigureDraft[];
  linkedAssetCount: number;
  tableCount: number;
  imageCount: number;
  portable: false;
};

export type PreparedManuscriptImport =
  | PreparedStandardManuscriptImport
  | PreparedPortableResearchPaperImport;

export const prepareManuscriptImport = (
  document: ImportedDocument,
  reconcile: boolean,
): PreparedManuscriptImport => {
  if (document.portablePackage !== undefined) {
    return preparePortableResearchPaperImport(
      document.portablePackage,
      document.sections,
    );
  }

  const usedRefKeys = new Set<string>();
  const images = extractImagesToFigures(document.sections, 0, usedRefKeys);
  const tables = extractTablesToFigures(
    images.sections,
    images.figures.length,
    usedRefKeys,
  );
  const captionFigures = extractCaptionOnlyFigures(
    tables.sections,
    images.figures.length + tables.figures.length,
    usedRefKeys,
  );
  const linkedAssets = linkImportedAssetReferences(captionFigures.sections, [
    ...images.figures,
    ...tables.figures,
    ...captionFigures.figures,
  ]);
  const reconciled = reconcile
    ? reconcileImportedCitations(linkedAssets.sections)
    : {
        sections: linkedAssets.sections,
        references: [],
        linkedCount: 0,
        style: 'none' as const,
      };
  const sections = reconciled.sections.map((section) =>
    (section.sectionType === 'TITLE_PAGE' && isDefined(document.authorLine)) ||
    (section.sectionType === 'REFERENCES' &&
      reconciled.references.length === 0 &&
      /see (?:the )?journal.+instructions/i.test(section.name))
      ? { ...section, includeInExport: false }
      : section,
  );

  return {
    sections,
    references: reconciled.references,
    linkedCount: reconciled.linkedCount,
    figures: linkedAssets.figures,
    linkedAssetCount: linkedAssets.linkedCount,
    tableCount: tables.figures.length,
    imageCount: images.figures.length + captionFigures.figures.length,
    portable: false,
  };
};
