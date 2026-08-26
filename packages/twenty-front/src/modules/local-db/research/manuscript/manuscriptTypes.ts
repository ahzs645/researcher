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
  level?: number | null;
  wordLimit?: number | null;
  wordCount?: number | null;
  // A section may carry alternative versions of itself: an abstract cut to
  // 200 words next to the 320-word one arXiv takes. `variantOfId` names the
  // section this rewords. A version is an ordinary section record that never
  // exports on its own — it stands in for its base.
  //
  // What it stands in for is said in one of two ways. `variantProfileKey` pins
  // it to a single journal profile, which then receives it whatever else is
  // true. `variantRules` is JSON declaring the requirement it satisfies —
  // `{"maxWords":200}` — and every journal that asks for no more than that can
  // use it, so one 200-word abstract serves every journal capping at 200.
  variantOfId?: string | null;
  variantProfileKey?: string | null;
  variantRules?: string | null;
  includeInExport?: boolean | null;
};

export type FigureLike = {
  id: string;
  name?: string | null;
  refKey?: string | null;
  // The label the source document used ("2.6", "S2.18") before our numbering —
  // kept so original-numbering inconsistencies stay auditable downstream.
  sourceLabel?: string | null;
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
  // Set when the figure renders (a chart of) a dataset record's table.
  datasetId?: string | null;
  // For TABLE assets: the grid as a GFM Markdown table string.
  tableData?: string | null;
  // For EQUATION assets: the body as LaTeX, without delimiters.
  equationLatex?: string | null;
  // Whether this asset is numbered at all. Unset means yes, which is what
  // every asset was before the flag existed. An unnumbered display equation
  // is set without a number and takes none from the sequence — so turning off
  // Eq. (5) makes what was (6) become (5), and nothing may cross-reference it.
  numbered?: boolean | null;
  // For diagram figures: the Mermaid source, rendered to an image at export.
  diagramSource?: string | null;
};

export type ReferenceLike = {
  id: string;
  createdAt?: string | null;
  orderIndex?: number | null;
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
  // Keep the numbers the source document used ("Eq. (11a)", "Table B1")
  // instead of renumbering continuously. An author re-exporting their own
  // submitted draft wants their numbering back, not ours.
  keepSourceNumbers?: boolean | null;
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
  // JSON section skeleton: [{ name, sectionType, placement, wordLimit? }] —
  // overrides the manuscript-type default when the journal shapes sections.
  sectionSkeleton?: string | null;
  keywordMinimum?: number | null;
  keywordMaximum?: number | null;
  requiredArtifacts?: string[] | null;
  submissionRequirements?: string | null;
  // Free text about the profile itself — where it came from, what it does and
  // does not carry. A column on the record since the seeds were written; the
  // type simply never declared it.
  notes?: string | null;
  lineNumbering?: boolean | null;
  pageNumbering?: boolean | null;
  sectionNumbering?: boolean | null;
  twoColumn?: boolean | null;
  frontMatterLayout?: string | null;
  // Arrangement of the title page itself (journal masthead vs thesis cover).
  titlePageTemplate?: string | null;
  fontFamily?: string | null;
  bodyFontSize?: number | null;
  titleFontSize?: number | null;
  headingFontSize?: number | null;
  subheadingFontSize?: number | null;
  headingColor?: string | null;
  lineSpacing?: number | null;
  abstractLineSpacing?: number | null;
  paragraphSpacingAfter?: number | null;
  // Points of first-line indent on body paragraphs. Thesis and APA body copy
  // indents instead of leaving a blank line between paragraphs.
  paragraphFirstLineIndent?: number | null;
  bodyAlignment?: string | null;
  affiliationAlignment?: string | null;
  affiliationNumberStyle?: string | null;
  affiliationLineSpacing?: number | null;
  affiliationSpacingAfter?: number | null;
  tableStyle?: string | null;
  tableFontSize?: number | null;
  tableLineSpacing?: number | null;
  // The name of the .docx a Word template came from, for the settings UI.
  referenceDocUrl?: string | null;
  // `word/styles.xml` lifted out of that .docx — the DOCX exporter's style
  // base when present, so the author's own template governs the output. Set
  // per manuscript (an export-style override), never stored on the journal:
  // it is tens of kilobytes and has no business being a database index key.
  referenceDocStyles?: string | null;
};

export type NumberedFigure = FigureLike & {
  // "1", "2", "S1" — includes the supplement prefix.
  number: string;
  // "Figure 1", "Table S1" — the rendered caption label.
  label: string;
  // How an in-text cross-reference to this asset renders (per crossRefFormat).
  crossRefLabel: string;
};
