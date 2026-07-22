// Shared view-model types for the manuscript composer. These are the flat
// shapes the composer maps its bridge records into before handing them to the
// pure logic layer (numbering, cross-refs, citations, assembly, export). Keeping
// them here means every module agrees on one vocabulary and nothing depends on
// the GraphQL record shape.

export type AssetKind = 'FIGURE' | 'TABLE' | 'SCHEME' | 'BOX' | 'EQUATION';
export type AssetPlacement = 'MAIN' | 'SUPPLEMENT';
export type SectionPlacement =
  | 'FRONT_MATTER'
  | 'MAIN'
  | 'BACK_MATTER'
  | 'SUPPLEMENT';
export type CitationMode =
  | 'NUMERIC'
  | 'NUMERIC_SUPERSCRIPT'
  | 'AUTHOR_DATE'
  | 'AUTHOR_NUMBER';

export type SectionLike = {
  id: string;
  name?: string | null;
  sectionType?: string | null;
  placement?: string | null;
  content?: string | null;
  status?: string | null;
  orderIndex?: number | null;
  wordLimit?: number | null;
  wordCount?: number | null;
  includeInExport?: boolean | null;
};

export type FigureLike = {
  id: string;
  name?: string | null;
  refKey?: string | null;
  caption?: string | null;
  assetKind?: string | null;
  placement?: string | null;
  imageSource?: string | null;
  imageUrl?: string | null;
  altText?: string | null;
  credit?: string | null;
  widthPercent?: number | null;
  orderIndex?: number | null;
  sectionId?: string | null;
  // For TABLE assets: the grid as a GFM Markdown table string.
  tableData?: string | null;
};

export type ReferenceLike = {
  id: string;
  name?: string | null; // title
  citationKey?: string | null;
  cslType?: string | null;
  authors?: string | null;
  year?: number | null;
  containerTitle?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  doi?: string | null;
  url?: string | null;
  cslJson?: string | null;
  notes?: string | null;
};

// The journal format's knobs — everything the numbering/citation/layout logic
// reads. Every field is optional; sensible defaults fill the gaps.
export type JournalStyle = {
  id?: string | null;
  name?: string | null;
  profileKey?: string | null;
  citationMode?: string | null;
  citationStyleId?: string | null;
  figureLabelFormat?: string | null;
  tableLabelFormat?: string | null;
  supplementPrefix?: string | null;
  numberingScope?: string | null;
  crossRefFormat?: string | null;
  figureCaptionPosition?: string | null;
  figureCaptionFontSize?: number | null;
  figureCaptionLineSpacing?: number | null;
  figureCaptionGap?: number | null;
  figureCaptionSpacingAfter?: number | null;
  tableCaptionPosition?: string | null;
  figurePageLayout?: string | null;
  supplementStartLayout?: string | null;
  supplementCoverPage?: boolean | null;
  abstractWordLimit?: number | null;
  abstractWordMinimum?: number | null;
  keywordMinimum?: number | null;
  keywordMaximum?: number | null;
  requiredArtifacts?: string[] | null;
  submissionRequirements?: string | null;
  lineNumbering?: boolean | null;
  pageNumbering?: boolean | null;
  sectionNumbering?: boolean | null;
  twoColumn?: boolean | null;
  frontMatterLayout?: string | null;
  fontFamily?: string | null;
  bodyFontSize?: number | null;
  titleFontSize?: number | null;
  headingFontSize?: number | null;
  subheadingFontSize?: number | null;
  headingColor?: string | null;
  lineSpacing?: number | null;
  abstractLineSpacing?: number | null;
  paragraphSpacingAfter?: number | null;
  bodyAlignment?: string | null;
  affiliationAlignment?: string | null;
  affiliationNumberStyle?: string | null;
  affiliationLineSpacing?: number | null;
  affiliationSpacingAfter?: number | null;
  tableStyle?: string | null;
  tableFontSize?: number | null;
  tableLineSpacing?: number | null;
  referenceDocUrl?: string | null;
};

export type NumberedFigure = FigureLike & {
  // "1", "2", "S1" — includes the supplement prefix.
  number: string;
  // "Figure 1", "Table S1" — the rendered caption label.
  label: string;
  // How an in-text cross-reference to this asset renders (per crossRefFormat).
  crossRefLabel: string;
};
