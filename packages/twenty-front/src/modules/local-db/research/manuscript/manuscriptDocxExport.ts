import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import {
  DOCXExporter,
  docxDefaultSchemaMappings,
} from '@blocknote/xl-docx-exporter';
import { isNonEmptyString } from '@sniptt/guards';

import { type ManuscriptBundle } from './manuscriptAssembly';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import { resolveFigureImage } from './manuscriptImages';
import { parseMarkdownTable } from './manuscriptTables';
import { type NumberedFigure } from './manuscriptTypes';

// DOCX export via BlockNote's official docx exporter. The neutral document-node
// model becomes BlockNote blocks — prose is parsed from Markdown, figures become
// real embedded images, and tables become real Word tables (not Markdown text).
// The exporter normalizes those blocks through a headless editor, then docxjs
// renders the .docx. Fully client-side, no backend.

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'manuscript';

const captionText = (figure: NumberedFigure): string =>
  [`${figure.label}.`, figure.caption ?? '']
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

const figureToBlocks = (figure: NumberedFigure): PartialBlock[] => {
  const image = resolveFigureImage(figure);
  if (image.kind !== 'none') {
    return [
      {
        type: 'image',
        props: { url: image.src, caption: captionText(figure) },
      },
    ];
  }
  return [{ type: 'paragraph', content: captionText(figure) }];
};

const tableToBlocks = (figure: NumberedFigure): PartialBlock[] => {
  const blocks: PartialBlock[] = [
    { type: 'paragraph', content: captionText(figure) },
  ];
  const rows = parseMarkdownTable(figure.tableData);
  if (rows.length > 0) {
    blocks.push({
      type: 'table',
      content: {
        type: 'tableContent',
        rows: rows.map((cells) => ({ cells })),
      },
    });
  }
  return blocks;
};

// Build the BlockNote document from the neutral nodes. `editor` is used both to
// parse prose Markdown and (later) to normalize the partial blocks.
const bundleToBlocks = (
  editor: BlockNoteEditor,
  bundle: ManuscriptBundle,
): PartialBlock[] => {
  const blocks: PartialBlock[] = [
    { type: 'heading', props: { level: 1 }, content: bundle.metadata.title },
  ];
  if (isNonEmptyString(bundle.metadata.authors)) {
    blocks.push({ type: 'paragraph', content: bundle.metadata.authors });
  }

  for (const node of bundle.nodes) {
    switch (node.kind) {
      case 'heading':
        blocks.push({
          type: 'heading',
          props: { level: node.level },
          content: node.text,
        });
        break;
      case 'prose':
        blocks.push(...editor.tryParseMarkdownToBlocks(node.markdown));
        break;
      case 'figure':
        blocks.push(...figureToBlocks(node.figure));
        break;
      case 'table':
        blocks.push(...tableToBlocks(node.figure));
        break;
      case 'bibliography':
        for (const entry of node.entries) {
          blocks.push({ type: 'paragraph', content: entry.text });
        }
        break;
    }
  }
  return blocks;
};

export const exportManuscriptToDocxBlob = async (
  bundle: ManuscriptBundle,
): Promise<Blob> => {
  const editor = BlockNoteEditor.create();
  // Normalize partial blocks → full blocks via the editor, then export.
  editor.replaceBlocks(editor.document, bundleToBlocks(editor, bundle));
  const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
  return exporter.toBlob(editor.document);
};

export const blocknoteDocxExporter: ManuscriptExporter = {
  id: 'blocknote-docx',
  label: 'Word (.docx)',
  formats: ['DOCX'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> => {
    const blob = await exportManuscriptToDocxBlob(bundle);
    return [
      {
        filename: `${slugify(bundle.metadata.title)}.docx`,
        mimeType: DOCX_MIME,
        content: blob,
      },
    ];
  },
};
