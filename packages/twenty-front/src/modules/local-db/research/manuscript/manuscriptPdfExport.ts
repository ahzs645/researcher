import {
  PDFExporter,
  pdfDefaultSchemaMappings,
} from '@blocknote/xl-pdf-exporter';
import { pdf, Text } from '@react-pdf/renderer';
import { createElement } from 'react';

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

// PDF export from the *same* BlockNote block model the DOCX exporter builds —
// BlockNote's PDF exporter renders blocks to a react-pdf document, which
// react-pdf then turns into a PDF Blob. No DOCX round-trip and no LaTeX/Typst
// toolchain. Fully client-side: figures embed and tables render as real tables,
// identical to the Word output.

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
  exporter.styles.page = {
    ...exporter.styles.page,
    paddingTop: 72,
    paddingBottom: 72,
    paddingHorizontal: 72,
    fontFamily,
    fontSize: bundle.style.bodyFontSize ?? 12,
    lineHeight: bodyLineSpacing,
  };
  const document = await exporter.toReactPDFDocument(blocks, {
    ...(bundle.style.pageNumbering === true
      ? {
          footer: createElement(Text, {
            fixed: true,
            render: ({ pageNumber }: { pageNumber: number }) =>
              String(pageNumber),
            style: { fontFamily, fontSize: 10, textAlign: 'center' },
          }),
        }
      : {}),
  });
  return pdf(document).toBlob();
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
