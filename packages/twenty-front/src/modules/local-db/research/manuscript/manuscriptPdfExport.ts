import {
  PDFExporter,
  pdfDefaultSchemaMappings,
} from '@blocknote/xl-pdf-exporter';
import { pdf } from '@react-pdf/renderer';

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
  const exporter = new PDFExporter(editor.schema, pdfDefaultSchemaMappings);
  const document = await exporter.toReactPDFDocument(blocks);
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
