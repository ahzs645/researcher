import {
  DOCXExporter,
  docxDefaultSchemaMappings,
} from '@blocknote/xl-docx-exporter';
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import {
  AlignmentType,
  Bookmark,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  HeadingLevel,
  LineNumberRestartFormat,
  LineRuleType,
  Math as DocxMath,
  PageNumber,
  Paragraph,
  SimpleField,
  Tab,
  TabStopType,
  TextRun,
} from 'docx';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import { type NumberedFigure } from './manuscriptTypes';
import {
  buildBlockNoteDocument,
  EQUATION_LABEL_SEPARATOR,
} from './manuscriptBlocks';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { prepareManuscriptDiagramImages } from './manuscriptDiagram';
import { fitManuscriptFigureImages } from './manuscriptFigureFit';
import { isManuscriptDocxStylesXml } from './manuscriptDocxTemplate';
import { manuscriptAuthorLineSegments } from './manuscriptContributors';
import { latexToMathComponents } from './manuscriptDocxMath';
import {
  assetBookmarkId,
  assetSequenceName,
  readAssetNumberAnchor,
  splitAssetNumber,
  stripAssetNumberAnchors,
} from './manuscriptAssetAnchors';
import {
  hasCrossReferenceAnchors,
  splitCrossReferenceAnchors,
} from './manuscriptCrossReference';
import {
  hasManuscriptFootnotes,
  numberManuscriptFootnotes,
  splitManuscriptFootnotes,
  stripManuscriptFootnotes,
  type ManuscriptFootnote,
} from './manuscriptFootnotes';
import { hasInlineMath, splitInlineMath } from './manuscriptInlineMath';
import {
  createManuscriptTableMapping,
  type ManuscriptTableStyle,
} from './manuscriptDocxTable';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import { isImageDataUrl } from './manuscriptImages';
import {
  hasManuscriptScripts,
  manuscriptScriptSegments,
  stripManuscriptScriptMarkers,
} from './manuscriptScripts';

// DOCX export via BlockNote's official docx exporter. Shares the block builder
// with the PDF exporter, so figures (embedded images) and tables (real Word
// tables) render identically across both. Fully client-side, no backend.

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type ManuscriptDocxMappingOptions = {
  bodyLineSpacing: number;
  abstractLineSpacing: number;
  paragraphSpacingAfter: number;
  paragraphFirstLineIndent: number;
  affiliationLineSpacing: number;
  affiliationSpacingAfter: number;
  tableStyle: ManuscriptTableStyle;
  fontFamily: string;
  tableFontSize: number;
  tableLineSpacing: number;
  figureCaptionFontSize: number;
  figureCaptionLineSpacing: number;
  figureCaptionGap: number;
  figureCaptionSpacingAfter: number;
  findAsset: ManuscriptAssetLookup;
};

const inlineContentText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(inlineContentText).join('');
  if (typeof value !== 'object' || value === null) return '';
  if ('text' in value && typeof value.text === 'string') return value.text;
  return 'content' in value ? inlineContentText(value.content) : '';
};

type InlineTextStyles = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
};

type ManuscriptTextInlineContent = {
  type: 'text';
  text: string;
  styles: InlineTextStyles;
};

type ManuscriptLinkInlineContent = {
  type: 'link';
  href: string;
  content: ManuscriptTextInlineContent[];
};

const isTextInlineContent = (
  value: unknown,
): value is ManuscriptTextInlineContent =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  value.type === 'text' &&
  'text' in value &&
  typeof value.text === 'string' &&
  'styles' in value &&
  typeof value.styles === 'object' &&
  value.styles !== null;

const isLinkInlineContent = (
  value: unknown,
): value is ManuscriptLinkInlineContent =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  value.type === 'link' &&
  'href' in value &&
  typeof value.href === 'string' &&
  'content' in value &&
  Array.isArray(value.content) &&
  value.content.every(isTextInlineContent);

type ManuscriptRunOptions = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  hyperlink?: boolean;
  font?: string;
  size?: number;
};

