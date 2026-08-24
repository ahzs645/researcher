import { isDefined } from 'twenty-shared/utils';

import { reconcileImportedCitations } from './manuscriptCitationReconcile';
import {
  extractCaptionOnlyFigures,
  extractImagesToFigures,
  extractLayoutTables,
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
import {
  dedupeReferenceDrafts,
  referenceIdentity,
} from './manuscriptReferenceStore';
import { type ReferenceLike } from './manuscriptTypes';

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

export type ExistingImportReference = Pick<
  ReferenceLike,
  'id' | 'doi' | 'citationKey' | 'name' | 'year'
>;

export type PrepareManuscriptImportOptions = {
  existingReferences?: ExistingImportReference[];
  existingFigureRefKeys?: string[];
};

const rewriteCitationKeys = (
  sections: ImportedSectionDraft[],
  rewrites: ReadonlyMap<string, string>,
): ImportedSectionDraft[] =>
  sections.map((section) => {
    const content = section.content.replace(
      /@([A-Za-z0-9_][\w:.-]*)/g,
      (token, citationKey: string) =>
        rewrites.has(citationKey) ? `@${rewrites.get(citationKey)}` : token,
    );
    return content === section.content ? section : { ...section, content };
  });

const dedupePreparedReferences = (
  sections: ImportedSectionDraft[],
  references: ReferenceDraft[],
  existingReferences: ExistingImportReference[],
): { sections: ImportedSectionDraft[]; references: ReferenceDraft[] } => {
  const { added } = dedupeReferenceDrafts(existingReferences, references);
  const targetKeyByIdentity = new Map<string, string>();
  for (const reference of [...existingReferences, ...added]) {
    const citationKey = reference.citationKey?.trim();
    if (citationKey !== undefined && citationKey.length > 0) {
      targetKeyByIdentity.set(referenceIdentity(reference), citationKey);
    }
  }

  const rewrites = new Map<string, string>();
  for (const reference of references) {
    const sourceKey = reference.citationKey?.trim();
    const targetKey = targetKeyByIdentity.get(referenceIdentity(reference));
    if (
      sourceKey !== undefined &&
      sourceKey.length > 0 &&
      targetKey !== undefined &&
      sourceKey !== targetKey
    ) {
      rewrites.set(sourceKey, targetKey);
    }
  }
  return {
    sections: rewriteCitationKeys(sections, rewrites),
    references: added,
  };
};

const uniquePortableFigureKeys = (
  preparedImport: PreparedPortableResearchPaperImport,
  existingFigureRefKeys: string[],
): PreparedPortableResearchPaperImport => {
  const usedRefKeys = new Set(existingFigureRefKeys);
  const rewrites = new Map<string, string>();
  const figures = preparedImport.figures.map((figure) => {
    const refKeyBase = figure.refKey;
    let refKey = refKeyBase;
    let duplicateIndex = 2;
    while (usedRefKeys.has(refKey)) {
      refKey = `${refKeyBase}-${duplicateIndex}`;
      duplicateIndex += 1;
    }
    usedRefKeys.add(refKey);
    if (refKey !== refKeyBase) rewrites.set(refKeyBase, refKey);
    return refKey === refKeyBase ? figure : { ...figure, refKey };
  });
  const sections = preparedImport.sections.map((section) => ({
    ...section,
    content: section.content.replace(
      /\[\[asset:([^\]]+)\]\]|\[#([^\]]+)\]/g,
      (
        token,
        placementKey: string | undefined,
        referenceKey: string | undefined,
      ) => {
        const sourceKey = placementKey ?? referenceKey;
        const targetKey =
          sourceKey === undefined ? undefined : rewrites.get(sourceKey);
        if (targetKey === undefined) return token;
        return placementKey === undefined
          ? `[#${targetKey}]`
          : `[[asset:${targetKey}]]`;
      },
    ),
  }));
  return { ...preparedImport, sections, figures };
};

export const prepareManuscriptImport = (
  document: ImportedDocument,
  reconcile: boolean,
  options: PrepareManuscriptImportOptions = {},
): PreparedManuscriptImport => {
  const existingReferences = options.existingReferences ?? [];
  const existingFigureRefKeys = options.existingFigureRefKeys ?? [];
  if (document.portablePackage !== undefined) {
    const portableImport = uniquePortableFigureKeys(
      preparePortableResearchPaperImport(
        document.portablePackage,
        document.sections,
      ),
      existingFigureRefKeys,
    );
    const deduped = dedupePreparedReferences(
      portableImport.sections,
      portableImport.references,
      existingReferences,
    );
    return {
      ...portableImport,
      sections: deduped.sections,
      references: deduped.references,
    };
  }

  const usedRefKeys = new Set(existingFigureRefKeys);
  const suppressedAssetLineSignatures = new Set(
    document.suppressedAssetLineSignatures ?? [],
  );
  // Equations and callouts first: they are laid out as tables, and lifting
  // them here is what keeps a numbered display equation from being imported as
  // the paper's "Table 3".
  const equations = extractLayoutTables(document.sections, 0, usedRefKeys);
  const images = extractImagesToFigures(
    equations.sections,
    equations.figures.length,
    usedRefKeys,
    suppressedAssetLineSignatures,
  );
  const tables = extractTablesToFigures(
    images.sections,
    equations.figures.length + images.figures.length,
    usedRefKeys,
    suppressedAssetLineSignatures,
  );
  const captionFigures = extractCaptionOnlyFigures(
    tables.sections,
    equations.figures.length + images.figures.length + tables.figures.length,
    usedRefKeys,
    suppressedAssetLineSignatures,
  );
  const linkedAssets = linkImportedAssetReferences(captionFigures.sections, [
    ...equations.figures,
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
  const deduped = dedupePreparedReferences(
    reconciled.sections,
    reconciled.references,
    existingReferences,
  );
  const sections = deduped.sections.map((section) =>
    (section.sectionType === 'TITLE_PAGE' && isDefined(document.authorLine)) ||
    (section.sectionType === 'REFERENCES' &&
      deduped.references.length === 0 &&
      /see (?:the )?journal.+instructions/i.test(section.name))
      ? { ...section, includeInExport: false }
      : section,
  );

  return {
    sections,
    references: deduped.references,
    linkedCount: reconciled.linkedCount,
    figures: linkedAssets.figures,
    linkedAssetCount: linkedAssets.linkedCount,
    tableCount: tables.figures.length,
    imageCount: images.figures.length + captionFigures.figures.length,
    portable: false,
  };
};
