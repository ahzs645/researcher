import {
  DOCXExporter,
  docxDefaultSchemaMappings,
} from '@blocknote/xl-docx-exporter';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import { buildBlockNoteDocument } from './manuscriptBlocks';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';

// DOCX export via BlockNote's official docx exporter. Shares the block builder
// with the PDF exporter, so figures (embedded images) and tables (real Word
// tables) render identically across both. Fully client-side, no backend.

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const exportManuscriptToDocxBlob = async (
  bundle: ManuscriptBundle,
): Promise<Blob> => {
  const { editor, blocks } = buildBlockNoteDocument(bundle);
  const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
  return exporter.toBlob(blocks);
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