const scriptRuns = (text: string, options: ManuscriptRunOptions): TextRun[] =>
  manuscriptScriptSegments(text).map(
    (segment) =>
      new TextRun({
        text: segment.text,
        bold: options.bold === true,
        italics: options.italics === true,
        underline: options.underline === true ? {} : undefined,
        strike: options.strike === true,
        style: options.hyperlink === true ? 'Hyperlink' : undefined,
        ...(options.font !== undefined ? { font: options.font } : {}),
        ...(options.size !== undefined ? { size: options.size } : {}),
        superScript: segment.position === 'SUPERSCRIPT',
        subScript: segment.position === 'SUBSCRIPT',
      }),
  );

type ManuscriptParagraphChild =
  | TextRun
  | DocxMath
  | Bookmark
  | SimpleField
  | FootnoteReferenceRun;

// A footnote is a real Word footnote: the run in the body is only the
// reference mark, and the note itself is written into `word/footnotes.xml`
// under the same id by `documentOptions.footnotes`. Word then draws it at the
// foot of whatever page the mark lands on and renumbers it when the text
// moves — which is the whole point of handing the author back their own
// document rather than an approximation of it.
const footnoteRuns = (
  number: number | undefined,
  text: string,
  options: ManuscriptRunOptions,
): ManuscriptParagraphChild[] =>
  number === undefined
    ? // Never numbered, so there is no note part to point at. Print it in the
      // sentence instead of losing it.
      scriptRuns(` (${text})`, options)
    : [new FootnoteReferenceRun(number)];

// Prose runs, with `$C_j$` becoming a real Word equation rather than three
// literal characters and a baseline letter. Word sets an inline OMath run on
// the text line, so the symbol in the sentence matches the display equation
// that defines it.
const mathAndScriptRuns = (
  text: string,
  options: ManuscriptRunOptions,
): ManuscriptParagraphChild[] =>
  splitManuscriptFootnotes(text).flatMap((footnoteSegment) =>
    footnoteSegment.kind === 'footnote'
      ? footnoteRuns(footnoteSegment.number, footnoteSegment.text, options)
      : splitInlineMath(footnoteSegment.value).flatMap((segment) =>
          segment.kind === 'math'
            ? [new DocxMath({ children: latexToMathComponents(segment.latex) })]
            : scriptRuns(segment.value, options),
        ),
  );

// Where an asset's number is printed: a Word SEQ field inside a bookmark. The
// number Word calculates is cached in the field, so the document reads
// correctly before anyone updates it, and every reference to it below can
// point at the bookmark instead of repeating today's digits.
const assetNumberRuns = (
  printed: string,
  asset: NumberedFigure,
  options: ManuscriptRunOptions,
): ManuscriptParagraphChild[] => {
  const number = (asset.number ?? '').trim();
  const at = number.length === 0 ? -1 : printed.indexOf(number);
  if (at === -1) return mathAndScriptRuns(printed, options);
  const { prefix, counted } = splitAssetNumber(number);
  const sequence = assetSequenceName(asset.assetKind, asset.placement);
  return [
    ...mathAndScriptRuns(printed.slice(0, at), options),
    new Bookmark({
      id: assetBookmarkId(asset.refKey ?? asset.id),
      children:
        counted === undefined
          ? scriptRuns(number, options)
          : [
              ...(prefix.length > 0 ? scriptRuns(prefix, options) : []),
              new SimpleField(`SEQ ${sequence} \\* ARABIC`, counted),
            ],
    }),
    ...mathAndScriptRuns(printed.slice(at + number.length), options),
  ];
};

// Where the prose names an asset's number: a REF field pointing at that
// bookmark, so moving an equation renumbers the sentence that refers to it.
// Only the number is a field — the journal's own wording around it ("Eq.",
// "Fig.") is the author's text and stays text.
const crossReferenceRuns = (
  label: string,
  asset: NumberedFigure | undefined,
  options: ManuscriptRunOptions,
): ManuscriptParagraphChild[] => {
  const number = (asset?.number ?? '').trim();
  const at =
    asset === undefined || number.length === 0 ? -1 : label.indexOf(number);
  if (asset === undefined || at === -1)
    return mathAndScriptRuns(label, options);
  const bookmark = assetBookmarkId(asset.refKey ?? asset.id);
  return [
    ...mathAndScriptRuns(label.slice(0, at), options),
    new SimpleField(`REF ${bookmark} \\h`, number),
    ...mathAndScriptRuns(label.slice(at + number.length), options),
  ];
};

