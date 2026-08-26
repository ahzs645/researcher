import { isDefined } from 'twenty-shared/utils';

import {
  type ImportedFigureDraft,
  type ImportedSectionDraft,
} from './manuscriptDocImport';
import { extractCitationKeys } from './manuscriptCrossReference';
import { serializeManuscriptExportStyleOverrides } from './manuscriptExportStyleOverrides';
import {
  type PortableJournalTemplate,
  type PortableResearchPaperManifest,
} from './manuscriptPortableManifest';
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
  // The journal template the package carries (v2+), so the restore can link
  // or re-create it.
  journal?: PortableJournalTemplate;
  portable: true;
  // Whether this app wrote the file. A package we exported needs no review —
  // its structure is records we saved. A JATS article is just as structured
  // but came from somewhere else, and committing a stranger's file without
  // showing it first would be the wrong kind of confident.
  autoRestore: boolean;
};

// Which existing journal template a package's own template *is*. A seeded
// template is identified by its profile key; one the author wrote is matched
// by name. Anything else is a template this workspace does not have yet.
export const matchPortableJournalTemplate = <
  TJournal extends {
    id: string;
    name?: string | null;
    profileKey?: string | null;
  },
>(
  journal: PortableJournalTemplate | undefined,
  existing: TJournal[],
): TJournal | undefined => {
  if (journal === undefined) return undefined;
  const profileKey = journal.profileKey?.trim();
  if (profileKey !== undefined && profileKey.length > 0) {
    const byProfile = existing.find(
      (candidate) => candidate.profileKey?.trim() === profileKey,
    );
    if (byProfile !== undefined) return byProfile;
  }
  const name = journal.name.trim().toLowerCase();
  return existing.find(
    (candidate) => (candidate.name ?? '').trim().toLowerCase() === name,
  );
};

export const preparePortableResearchPaperImport = (
  manifest: PortableResearchPaperManifest,
  sections: ImportedSectionDraft[],
  autoRestore = true,
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
      ...(figure.sourceLabel !== undefined
        ? { sourceLabel: figure.sourceLabel }
        : {}),
      caption: figure.caption,
      ...(figure.sectionKey !== undefined
        ? { sectionOrderIndex: sectionOrderByKey.get(figure.sectionKey) }
        : {}),
      ...(figure.tableData !== undefined
        ? { tableData: figure.tableData }
        : {}),
      ...(figure.equationLatex !== undefined
        ? { equationLatex: figure.equationLatex }
        : {}),
      ...(figure.numbered === false ? { numbered: false } : {}),
      ...(figure.diagramSource !== undefined
        ? { diagramSource: figure.diagramSource }
        : {}),
      imageSource:
        figure.diagramSource !== undefined
          ? 'DIAGRAM'
          : figure.imageUrl === undefined
            ? 'NONE'
            : 'UPLOAD',
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
    // Count in-text citations that actually resolve to a reference record —
    // reporting the reference count here read as "everything is linked" even
    // when the prose cited nothing.
    linkedCount: (() => {
      const citationKeys = new Set(
        manifest.references.map((reference) => reference.citationKey),
      );
      const cited = new Set<string>();
      for (const section of manifest.sections) {
        for (const key of extractCitationKeys(section.content ?? '')) {
          if (citationKeys.has(key)) cited.add(key);
        }
      }
      return cited.size;
    })(),
    figures,
    linkedAssetCount: manifest.figures.filter(
      (figure) => figure.sectionKey !== undefined,
    ).length,
    ...(manifest.journal !== undefined ? { journal: manifest.journal } : {}),
    tableCount: manifest.figures.filter(
      (figure) => figure.assetKind === 'TABLE',
    ).length,
    imageCount: manifest.figures.filter(
      (figure) => figure.assetKind !== 'TABLE',
    ).length,
    portable: true,
    autoRestore,
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
  exportStyleOverrides?: string;
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
    // A package with no style info (exported before a journal was picked)
    // must not wipe the target manuscript's saved overrides.
    ...(Object.keys(manifest.exportStyle).length > 0
      ? {
          exportStyleOverrides: serializeManuscriptExportStyleOverrides(
            manifest.exportStyle,
          ),
        }
      : {}),
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
