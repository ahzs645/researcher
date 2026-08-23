import {
  DOCXExporter,
  docxDefaultSchemaMappings,
} from '@blocknote/xl-docx-exporter';
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import {
  AlignmentType,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LineNumberRestartFormat,
  LineRuleType,
  Math as DocxMath,
  PageNumber,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from 'docx';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
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

const manuscriptTextRuns = (
  text: string,
  styles: InlineTextStyles,
  forceItalics: boolean,
  hyperlink = false,
): TextRun[] =>
  manuscriptScriptSegments(text).map(
    (segment) =>
      new TextRun({
        text: segment.text,
        bold: styles.bold === true,
        italics: forceItalics || styles.italic === true,
        underline: styles.underline === true ? {} : undefined,
        strike: styles.strike === true,
        style: hyperlink ? 'Hyperlink' : undefined,
        superScript: segment.position === 'SUPERSCRIPT',
        subScript: segment.position === 'SUBSCRIPT',
      }),
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
      const mappedImage = await docxDefaultSchemaMappings.blockMapping.image(
        typeof caption === 'string' && hasManuscriptScripts(caption)
          ? {
              ...block,
              props: {
                ...block.props,
                caption: stripManuscriptScriptMarkers(caption),
              },
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
          children: manuscriptScriptSegments(caption).map(
            (segment) =>
              new TextRun({
                text: segment.text,
                font: fontFamily,
                size: figureCaptionFontSize * 2,
                italics: true,
                superScript: segment.position === 'SUPERSCRIPT',
                subScript: segment.position === 'SUBSCRIPT',
              }),
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
        children: hasManuscriptScripts(text)
          ? manuscriptScriptSegments(text).map(
              (segment) =>
                new TextRun({
                  text: segment.text,
                  superScript: segment.position === 'SUPERSCRIPT',
                  subScript: segment.position === 'SUBSCRIPT',
                }),
            )
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
                new TextRun({ children: [new Tab()], text: label.trim() }),
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
        ? manuscriptScriptSegments(equation).map(
            (segment) =>
              new TextRun({
                text: segment.text,
                font: fontFamily,
                size: figureCaptionFontSize * 2,
                italics: true,
                superScript: segment.position === 'SUPERSCRIPT',
                subScript: segment.position === 'SUBSCRIPT',
              }),
          )
        : hasManuscriptScripts(equation)
          ? block.content.flatMap((content) => {
              const text = inlineContentText(content);
              if (!hasManuscriptScripts(text)) {
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

export const exportManuscriptToDocxBlob = async (
  bundle: ManuscriptBundle,
): Promise<Blob> => {
  const formattedBundle = await prepareManuscriptBundleWithCsl(bundle);
  // Diagrams are Mermaid source until export; Word embeds the raster.
  bundle = await fitManuscriptFigureImages(
    await prepareManuscriptDiagramImages(formattedBundle),
  );
  const { editor, blocks } = buildBlockNoteDocument(bundle);
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