type ManuscriptAssetLookup = (refKey: string) => NumberedFigure | undefined;

// Every asset whose number is actually printed somewhere in the document, read
// back off the built blocks — including an image block, whose caption is a
// prop rather than content.
const collectAnchoredRefKeys = (blocks: unknown[]): Set<string> => {
  const keys = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      const { refKey } = readAssetNumberAnchor(value);
      if (refKey !== undefined) keys.add(refKey.trim().toLowerCase());
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const record = value as Record<string, unknown>;
    visit(record.content);
    visit(record.children);
    if (typeof record.props === 'object' && record.props !== null) {
      visit((record.props as Record<string, unknown>).caption);
    }
    if ('text' in record) visit(record.text);
  };
  visit(blocks);
  return keys;
};

// Whether a run needs our own builder rather than BlockNote's: it carries a
// script sentinel, inline maths, or one of the numbering anchors — none of
// which may reach the page as characters.
const needsManuscriptRuns = (text: string): boolean =>
  hasManuscriptScripts(text) ||
  hasInlineMath(text) ||
  hasCrossReferenceAnchors(text) ||
  hasManuscriptFootnotes(text) ||
  stripAssetNumberAnchors(text) !== text;

const manuscriptInlineRuns = (
  text: string,
  options: ManuscriptRunOptions,
  findAsset?: ManuscriptAssetLookup,
): ManuscriptParagraphChild[] => {
  const { refKey, text: printed } = readAssetNumberAnchor(text);
  const asset = refKey === undefined ? undefined : findAsset?.(refKey);
  if (asset !== undefined) return assetNumberRuns(printed, asset, options);
  return splitCrossReferenceAnchors(printed).flatMap((segment) =>
    segment.kind === 'reference'
      ? crossReferenceRuns(segment.label, findAsset?.(segment.refKey), options)
      : mathAndScriptRuns(segment.value, options),
  );
};

const manuscriptTextRuns = (
  text: string,
  styles: InlineTextStyles,
  forceItalics: boolean,
  hyperlink = false,
  findAsset?: ManuscriptAssetLookup,
): ManuscriptParagraphChild[] =>
  // A link's label is text, never an equation, so its dollars stay literal.
  hyperlink
    ? scriptRuns(text, {
        bold: styles.bold === true,
        italics: forceItalics || styles.italic === true,
        underline: styles.underline === true,
        strike: styles.strike === true,
        hyperlink: true,
      })
    : manuscriptInlineRuns(
        text,
        {
          bold: styles.bold === true,
          italics: forceItalics || styles.italic === true,
          underline: styles.underline === true,
          strike: styles.strike === true,
        },
        findAsset,
      );

