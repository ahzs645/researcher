import {
  PDFExporter,
  pdfDefaultSchemaMappings,
} from '@blocknote/xl-pdf-exporter';
import { pdf, Text } from '@react-pdf/renderer';
import { createElement } from 'react';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import { buildBlockNoteDocument } from './manuscriptBlocks';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';

// PDF export from the *same* BlockNote block model the DOCX exporter builds —
// BlockNote's PDF exporter renders blocks to a react-pdf document, which
// react-pdf then turns into a PDF Blob. No DOCX round-trip and no LaTeX/Typst
// toolchain. Fully client-side: figures embed and tables render as real tables,
// identical to the Word output.

export const exportManuscriptToPdfBlob = async (
  bundle: ManuscriptBundle,
): Promise<Blob> => {
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
        children: exporter.transformInlineContent(block.content),
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
