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
import {
  resolvePortableReviewRounds,
  type PortableReviewRoundDraft,
} from './manuscriptPortableReviewRounds';
import { parseSectionVariantRules } from './manuscriptSectionVariants';
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

// One section of the package that is an alternative version of another, with
// both ends given as `orderIndex`. That is the only handle a restore has: the
// records do not exist yet, and `orderIndex` is what the commit step already
// keys newly created sections by (it is how a figure finds its section too).
export type PortableSectionVariantLink = {
  orderIndex: number;
  baseOrderIndex: number;
  variantProfileKey?: string;
  variantRules?: string;
};

// A version attached to its base, once both are real records.
export type PortableSectionVariantUpdate = {
  sectionId: string;
  variantOfId: string;
  variantProfileKey?: string;
  variantRules?: string;
};

export type PreparedPortableResearchPaperImport = {
  sections: ImportedSectionDraft[];
  references: ReferenceDraft[];
  linkedCount: number;
  figures: ImportedFigureDraft[];
  linkedAssetCount: number;
  tableCount: number;
  imageCount: number;
  // Versions to re-attach after the sections are created, and what the restore
  // could not carry across in the words the review step shows the author — a
  // dropped version is work they wrote, so it says so rather than going quiet.
  // `preparePortableResearchPaperImport` always sets both; they are optional
  // so that a prepared import assembled by hand still describes one.
  sectionVariants?: PortableSectionVariantLink[];
  // The rounds of review to re-create once the sections exist, each point's
  // section given as an `orderIndex` for the same reason a version's base is.
  // Optional alongside the two above, and for the same reason: a prepared
  // import assembled by hand still describes one.
  reviewRounds?: PortableReviewRoundDraft[];
  warnings?: string[];
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

// How to refer to one version in a message to the author.
const portableSectionVariantDescription = (section: {
  variantProfileKey?: string;
  variantRules?: string;
}): string => {
  if (section.variantProfileKey !== undefined) {
    return ` (written for ${section.variantProfileKey})`;
  }
  const maxWords = parseSectionVariantRules(section.variantRules).maxWords;
  return maxWords === undefined ? '' : ` (written to ${maxWords} words)`;
};

type PortableSectionVariantResolution = {
  links: PortableSectionVariantLink[];
  // Order indices of the versions that cannot be attached to anything.
  droppedOrderIndexes: Set<number>;
  warnings: string[];
};

// Resolve each version's `variantOfKey` back to the base section's place in
// this import. A version whose base key is not in the package is dropped
// rather than restored: a version never stands on its own, so importing it as
// an ordinary section would quietly add a second abstract to the paper. It is
// still the author's writing, so the drop is reported instead of being silent.
const resolvePortableSectionVariants = (
  manifest: PortableResearchPaperManifest,
  sectionOrderByKey: ReadonlyMap<string, number>,
): PortableSectionVariantResolution => {
  const links: PortableSectionVariantLink[] = [];
  const droppedOrderIndexes = new Set<number>();
  const warnings: string[] = [];
  for (const section of manifest.sections) {
    const variantOfKey = section.variantOfKey;
    if (variantOfKey === undefined || variantOfKey.length === 0) continue;
    const baseOrderIndex = sectionOrderByKey.get(variantOfKey);
    if (baseOrderIndex === undefined) {
      droppedOrderIndexes.add(section.orderIndex);
      // Name the version by whatever it was written for — the journal it
      // names, or the rule it declares — so the author reads which of their
      // three abstracts this was and not just that one of them went.
      const writtenFor = portableSectionVariantDescription(section);
      warnings.push(
        `"${section.name}"${writtenFor} is an alternative version of a section this package does not contain, so it was not imported.`,
      );
      continue;
    }
    links.push({
      orderIndex: section.orderIndex,
      baseOrderIndex,
      ...(section.variantProfileKey !== undefined
        ? { variantProfileKey: section.variantProfileKey }
        : {}),
      // Carried across untouched, malformed or not: the reader that acts on it
      // validates it, and a package written by a build that knows more rules
      // than this one should not have them stripped in passing.
      ...(section.variantRules !== undefined
        ? { variantRules: section.variantRules }
        : {}),
    });
  }
  return { links, droppedOrderIndexes, warnings };
};

// Turn the resolved links into the updates that attach each version to its
// base. The ids only exist once the sections have been created, so this runs
// at the end of a restore rather than while preparing one.
export const portableSectionVariantUpdates = (
  links: readonly PortableSectionVariantLink[],
  sectionIdsByOrderIndex: ReadonlyMap<number, string>,
): PortableSectionVariantUpdate[] =>
  links.flatMap((link) => {
    const sectionId = sectionIdsByOrderIndex.get(link.orderIndex);
    const variantOfId = sectionIdsByOrderIndex.get(link.baseOrderIndex);
    // A section the commit step never created (it failed, or the caller is
    // restoring a subset) leaves nothing to point at, and half a link is
    // worse than none: it would make the version export as a section.
    if (sectionId === undefined || variantOfId === undefined) return [];
    return [
      {
        sectionId,
        variantOfId,
        ...(link.variantProfileKey !== undefined
          ? { variantProfileKey: link.variantProfileKey }
          : {}),
        ...(link.variantRules !== undefined
          ? { variantRules: link.variantRules }
          : {}),
      },
    ];
  });

export const preparePortableResearchPaperImport = (
  manifest: PortableResearchPaperManifest,
  sections: ImportedSectionDraft[],
  autoRestore = true,
): PreparedPortableResearchPaperImport => {
  const sectionOrderByKey = new Map(
    manifest.sections.map((section) => [section.key, section.orderIndex]),
  );
  // The same handle a version uses to find its base and a figure to find its
  // section: `orderIndex`, because none of these records exist yet.
  const figureOrderByKey = new Map(
    manifest.figures.map((figure, index) => [
      figure.key,
      figure.orderIndex ?? index,
    ]),
  );
  const variants = resolvePortableSectionVariants(manifest, sectionOrderByKey);
  // Rounds resolve against the same key→place map the versions and figures
  // use, so a point, a figure and a version all name a section the one way.
  const reviewRounds = resolvePortableReviewRounds(
    manifest.reviewRounds,
    sectionOrderByKey,
  );
  // The drafts are this manifest's sections, so `orderIndex` identifies the
  // same section on both sides. A package with nothing to drop keeps the
  // caller's list untouched, including callers that pass sections of their own.
  const importedSections =
    variants.droppedOrderIndexes.size === 0
      ? sections
      : sections.filter(
          (section) => !variants.droppedOrderIndexes.has(section.orderIndex),
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
      ...(figure.parentFigureKey !== undefined &&
      figureOrderByKey.has(figure.parentFigureKey)
        ? { parentOrderIndex: figureOrderByKey.get(figure.parentFigureKey) }
        : {}),
      ...(figure.panelColumns !== undefined
        ? { panelColumns: figure.panelColumns }
        : {}),
    }),
  );

  return {
    sections: importedSections,
    sectionVariants: variants.links,
    reviewRounds: reviewRounds.rounds,
    warnings: [...variants.warnings, ...reviewRounds.warnings],
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
