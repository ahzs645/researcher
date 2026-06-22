import {
  BlockNoteEditor,
  type Block,
  type PartialBlock,
} from '@blocknote/core';
import { isNonEmptyString } from '@sniptt/guards';

import { type ManuscriptBundle } from './manuscriptAssembly';
import { resolveFigureImage } from './manuscriptImages';
import { parseMarkdownTable } from './manuscriptTables';
import { type NumberedFigure } from './manuscriptTypes';

// Build a BlockNote document from the neutral document-node model. Shared by the
// DOCX and PDF exporters (and any future block-based engine) so figures become
// embedded images and tables become real tables in *both* outputs — one block
// builder, one source of truth.

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
      content: { type: 'tableContent', rows: rows.map((cells) => ({ cells })) },
    });
  }
  return blocks;
};

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

// Create a headless editor and normalize the partial blocks into full blocks.
// Returns both so an exporter can read `editor.schema` for its mappings.
export const buildBlockNoteDocument = (
  bundle: ManuscriptBundle,
): { editor: BlockNoteEditor; blocks: Block[] } => {
  const editor = BlockNoteEditor.create();
  editor.replaceBlocks(editor.document, bundleToBlocks(editor, bundle));
  return { editor, blocks: editor.document };
};
