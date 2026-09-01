import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { parseManuscriptSubmissionExtras } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';

export const SUBMISSION_TRACKING_EXTRAS_KEY =
  '__researcher_submission_tracking__';

export type WithManuscript = {
  manuscript?: { id?: string | null } | null;
};

export type DatasetRecord = {
  id: string;
  name?: string | null;
  dataGrid?: string | null;
};

export type SectionRecord = SectionLike & WithManuscript;
export type FigureRecord = Omit<FigureLike, 'sectionId'> &
  WithManuscript & {
    section?: { id?: string | null } | null;
    dataset?: { id?: string | null } | null;
  };
export type ReferenceRecord = ReferenceLike &
  WithManuscript & { project?: { id?: string | null } | null };

export type ManuscriptRecord = {
  id: string;
  updatedAt?: string | null;
  name?: string | null;
  status?: string | null;
  manuscriptType?: string | null;
  targetVenue?: string | null;
  doi?: string | null;
  authorLine?: string | null;
  affiliations?: string | null;
  titlePageExtraLines?: string | null;
  correspondingAuthor?: string | null;
  // Optional structured contributor layer (ORCIDs, CRediT roles, ROR
  // affiliations, funding) as JSON, keyed to the author line's own authors.
  contributorMetadata?: string | null;
  supplementTitle?: string | null;
  supplementAuthorLine?: string | null;
  supplementAffiliations?: string | null;
  exportStyleOverrides?: string | null;
  submissionExtras?: string | null;
  coverLetter?: string | null;
  highlights?: string | null;
  competingInterests?: string | null;
  suggestedReviewers?: string | null;
  targetJournal?: { id?: string | null } | null;
  submissionTracking?: {
    journalConfirmed: boolean;
    submittedAt: string;
    version: string;
  };
};

export const withSubmissionTracking = (
  manuscript: ManuscriptRecord,
): ManuscriptRecord => {
  const values = parseManuscriptSubmissionExtras(manuscript.submissionExtras)[
    SUBMISSION_TRACKING_EXTRAS_KEY
  ];
  return {
    ...manuscript,
    submissionTracking: {
      journalConfirmed: values?.journalConfirmed === 'true',
      submittedAt: values?.submittedAt ?? '',
      version: values?.version ?? '',
    },
  };
};

export type JournalRecord = JournalStyle & { id: string };

export const MANUSCRIPT_GQL = {
  id: true,
  updatedAt: true,
  name: true,
  status: true,
  manuscriptType: true,
  targetVenue: true,
  doi: true,
  authorLine: true,
  affiliations: true,
  titlePageExtraLines: true,
  correspondingAuthor: true,
  contributorMetadata: true,
  supplementTitle: true,
  supplementAuthorLine: true,
  supplementAffiliations: true,
  exportStyleOverrides: true,
  submissionExtras: true,
  coverLetter: true,
  highlights: true,
  competingInterests: true,
  suggestedReviewers: true,
  targetJournal: { id: true },
};

export const SECTION_GQL = {
  id: true,
  name: true,
  refKey: true,
  sectionType: true,
  placement: true,
  content: true,
  orderIndex: true,
  level: true,
  wordLimit: true,
  wordCount: true,
  includeInExport: true,
  status: true,
  variantOfId: true,
  variantProfileKey: true,
  variantRules: true,
  // Carries the co-author comments a Word import left here, so the composer
  // can show them and the DOCX export can write them back out.
  notes: true,
  manuscript: { id: true },
};

// The landing list's lighter selection. It carries the version fields too, so
// a manuscript's section count on that screen is not inflated by versions it
// has no way of telling apart from sections.
export const SECTION_SUMMARY_GQL = {
  id: true,
  name: true,
  sectionType: true,
  placement: true,
  orderIndex: true,
  level: true,
  wordCount: true,
  includeInExport: true,
  status: true,
  variantOfId: true,
  variantProfileKey: true,
  variantRules: true,
  manuscript: { id: true },
};

export const FIGURE_GQL = {
  id: true,
  name: true,
  refKey: true,
  sourceLabel: true,
  caption: true,
  assetKind: true,
  placement: true,
  imageSource: true,
  imageUrl: true,
  altText: true,
  credit: true,
  widthPercent: true,
  numbered: true,
  parentFigureId: true,
  panelColumns: true,
  orderIndex: true,
  tableData: true,
  equationLatex: true,
  diagramSource: true,
  manuscript: { id: true },
  section: { id: true },
  dataset: { id: true },
};

export const DATASET_GQL = {
  id: true,
  name: true,
  dataGrid: true,
};

export const REFERENCE_GQL = {
  id: true,
  createdAt: true,
  name: true,
  citationKey: true,
  cslType: true,
  authors: true,
  year: true,
  containerTitle: true,
  volume: true,
  issue: true,
  pages: true,
  doi: true,
  url: true,
  cslJson: true,
  notes: true,
  manuscript: { id: true },
  project: { id: true },
};

export const JOURNAL_GQL = {
  id: true,
  name: true,
  citationMode: true,
  citationStyleId: true,
  figureLabelFormat: true,
  tableLabelFormat: true,
  supplementPrefix: true,
  numberingScope: true,
  crossRefFormat: true,
  figureCaptionPosition: true,
  figureCaptionFontSize: true,
  figureCaptionLineSpacing: true,
  figureCaptionGap: true,
  figureCaptionSpacingAfter: true,
  tableCaptionPosition: true,
  figurePageLayout: true,
  supplementStartLayout: true,
  supplementCoverPage: true,
  abstractWordLimit: true,
  abstractWordMinimum: true,
  sectionSkeleton: true,
  keywordMinimum: true,
  keywordMaximum: true,
  requiredArtifacts: true,
  submissionRequirements: true,
  profileKey: true,
  lineNumbering: true,
  pageNumbering: true,
  sectionNumbering: true,
  twoColumn: true,
  frontMatterLayout: true,
  titlePageTemplate: true,
  fontFamily: true,
  bodyFontSize: true,
  titleFontSize: true,
  headingFontSize: true,
  subheadingFontSize: true,
  headingColor: true,
  lineSpacing: true,
  abstractLineSpacing: true,
  paragraphSpacingAfter: true,
  paragraphFirstLineIndent: true,
  bodyAlignment: true,
  affiliationAlignment: true,
  affiliationNumberStyle: true,
  affiliationLineSpacing: true,
  affiliationSpacingAfter: true,
  tableStyle: true,
  tableFontSize: true,
  tableLineSpacing: true,
  referenceDocUrl: true,
};

export const sortSections = (sections: SectionLike[]): SectionLike[] =>
  [...sections].sort(
    (first, second) =>
      (first.orderIndex ?? Number.MAX_SAFE_INTEGER) -
      (second.orderIndex ?? Number.MAX_SAFE_INTEGER),
  );

export const belongsTo = (
  record: WithManuscript,
  manuscriptId: string,
): boolean => record.manuscript?.id === manuscriptId;