const createManuscriptDocxMappings = ({
  bodyLineSpacing,
  abstractLineSpacing,
  paragraphSpacingAfter,
  paragraphFirstLineIndent,
  affiliationLineSpacing,
  affiliationSpacingAfter,
  tableStyle,
  fontFamily,
  tableFontSize,
  tableLineSpacing,
  figureCaptionFontSize,
  figureCaptionLineSpacing,
  figureCaptionGap,
  figureCaptionSpacingAfter,
  findAsset,
}: ManuscriptDocxMappingOptions): typeof docxDefaultSchemaMappings => ({
  ...docxDefaultSchemaMappings,
  blockMapping: {
    ...docxDefaultSchemaMappings.blockMapping,
    image: async (
      block,
      exporter,
      nestingLevel,
      numberedListIndex,
      children,
    ) => {
      const caption = block.props.caption;
      // BlockNote reads the caption as the image's description too, so it gets
      // the plain text — the markers are only for the caption paragraph below.
      const plainCaption =
        typeof caption === 'string'
          ? stripManuscriptFootnotes(
              stripAssetNumberAnchors(stripManuscriptScriptMarkers(caption)),
            )
          : caption;
      const mappedImage = await docxDefaultSchemaMappings.blockMapping.image(
        typeof caption === 'string' && caption !== plainCaption
          ? {
              ...block,
              props: { ...block.props, caption: plainCaption },
            }
          : block,
        exporter,
        nestingLevel,
        numberedListIndex,
        children,
      );
      if (
        typeof caption !== 'string' ||
        caption.length === 0 ||
        !Array.isArray(mappedImage)
      ) {
        return mappedImage;
      }
      return [
        ...mappedImage.slice(0, -1),
        new Paragraph({
          style: 'Caption',
          keepLines: true,
          spacing: {
            before: Math.round(figureCaptionGap * 20),
            after: Math.round(figureCaptionSpacingAfter * 20),
            line: Math.round(240 * figureCaptionLineSpacing),
            lineRule: LineRuleType.AUTO,
          },
          children: manuscriptInlineRuns(
            caption,
            {
              font: fontFamily,
              size: figureCaptionFontSize * 2,
              italics: true,
            },
            findAsset,
          ),
        }),
      ];
    },
    heading: (block, exporter) => {
      const text = block.content
        .map((content) =>
          'text' in content && typeof content.text === 'string'
            ? content.text
            : '',
        )
        .join('');
      const heading =
        block.props.level === 1
          ? HeadingLevel.HEADING_1
          : block.props.level === 2
            ? HeadingLevel.HEADING_2
            : block.props.level === 3
              ? HeadingLevel.HEADING_3
              : block.props.level === 4
                ? HeadingLevel.HEADING_4
                : block.props.level === 5
                  ? HeadingLevel.HEADING_5
                  : HeadingLevel.HEADING_6;
      return new Paragraph({
        heading,
        alignment:
          block.props.textAlignment === 'center'
            ? AlignmentType.CENTER
            : block.props.textAlignment === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT,
        children: needsManuscriptRuns(text)
          ? manuscriptInlineRuns(text, {}, findAsset)
          : exporter.transformInlineContent(block.content),
      });
    },
    paragraph: (block, exporter) => {
      const equation = inlineContentText(block.content).trim();
      if (block.props.textColor === 'equation') {
        // Numbered equations arrive as "latex<sep>(3)"; the label is pushed to
        // the right margin with a tab stop, the way journals set them.
        const [latex, label] = equation.split(EQUATION_LABEL_SEPARATOR);
        const hasLabel = label !== undefined && label.trim().length > 0;
        return new Paragraph({
          alignment: hasLabel ? AlignmentType.LEFT : AlignmentType.CENTER,
          ...(hasLabel
            ? {
                tabStops: [
                  { type: TabStopType.CENTER, position: 4680 },
                  { type: TabStopType.RIGHT, position: 9360 },
                ],
              }
            : {}),
          spacing: {
            before: 120,
            after: 120,
            line: 276,
            lineRule: LineRuleType.AUTO,
          },
          children: hasLabel
            ? [
                new TextRun({ children: [new Tab()] }),
                new DocxMath({ children: latexToMathComponents(latex) }),
                new TextRun({ children: [new Tab()] }),
                // The number is the definition Word counts from, so it is a
                // field in a bookmark rather than the digits we happen to
                // have printed today.
                ...manuscriptInlineRuns(label.trim(), {}, findAsset),
              ]
            : [new DocxMath({ children: latexToMathComponents(latex) })],
        });
      }
      if (block.props.textColor === 'author-line') {
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120, line: 240, lineRule: LineRuleType.AUTO },
          children: manuscriptAuthorLineSegments(equation).map(
            (segment) =>
              new TextRun({
                text: segment.text,
                bold: true,
                superScript: segment.superscript,
              }),
          ),
        });
      }
      const alignment =
        block.props.textAlignment === 'center'
          ? AlignmentType.CENTER
          : block.props.textAlignment === 'right'
            ? AlignmentType.RIGHT
            : block.props.textAlignment === 'justify'
              ? AlignmentType.JUSTIFIED
              : AlignmentType.LEFT;
      const isAbstract = block.props.textColor === 'abstract-body';
      const isTableCaption = block.props.textColor === 'table-caption';
      const isFigureCaption = block.props.textColor === 'figure-caption';
      const isAffiliation = block.props.textColor === 'affiliation-line';
      const lineSpacing = isAbstract
        ? abstractLineSpacing
        : isTableCaption
          ? tableLineSpacing
          : isFigureCaption
            ? figureCaptionLineSpacing
            : isAffiliation
              ? affiliationLineSpacing
              : // A cover page is laid out by counting lines, so a title-page
                // line is one line — not one line times the body's spacing.
                block.props.textColor === 'title-line'
                ? 1
                : bodyLineSpacing;
      const children = isFigureCaption
        ? manuscriptInlineRuns(
            equation,
            {
              font: fontFamily,
              size: figureCaptionFontSize * 2,
              italics: true,
            },
            findAsset,
          )
        : needsManuscriptRuns(equation)
          ? block.content.flatMap((content) => {
              const text = inlineContentText(content);
              if (!needsManuscriptRuns(text)) {
                return exporter.transformInlineContent([content]);
              }
              if (isLinkInlineContent(content)) {
                return [
                  new ExternalHyperlink({
                    link: content.href,
                    children: content.content.flatMap((linkedContent) =>
                      manuscriptTextRuns(
                        linkedContent.text,
                        linkedContent.styles,
                        isAffiliation,
                        true,
                      ),
                    ),
                  }),
                ];
              }
              return isTextInlineContent(content)
                ? manuscriptTextRuns(
                    content.text,
                    content.styles,
                    isAffiliation,
                    false,
                    findAsset,
                  )
                : exporter.transformInlineContent([content]);
            })
          : exporter.transformInlineContent(block.content);
      // Body copy only: an indented caption, abstract or affiliation line reads
      // as a mistake, and the equation and author-line paragraphs returned
      // above never reach here.
      const isBodyProse =
        !isAbstract &&
        !isTableCaption &&
        !isFigureCaption &&
        !isAffiliation &&
        block.props.textColor !== 'title-line';
      return new Paragraph({
        alignment,
        ...(isBodyProse && paragraphFirstLineIndent > 0
          ? { indent: { firstLine: Math.round(paragraphFirstLineIndent * 20) } }
          : {}),
        spacing: {
          after: isTableCaption
            ? 0
            : isFigureCaption
              ? Math.round(figureCaptionGap * 20)
              : Math.round(
                  (isAffiliation
                    ? affiliationSpacingAfter
                    : paragraphSpacingAfter) * 20,
                ),
          line: Math.round(240 * lineSpacing),
          lineRule: LineRuleType.AUTO,
        },
        children,
      });
    },
    table: createManuscriptTableMapping(
      tableStyle,
      fontFamily,
      tableFontSize,
      tableLineSpacing,
    ),
  },
});

