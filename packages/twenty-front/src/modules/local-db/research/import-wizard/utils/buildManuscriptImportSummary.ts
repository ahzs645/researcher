import { type ImportedSectionDraft } from '@/local-db/research/manuscript/manuscriptDocImport';
import { type PreparedManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';

const PLACEMENT_LABELS = {
  FRONT_MATTER: 'Front matter',
  MAIN: 'Main',
  BACK_MATTER: 'Back matter',
  SUPPLEMENT: 'Supplement',
  OTHER: 'Other',
} as const;

type ManuscriptImportSummaryPlacement = keyof typeof PLACEMENT_LABELS;

const PLACEMENT_ORDER = [
  'FRONT_MATTER',
  'MAIN',
  'BACK_MATTER',
  'SUPPLEMENT',
  'OTHER',
] as const;

// The composer regenerates the title page from the manuscript record, so an
// imported title-page section is kept as content but never rendered again.
export const TITLE_PAGE_EXCLUSION_REASON =
  'the composer rebuilds the title page from the title, authors and affiliations, so exporting the imported copy too would print it twice';

export const REFERENCES_EXCLUSION_REASON =
  'the bibliography is generated from the imported reference records instead';

export const SOURCE_EXCLUSION_REASON =
  'it was already marked "not exported" in the source manuscript';

export type ManuscriptImportSummaryGroup = {
  placement: ManuscriptImportSummaryPlacement;
  label: string;
  sectionCount: number;
  wordCount: number;
  sectionNames: string[];
};

export type ManuscriptImportSummaryExclusion = {
  sectionName: string;
  reason: string;
};

export type ManuscriptImportSummary = {
  sectionCount: number;
  wordCount: number;
  figureCount: number;
  tableCount: number;
  // Equations stored as manuscript assets, counted inside `assetCount`.
  equationAssetCount: number;
  // Equations typed inline in section content; they are not asset records.
  inlineEquationCount: number;
  equationCount: number;
  otherAssetCount: number;
  assetCount: number;
  linkedAssetCount: number;
  referenceCount: number;
  linkedCitationCount: number;
  groups: ManuscriptImportSummaryGroup[];
  exclusions: ManuscriptImportSummaryExclusion[];
};

export type BuildManuscriptImportSummaryInput = {
  preparedImport: PreparedManuscriptImport;
  // Inline `$$…$$` math found in the source document; equation *assets* are
  // counted separately from the prepared figures.
  inlineEquationCount?: number;
};

const summaryPlacement = (
  placement: string,
): ManuscriptImportSummaryPlacement =>
  PLACEMENT_ORDER.find((candidate) => candidate === placement) ?? 'OTHER';

// Mirrors the commit-time rule in useManuscriptImportCommit: a REFERENCES
// section is not exported once real reference records exist to render from.
const exclusionReason = (
  section: ImportedSectionDraft,
  referenceCount: number,
): string | undefined => {
  if (section.sectionType === 'TITLE_PAGE' && !section.includeInExport) {
    return TITLE_PAGE_EXCLUSION_REASON;
  }
  if (
    section.sectionType === 'REFERENCES' &&
    (referenceCount > 0 || !section.includeInExport)
  ) {
    return REFERENCES_EXCLUSION_REASON;
  }
  if (!section.includeInExport) return SOURCE_EXCLUSION_REASON;
  return undefined;
};

export const buildManuscriptImportSummary = ({
  preparedImport,
  inlineEquationCount = 0,
}: BuildManuscriptImportSummaryInput): ManuscriptImportSummary => {
  const { sections, figures, references } = preparedImport;

  const groupsByPlacement = new Map<
    ManuscriptImportSummaryPlacement,
    ManuscriptImportSummaryGroup
  >();
  for (const section of sections) {
    const placement = summaryPlacement(section.placement);
    const group = groupsByPlacement.get(placement) ?? {
      placement,
      label: PLACEMENT_LABELS[placement],
      sectionCount: 0,
      wordCount: 0,
      sectionNames: [],
    };
    group.sectionCount += 1;
    group.wordCount += section.wordCount;
    group.sectionNames.push(section.name);
    groupsByPlacement.set(placement, group);
  }

  const tableCount = figures.filter(
    (figure) => figure.assetKind === 'TABLE',
  ).length;
  const equationAssetCount = figures.filter(
    (figure) => figure.assetKind === 'EQUATION',
  ).length;
  const figureCount = figures.filter(
    (figure) => figure.assetKind === 'FIGURE',
  ).length;

  return {
    sectionCount: sections.length,
    wordCount: sections.reduce(
      (total, section) => total + section.wordCount,
      0,
    ),
    figureCount,
    tableCount,
    equationAssetCount,
    inlineEquationCount,
    equationCount: equationAssetCount + inlineEquationCount,
    otherAssetCount:
      figures.length - tableCount - equationAssetCount - figureCount,
    assetCount: figures.length,
    linkedAssetCount: preparedImport.linkedAssetCount,
    referenceCount: references.length,
    linkedCitationCount: preparedImport.linkedCount,
    groups: PLACEMENT_ORDER.map((placement) =>
      groupsByPlacement.get(placement),
    ).filter(
      (group): group is ManuscriptImportSummaryGroup => group !== undefined,
    ),
    exclusions: sections.flatMap((section) => {
      const reason = exclusionReason(section, references.length);
      return reason === undefined
        ? []
        : [{ sectionName: section.name, reason }];
    }),
  };
};
