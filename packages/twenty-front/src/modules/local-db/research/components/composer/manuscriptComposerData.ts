import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

export type WithManuscript = {
  manuscript?: { id?: string | null } | null;
};

export type SectionRecord = SectionLike & WithManuscript;
export type FigureRecord = Omit<FigureLike, 'sectionId'> &
  WithManuscript & { section?: { id?: string | null } | null };
export type ReferenceRecord = ReferenceLike &
  WithManuscript & { project?: { id?: string | null } | null };

export type ManuscriptRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  manuscriptType?: string | null;
  targetVenue?: string | null;
  doi?: string | null;
  authorLine?: string | null;
  affiliations?: string | null;
  titlePageExtraLines?: string | null;
  correspondingAuthor?: string | null;
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
};

export type JournalRecord = JournalStyle & { id: string };

export const MANUSCRIPT_GQL = {
  id: true,
  name: true,
  status: true,
  manuscriptType: true,
  targetVenue: true,
  doi: true,
  authorLine: true,
  affiliations: true,
  titlePageExtraLines: true,
  correspondingAuthor: true,
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
  sectionType: true,
  placement: true,
  content: true,
  orderIndex: true,
  level: true,
  wordLimit: true,
  wordCount: true,
  includeInExport: true,
  status: true,
  manuscript: { id: true },
};

export const FIGURE_GQL = {
  id: true,
  name: true,
  refKey: true,
  caption: true,
  assetKind: true,
  placement: true,
  imageSource: true,
  imageUrl: true,
  altText: true,
  credit: true,
  widthPercent: true,
  orderIndex: true,
  tableData: true,
  equationLatex: true,
  manuscript: { id: true },
  section: { id: true },
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
  fontFamily: true,
  bodyFontSize: true,
  titleFontSize: true,
  headingFontSize: true,
  subheadingFontSize: true,
  headingColor: true,
  lineSpacing: true,
  abstractLineSpacing: true,
  paragraphSpacingAfter: true,
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