// `word/footnotes.xml`, keyed by the number the export walk gave each note —
// which is the id Word's reference marks point at. docx writes the separator
// notes (ids -1 and 0) itself and adds the reference mark to the front of the
// first paragraph, so a note is exactly its own prose.
//
// Notes are set two points smaller than the body, the convention every journal
// template follows.
const docxFootnoteParts = (
  footnotes: readonly ManuscriptFootnote[],
  fontFamily: string,
  bodyFontSize: number,
): Record<string, { children: Paragraph[] }> =>
  Object.fromEntries(
    footnotes.map((footnote) => [
      String(footnote.number),
      {
        children: [
          new Paragraph({
            style: 'FootnoteText',
            children: mathAndScriptRuns(` ${footnote.text}`, {
              font: fontFamily,
              size: Math.max(8, bodyFontSize - 2) * 2,
            }),
          }),
        ],
      },
    ]),
  );

export const exportManuscriptToDocxBlob = async (
  bundle: ManuscriptBundle,
): Promise<Blob> => {
  const formattedBundle = await prepareManuscriptBundleWithCsl(bundle, {
    // Word can keep its own numbering, but only if it is told which asset each
    // printed number and each in-text reference belongs to.
    crossReferenceAnchors: true,
  });
  // Diagrams are Mermaid source until export; Word embeds the raster.
  const drawnBundle = await fitManuscriptFigureImages(
    await prepareManuscriptDiagramImages(formattedBundle),
  );
  // Numbered before the blocks are built, and before the document options are
  // read: BlockNote spreads `documentOptions` into the `Document` constructor
  // and only then transforms the blocks, so a note collected while mapping a
  // paragraph would arrive too late to be written into the package.
  const { bundle: numberedBundle, footnotes } =
    numberManuscriptFootnotes(drawnBundle);
  bundle = numberedBundle;
  const assetsByRefKey = new Map(
    bundle.numberedFigures.map((figure) => [
      (figure.refKey ?? figure.id).trim().toLowerCase(),
      figure,
    ]),
  );
  const { editor, blocks } = buildBlockNoteDocument(bundle);
  // A REF field pointing at a bookmark that was never written reads as
  // "Error! Reference source not found" in Word. Only the assets whose number
  // actually appears in the document can be pointed at — an equation with no
  // body, say, is never printed and so is never a target.
  const bookmarkedRefKeys = collectAnchoredRefKeys(blocks);
  const findAsset: ManuscriptAssetLookup = (refKey) => {
    const key = refKey.trim().toLowerCase();
    return bookmarkedRefKeys.has(key) ? assetsByRefKey.get(key) : undefined;
  };
  const fontFamily = bundle.style.fontFamily?.trim() || 'Times New Roman';
  const bodyFontSize = bundle.style.bodyFontSize ?? 12;
  const titleFontSize = bundle.style.titleFontSize ?? 16;
  const headingFontSize = bundle.style.headingFontSize ?? 12;
  const subheadingFontSize =
    bundle.style.subheadingFontSize ?? bundle.style.bodyFontSize ?? 12;
  const requestedHeadingColor =
    bundle.style.headingColor === 'ADDIS_BLUE'
      ? '0F4761'
      : bundle.style.headingColor === 'BLACK'
        ? '000000'
        : bundle.style.headingColor?.replace(/^#/, '');
  const headingColor =
    requestedHeadingColor !== undefined &&
    /^[\dA-F]{6}$/i.test(requestedHeadingColor)
      ? requestedHeadingColor.toUpperCase()
      : '000000';
  const lineSpacing = Math.max(1, bundle.style.lineSpacing ?? 1.5);
  const abstractLineSpacing = Math.max(
    1,
    bundle.style.abstractLineSpacing ?? 1.15,
  );
  const paragraphSpacingAfter = Math.max(
    0,
    bundle.style.paragraphSpacingAfter ?? 0,
  );
  const paragraphFirstLineIndent = Math.max(
    0,
    bundle.style.paragraphFirstLineIndent ?? 0,
  );
  const affiliationLineSpacing = Math.max(
    1,
    bundle.style.affiliationLineSpacing ?? 1,
  );
  const affiliationSpacingAfter = Math.max(
    0,
    bundle.style.affiliationSpacingAfter ?? 0,
  );
  const tableStyle = (bundle.style.tableStyle ??
    'ACADEMIC') as ManuscriptTableStyle;
  const tableFontSize = Math.max(8, bundle.style.tableFontSize ?? bodyFontSize);
  const tableLineSpacing = Math.max(1, bundle.style.tableLineSpacing ?? 1);
  const figureCaptionFontSize = Math.max(
    8,
    bundle.style.figureCaptionFontSize ?? Math.max(8, bodyFontSize - 2),
  );
  const figureCaptionLineSpacing = Math.max(
    1,
    bundle.style.figureCaptionLineSpacing ?? 1,
  );
  const figureCaptionGap = Math.max(0, bundle.style.figureCaptionGap ?? 3);
  const figureCaptionSpacingAfter = Math.max(
    0,
    bundle.style.figureCaptionSpacingAfter ?? 6,
  );
  const exporter = new DOCXExporter(
    editor.schema,
    createManuscriptDocxMappings({
      bodyLineSpacing: lineSpacing,
      abstractLineSpacing,
      paragraphSpacingAfter,
      paragraphFirstLineIndent,
      affiliationLineSpacing,
      affiliationSpacingAfter,
      tableStyle,
      fontFamily,
      tableFontSize,
      tableLineSpacing,
      figureCaptionFontSize,
      figureCaptionLineSpacing,
      figureCaptionGap,
      figureCaptionSpacingAfter,
      findAsset,
    }),
  );
  const resolveExternalFile = exporter.options.resolveFileUrl;
  exporter.options.resolveFileUrl = async (url) =>
    isImageDataUrl(url)
      ? (await fetch(url)).blob()
      : (resolveExternalFile?.(url) ?? url);
  const bodyAlignment =
    bundle.style.bodyAlignment === 'JUSTIFIED'
      ? AlignmentType.JUSTIFIED
      : AlignmentType.LEFT;
  // When the author supplied their own .docx, its styles.xml is the style
  // authority: passing it as `externalStyles` (and dropping the generated
  // style set, which would otherwise sit in front of it) is what makes the
  // export come out looking like their template.
  const templateStyles = bundle.style.referenceDocStyles;
  const usesTemplate = isManuscriptDocxStylesXml(templateStyles);

  return exporter.toBlob(blocks, {
    documentOptions: {
      creator: bundle.metadata.authors,
      title: bundle.metadata.title,
      subject: bundle.metadata.journal,
      ...(footnotes.length > 0
        ? {
            footnotes: docxFootnoteParts(footnotes, fontFamily, bodyFontSize),
          }
        : {}),
      // Replace BlockNote's Inter-based template instead of appending duplicate
      // Heading/Normal definitions. The journal profile is the style authority
      // unless the author supplied a Word template.
      externalStyles: usesTemplate ? templateStyles : undefined,
      styles: usesTemplate
        ? undefined
        : {
            default: {
              document: {
                run: {
                  font: fontFamily,
                  size: bodyFontSize * 2,
                },
                paragraph: {
                  alignment: bodyAlignment,
                  spacing: {
                    after: Math.round(paragraphSpacingAfter * 20),
                    line: Math.round(240 * lineSpacing),
                    lineRule: LineRuleType.AUTO,
                  },
                },
              },
              heading1: {
                run: {
                  font: fontFamily,
                  size: titleFontSize * 2,
                  bold: true,
                  color: '000000',
                },
                paragraph: {
                  alignment: AlignmentType.CENTER,
                  keepNext: true,
                  spacing: { before: 240, after: 240, line: 280 },
                },
              },
              heading2: {
                run: {
                  font: fontFamily,
                  size: headingFontSize * 2,
                  bold: true,
                  color: headingColor,
                },
                paragraph: {
                  alignment: AlignmentType.LEFT,
                  keepNext: true,
                  spacing: { before: 240, after: 120, line: 280 },
                },
              },
              heading3: {
                run: {
                  font: fontFamily,
                  size: subheadingFontSize * 2,
                  bold: true,
                  color: headingColor,
                },
                paragraph: {
                  alignment: AlignmentType.LEFT,
                  keepNext: true,
                  spacing: { before: 160, after: 80, line: 280 },
                },
              },
            },
          },
    },
    sectionOptions: {
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
        ...(bundle.style.lineNumbering === true
          ? {
              lineNumbers: {
                countBy: 1,
                restart: LineNumberRestartFormat.CONTINUOUS,
              },
            }
          : {}),
        ...(bundle.style.twoColumn === true
          ? { column: { count: 2, equalWidth: true, space: 720 } }
          : {}),
      },
      ...(bundle.style.pageNumbering === true
        ? {
            footers: {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ children: [PageNumber.CURRENT] })],
                  }),
                ],
              }),
            },
          }
        : {}),
    },
  });
};

export const exportStandaloneMarkdownToDocxBlob = async (
  title: string,
  markdown: string,
): Promise<Blob> => {
  const editor = BlockNoteEditor.create();
  const partialBlocks: PartialBlock[] = [
    { type: 'heading', props: { level: 1 }, content: title },
    ...editor.tryParseMarkdownToBlocks(markdown),
  ];
  editor.replaceBlocks(editor.document, partialBlocks);
  const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
  return exporter.toBlob(editor.document);
};

export const blocknoteDocxExporter: ManuscriptExporter = {
  id: 'blocknote-docx',
  label: 'Word (.docx)',
  formats: ['DOCX'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> => [
    {
      filename: `${slugifyTitle(bundle.metadata.title)}.docx`,
      mimeType: DOCX_MIME,
      content: await exportManuscriptToDocxBlob(bundle),
    },
  ],
};
