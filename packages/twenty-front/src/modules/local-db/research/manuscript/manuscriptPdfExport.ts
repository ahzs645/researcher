import {
  PDFExporter,
  pdfDefaultSchemaMappings,
} from '@blocknote/xl-pdf-exporter';
import { pdf, Text } from '@react-pdf/renderer';
import {
  cloneElement,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import {
  buildBlockNoteDocument,
  EQUATION_LABEL_SEPARATOR,
} from './manuscriptBlocks';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { prepareManuscriptDiagramImages } from './manuscriptDiagram';
import { fitManuscriptFigureImages } from './manuscriptFigureFit';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import { isImageDataUrl } from './manuscriptImages';
import { latexToScriptedText } from './manuscriptMathText';
import { stripAssetNumberAnchors } from './manuscriptAssetAnchors';
import { stripCrossReferenceAnchors } from './manuscriptCrossReference';
import { hasInlineMath, linearizeInlineMath } from './manuscriptInlineMath';
import {
  A4_HEIGHT_POINTS,
  PRINTABLE_WIDTH_POINTS,
  PX_TO_POINTS,
} from './manuscriptPageMetrics';
import { createManuscriptPdfTableMapping } from './manuscriptPdfTable';
import { resolveManuscriptTableStyle } from './manuscriptTableStyleOptions';
import {
  hasManuscriptScripts,
  manuscriptScriptSegments,
} from './manuscriptScripts';

// PDF export from the *same* BlockNote block model the DOCX exporter builds —
// BlockNote's PDF exporter renders blocks to a react-pdf document, which
// react-pdf then turns into a PDF Blob. No DOCX round-trip and no LaTeX/Typst
// toolchain. Fully client-side: figures embed and tables render as real tables,
// identical to the Word output.

export const exportManuscriptToPdfBlob = async (
  bundle: ManuscriptBundle,
): Promise<Blob> => {
  bundle = await fitManuscriptFigureImages(
    await prepareManuscriptDiagramImages(
      await prepareManuscriptBundleWithCsl(bundle),
    ),
  );
  const { editor, blocks } = buildBlockNoteDocument(bundle);
  // Times-Roman is one of PDF's built-in fonts, and built-in means WinAnsi:
  // no ≤, no ≥, no ∑, none of the Unicode sub- and superscripts the equation
  // linearizer emits. Those characters came out as overlapping garbage.
  // react-pdf takes a font *stack* and substitutes per glyph, so Times sets the
  // prose and Inter — which BlockNote embeds, and which covers all of the above
  // — draws whatever Times cannot.
  const fontFamily = /times/i.test(bundle.style.fontFamily ?? '')
    ? ['Times-Roman', 'Inter']
    : ['Inter'];
  const bodyLineSpacing = Math.max(1, bundle.style.lineSpacing ?? 1.5);
  const abstractLineSpacing = Math.max(
    1,
    bundle.style.abstractLineSpacing ?? bodyLineSpacing,
  );
  type PdfTextElement = Awaited<
    ReturnType<(typeof pdfDefaultSchemaMappings.blockMapping)['paragraph']>
  >;
  // react-pdf cannot typeset math, so equation paragraphs (LaTeX source plus
  // the invisible label separator) go through the Unicode linearizer — the
  // same readable fallback, instead of printing raw LaTeX.
  const plainText = (content: unknown): string => {
    if (!Array.isArray(content)) return '';
    return content
      .map((inline) => {
        if (typeof inline !== 'object' || inline === null) return '';
        const record = inline as {
          type?: string;
          text?: string;
          content?: unknown;
        };
        if (record.type === 'text') return record.text ?? '';
        return plainText(record.content);
      })
      .join('');
  };
  const equationChildren = (block: {
    content?: unknown;
  }): { equation: string; label?: string } => {
    const [latex, label] = plainText(block.content).split(
      EQUATION_LABEL_SEPARATOR,
    );
    return {
      equation: latexToScriptedText(latex ?? ''),
      ...(label !== undefined && label.trim().length > 0
        ? { label: stripAssetNumberAnchors(label).trim() }
        : {}),
    };
  };
  // Points of first-line indent, on body prose only — the abstract, captions
  // and the author block are all tagged paragraphs and stay flush.
  const firstLineIndent = Math.max(
    0,
    bundle.style.paragraphFirstLineIndent ?? 0,
  );
  const BLOCK_PARAGRAPH_TAGS = [
    'abstract-body',
    'affiliation-line',
    'author-line',
    'equation',
    'figure-caption',
    'table-caption',
    'title-line',
  ];
  // react-pdf takes the line indent from the first *fragment* of the paragraph,
  // and a paragraph built from inline runs has its own nested Text there — so
  // the indent has to ride on that run, not only on the paragraph around it.
  // …and a run can itself be a wrapper — a superscript-bearing word is a Text
  // of Texts — so the indent follows the first child all the way down.
  const indentFirstRun = (node: ReactNode): ReactNode => {
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<{
      children?: ReactNode;
      style?: Record<string, unknown>;
    }>;
    const children = element.props.children;
    const runs = Array.isArray(children) ? children : [children];
    const style = { ...element.props.style, textIndent: firstLineIndent };
    return isValidElement(runs[0])
      ? cloneElement(
          element,
          { style },
          indentFirstRun(runs[0]),
          ...runs.slice(1),
        )
      : cloneElement(element, { style });
  };
  const withFirstLineIndent = (runs: ReactNode[]): ReactNode[] =>
    isValidElement(runs[0])
      ? [indentFirstRun(runs[0]), ...runs.slice(1)]
      : runs;
  const paragraphMapping: (typeof pdfDefaultSchemaMappings.blockMapping)['paragraph'] =
    (block, exporter) => {
      const indent =
        firstLineIndent > 0 &&
        !BLOCK_PARAGRAPH_TAGS.includes(block.props.textColor);
      const children =
        block.props.textColor === 'equation'
          ? (() => {
              const { equation, label } = equationChildren(block);
              const text =
                label !== undefined ? `${equation}    ${label}` : equation;
              return scriptRuns(text, bundle.style.bodyFontSize ?? 12);
            })()
          : (() => {
              const runs = exporter.transformInlineContent(block.content);
              return indent ? withFirstLineIndent(runs) : runs;
            })();
      // The exporter declares ReactElement<Text> instead of TextProps. The
      // runtime component is correct; bridge the upstream generic mismatch.
      return createElement(Text, {
        key: `paragraph${block.id}`,
        style: {
          lineHeight:
            block.props.textColor === 'abstract-body'
              ? abstractLineSpacing
              : // A cover page is laid out by counting lines, so a title-page
                // line is one line — not one line times the body's spacing.
                block.props.textColor === 'title-line'
                ? 1
                : bodyLineSpacing,
          ...(indent ? { textIndent: firstLineIndent } : {}),
          textAlign:
            block.props.textAlignment === 'justify'
              ? 'justify'
              : block.props.textAlignment,
        },
        children,
      }) as unknown as PdfTextElement;
    };
  const headingMapping: (typeof pdfDefaultSchemaMappings.blockMapping)['heading'] =
    (block, exporter) =>
      createElement(Text, {
        key: `heading${block.id}`,
        style: {
          fontSize:
            block.props.level === 1
              ? (bundle.style.titleFontSize ?? 16)
              : (bundle.style.headingFontSize ?? 12),
          fontWeight: 700,
          lineHeight: 1.25,
          textAlign:
            block.props.textAlignment === 'justify'
              ? 'justify'
              : block.props.textAlignment,
        },
        children: exporter.transformInlineContent(block.content),
      }) as unknown as PdfTextElement;
  // Sub- and superscript runs, from the importer's sentinels or the equation
  // linearizer's. react-pdf can shift a run; Unicode cannot supply a subscript
  // "d" or "f", which is what left `C_d` reading as literal LaTeX.
  const scriptRuns = (text: string, baseFontSize: number): ReactNode[] =>
    manuscriptScriptSegments(text).map((segment, index) =>
      createElement(
        Text,
        {
          key: `script-${index}`,
          style:
            segment.position === 'BASELINE'
              ? {}
              : {
                  fontSize: Math.round(baseFontSize * 0.75),
                  verticalAlign:
                    segment.position === 'SUPERSCRIPT' ? 'super' : 'sub',
                },
        },
        segment.text,
      ),
    );
  // BlockNote's DOCX mapper reads a column width as CSS pixels and converts it
  // (×0.75 to points, ×20 to twips); its PDF mapper hands the same number to
  // react-pdf as points, so a full-width table came out a third too wide and
  // its last column wrapped on top of the first. Convert here, and clamp so a
  // table can never be wider than the page it is drawn on.
  const tableColumnWidths = (widths: (number | undefined)[]): number[] => {
    const resolved = widths.map((width) => width ?? 120);
    const total = resolved.reduce((sum, width) => sum + width, 0);
    const scale =
      total > 0
        ? Math.min(PX_TO_POINTS, PRINTABLE_WIDTH_POINTS / total)
        : PX_TO_POINTS;
    return resolved.map((width) => Math.floor(width * scale));
  };
  const tableMapping = createManuscriptPdfTableMapping({
    tableStyle: resolveManuscriptTableStyle(bundle.style.tableStyle),
    fontFamily,
    tableFontSize: Math.max(
      8,
      bundle.style.tableFontSize ?? (bundle.style.bodyFontSize ?? 12) - 2,
    ),
    tableLineSpacing: Math.max(1, bundle.style.tableLineSpacing ?? 1),
    columnWidths: tableColumnWidths,
    renderText: scriptRuns,
  }) as (typeof pdfDefaultSchemaMappings.blockMapping)['table'];
  const exporter = new PDFExporter(editor.schema, {
    ...pdfDefaultSchemaMappings,
    blockMapping: {
      ...pdfDefaultSchemaMappings.blockMapping,
      paragraph: paragraphMapping,
      heading: headingMapping,
      table: tableMapping,
    },
  });
  // BlockNote resolves every file through its hosted CORS proxy, data URLs
  // included — which sends the author's figures to a third party and fails
  // outright with no network. An embedded image is already here: read it.
  const resolveExternalFile = exporter.options.resolveFileUrl;
  exporter.options.resolveFileUrl = async (url) =>
    isImageDataUrl(url)
      ? (await fetch(url)).blob()
      : (resolveExternalFile?.(url) ?? url);
  // The importer marks a run like "PM2.5" or "mg/m3" with invisible sentinels
  // so every exporter can raise or lower it. Word reads them; react-pdf never
  // did, so the sentinels printed as stray glyphs. Split the run and let
  // react-pdf shift the pieces.
  const transformStyledText = exporter.transformStyledText.bind(exporter);
  exporter.transformStyledText = (styledText) => {
    // `$C_j$` in a sentence is maths. react-pdf cannot typeset it, so it is
    // linearized to the same scripted form a display equation gets rather
    // than printed with its delimiters.
    // The numbering anchors are the DOCX export's, marking which asset each
    // printed number belongs to. react-pdf draws text: it prints the number.
    const plain = stripAssetNumberAnchors(
      stripCrossReferenceAnchors(styledText.text),
    );
    const text = hasInlineMath(plain) ? linearizeInlineMath(plain) : plain;
    if (!hasManuscriptScripts(text)) {
      return transformStyledText({ ...styledText, text });
    }
    const base = transformStyledText({ ...styledText, text: '' });
    return cloneElement(
      base,
      {},
      ...scriptRuns(text, bundle.style.bodyFontSize ?? 12),
    );
  };
  exporter.styles.page = {
    ...exporter.styles.page,
    paddingTop: 72,
    paddingBottom: 72,
    paddingHorizontal: 72,
    fontFamily,
    fontSize: bundle.style.bodyFontSize ?? 12,
    lineHeight: bodyLineSpacing,
    // BlockNote types this as a single family name; react-pdf has always taken
    // a stack, and the stack is what makes glyph substitution possible.
  } as unknown as (typeof exporter.styles)['page'];
  // Page numbers deliberately bypass BlockNote's `footer` option, which nests
  // the number inside its own fixed container. react-pdf re-renders a `render`
  // node on every page and resets its measured height first; nested one level
  // down, that height never comes back — the number silently draws nothing, and
  // on a long document the container's `bottom`-derived offset runs away to a
  // coordinate PDF cannot write ("unsupported number: -2.4e+22"). The number has
  // to be the fixed, absolutely positioned node itself, and anchored from the
  // top: `bottom` is resolved from the height that resolution just cleared.
  const document = await exporter.toReactPDFDocument(blocks, {});
  if (bundle.style.pageNumbering !== true) return pdf(document).toBlob();

  const footerFontSize = 10;
  const pageNumber = createElement(Text, {
    fixed: true,
    render: ({ pageNumber: value }: { pageNumber: number }) => String(value),
    style: {
      fontFamily,
      fontSize: footerFontSize,
      left: 72,
      lineHeight: 1.2,
      position: 'absolute',
      right: 72,
      textAlign: 'center',
      top: A4_HEIGHT_POINTS - 36 - Math.ceil(footerFontSize * 1.2),
    },
  });
  const page = document.props.children as ReactElement<{ children?: unknown }>;
  const pageChildren = page.props.children;
  return pdf(
    cloneElement(
      document,
      {},
      cloneElement(
        page,
        {},
        ...(Array.isArray(pageChildren) ? pageChildren : [pageChildren]),
        pageNumber,
      ),
    ),
  ).toBlob();
};

export const blocknotePdfExporter: ManuscriptExporter = {
  id: 'blocknote-pdf',
  label: 'PDF',
  formats: ['PDF'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> => [
    {
      filename: `${slugifyTitle(bundle.metadata.title)}.pdf`,
      mimeType: 'application/pdf',
      content: await exportManuscriptToPdfBlob(bundle),
    },
  ],
};
