import {
  type ImportedFigureDraft,
  type ImportedSectionDraft,
} from './manuscriptDocImport';
import { serializeManuscriptExportStyleOverrides } from './manuscriptExportStyleOverrides';
import { type PortableResearchPaperManifest } from './manuscriptPortableManifest';
import { type ReferenceDraft } from './manuscriptReferenceImport';
import { serializeManuscriptTitlePageExtraLines } from './manuscriptTitlePage';

const PORTABLE_ASSET_KINDS = [
  'FIGURE',
  'TABLE',
  'SCHEME',
  'BOX',
  'EQUATION',
] as const;

const portableAssetKind = (
  value: string,
): (typeof PORTABLE_ASSET_KINDS)[number] =>
  PORTABLE_ASSET_KINDS.find((candidate) => candidate === value) ?? 'FIGURE';

export type PreparedPortableResearchPaperImport = {
  sections: ImportedSectionDraft[];
  references: ReferenceDraft[];
  linkedCount: number;
  figures: ImportedFigureDraft[];
  linkedAssetCount: number;
  tableCount: number;
  imageCount: number;
  portable: true;
};

export const preparePortableResearchPaperImport = (
  manifest: PortableResearchPaperManifest,
  sections: ImportedSectionDraft[],
): PreparedPortableResearchPaperImport => {
  const sectionOrderByKey = new Map(
    manifest.sections.map((section) => [section.key, section.orderIndex]),
  );
  const figures: ImportedFigureDraft[] = manifest.figures.map(
    (figure, index) => ({
      name: figure.name,
      assetKind: portableAssetKind(figure.assetKind),
      placement: figure.placement === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'MAIN',
      refKey: figure.refKey,
      caption: figure.caption,
      ...(figure.sectionKey !== undefined
        ? { sectionOrderIndex: sectionOrderByKey.get(figure.sectionKey) }
        : {}),
      ...(figure.tableData !== undefined
        ? { tableData: figure.tableData }
        : {}),
      imageSource: figure.imageUrl === undefined ? 'NONE' : 'UPLOAD',
      ...(figure.imageUrl !== undefined ? { imageUrl: figure.imageUrl } : {}),
      ...(figure.altText !== undefined ? { altText: figure.altText } : {}),
      ...(figure.credit !== undefined ? { credit: figure.credit } : {}),
      ...(figure.widthPercent !== undefined
        ? { widthPercent: figure.widthPercent }
        : {}),
      orderIndex: figure.orderIndex ?? index,
    }),
  );

  return {
    sections,
    references: manifest.references.map(
      ({ key: _key, ...reference }) => reference,
    ),
    linkedCount: manifest.references.length,
    figures,
    linkedAssetCount: manifest.figures.filter(
      (figure) => figure.sectionKey !== undefined,
    ).length,
    tableCount: manifest.figures.filter(
      (figure) => figure.assetKind === 'TABLE',
    ).length,
    imageCount: manifest.figures.filter(
      (figure) => figure.assetKind !== 'TABLE',
    ).length,
    portable: true,
  };
};

export type PortableManuscriptRecordUpdate = {
  name: string;
  authorLine?: string;
  affiliations?: string;
  titlePageExtraLines?: string;
  correspondingAuthor?: string;
  manuscriptType?: string;
  status?: string;
  targetVenue?: string;
  doi?: string;
  supplementTitle?: string;
  supplementAuthorLine?: string;
  supplementAffiliations?: string;
  exportStyleOverrides: string;
  coverLetter?: string;
  highlights?: string;
  competingInterests?: string;
  suggestedReviewers?: string;
};

export const portableManuscriptRecordUpdate = (
  manifest: PortableResearchPaperManifest,
): PortableManuscriptRecordUpdate => {
  const { metadata, submissionMaterials } = manifest;
  return {
    name: metadata.title,
    ...(metadata.authorLine !== undefined
      ? { authorLine: metadata.authorLine }
      : {}),
    ...(metadata.affiliations !== undefined
      ? { affiliations: metadata.affiliations }
      : {}),
    ...(metadata.titlePageExtraLines !== undefined
      ? {
          titlePageExtraLines: serializeManuscriptTitlePageExtraLines(
            metadata.titlePageExtraLines,
          ),
        }
      : {}),
    ...(metadata.correspondingAuthor !== undefined
      ? { correspondingAuthor: metadata.correspondingAuthor }
      : {}),
    ...(metadata.manuscriptType !== undefined
      ? { manuscriptType: metadata.manuscriptType }
      : {}),
    ...(metadata.status !== undefined ? { status: metadata.status } : {}),
    ...(metadata.targetVenue !== undefined
      ? { targetVenue: metadata.targetVenue }
      : {}),
    ...(metadata.doi !== undefined ? { doi: metadata.doi } : {}),
    ...(metadata.supplementTitle !== undefined
      ? { supplementTitle: metadata.supplementTitle }
      : {}),
    ...(metadata.supplementAuthorLine !== undefined
      ? { supplementAuthorLine: metadata.supplementAuthorLine }
      : {}),
    ...(metadata.supplementAffiliations !== undefined
      ? { supplementAffiliations: metadata.supplementAffiliations }
      : {}),
    exportStyleOverrides: serializeManuscriptExportStyleOverrides(
      manifest.exportStyle,
    ),
    ...(isDefined(submissionMaterials.coverLetter)
      ? { coverLetter: submissionMaterials.coverLetter }
      : {}),
    ...(isDefined(submissionMaterials.highlights)
      ? { highlights: submissionMaterials.highlights }
      : {}),
    ...(isDefined(submissionMaterials.competingInterests)
      ? { competingInterests: submissionMaterials.competingInterests }
      : {}),
    ...(isDefined(submissionMaterials.suggestedReviewers)
      ? { suggestedReviewers: submissionMaterials.suggestedReviewers }
      : {}),
  };
};
import { isDefined } from 'twenty-shared/utils';
