import {
  PDFExporter,
  pdfDefaultSchemaMappings,
} from '@blocknote/xl-pdf-exporter';
import { pdf, Text } from '@react-pdf/renderer';
import { cloneElement, createElement, type ReactElement } from 'react';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import {
  buildBlockNoteDocument,
  EQUATION_LABEL_SEPARATOR,
} from './manuscriptBlocks';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { prepareManuscriptDiagramImages } from './manuscriptDiagram';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import { isImageDataUrl } from './manuscriptImages';
import { latexToUnicodeText } from './manuscriptMathText';
import {
  hasManuscriptScripts,
  manuscriptScriptSegments,
} from './manuscriptScripts';

// PDF export from the *same* BlockNote block model the DOCX exporter builds —
// BlockNote's PDF exporter renders blocks to a react-pdf document, which
// react-pdf then turns into a PDF Blob. No DOCX round-trip and no LaTeX/Typst
// toolchain. Fully client-side: figures embed and tables render as real tables,
// identical to the Word output.

// A4 at 72 dpi, which is the page size BlockNote's PDF exporter fixes.
const A4_HEIGHT_POINTS = 841.89;

export const exportManuscriptToPdfBlob = async (
  bundle: ManuscriptBundle,
): Promise<Blob> => {
  bundle = await prepareManuscriptDiagramImages(
    await prepareManuscriptBundleWithCsl(bundle),
  );
  const { editor, blocks } = buildBlockNoteDocument(bundle);
  const fontFamily = /times/i.test(bundle.style.fontFamily ?? '')
    ? 'Times-Roman'
    : 'Inter';
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
      equation: latexToUnicodeText(latex ?? ''),
      ...(label !== undefined && label.trim().length > 0
        ? { label: label.trim() }
        : {}),
    };
  };
  const paragraphMapping: (typeof pdfDefaultSchemaMappings.blockMapping)['paragraph'] =
    (block, exporter) =>
      // The exporter declares ReactElement<Text> instead of TextProps. The
      // runtime component is correct; bridge the upstream generic mismatch.
      createElement(Text, {
        key: `paragraph${block.id}`,
        style: {
          lineHeight:
            block.props.textColor === 'abstract-body'
              ? abstractLineSpacing
              : bodyLineSpacing,
          textAlign:
            block.props.textAlignment === 'justify'
              ? 'justify'
              : block.props.textAlignment,
        },
        children:
          block.props.textColor === 'equation'
            ? (() => {
                const { equation, label } = equationChildren(block);
                return label !== undefined
                  ? `${equation}    ${label}`
                  : equation;
              })()
            : exporter.transformInlineContent(block.content),
      }) as unknown as PdfTextElement;
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
  const exporter = new PDFExporter(editor.schema, {
    ...pdfDefaultSchemaMappings,
    blockMapping: {
      ...pdfDefaultSchemaMappings.blockMapping,
      paragraph: paragraphMapping,
      heading: headingMapping,
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
    if (!hasManuscriptScripts(styledText.text)) {
      return transformStyledText(styledText);
    }
    const base = transformStyledText({ ...styledText, text: '' });
    const scriptSize = Math.round((bundle.style.bodyFontSize ?? 12) * 0.75);
    return cloneElement(
      base,
      {},
      ...manuscriptScriptSegments(styledText.text).map((segment, index) =>
        createElement(
          Text,
          {
            key: `script-${index}`,
            style:
              segment.position === 'BASELINE'
                ? {}
                : {
                    fontSize: scriptSize,
                    verticalAlign:
                      segment.position === 'SUPERSCRIPT' ? 'super' : 'sub',
                  },
          },
          segment.text,
        ),
      ),
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
  };
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
