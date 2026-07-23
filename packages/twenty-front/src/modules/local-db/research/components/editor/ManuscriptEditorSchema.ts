import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from '@blocknote/core';

import {
  Citation,
  CrossRef,
  InlineEquation,
} from '@/local-db/research/components/editor/ManuscriptEditorNodes';
import { DisplayEquation } from '@/local-db/research/components/editor/ManuscriptDisplayEquation';

export const MANUSCRIPT_EDITOR_SCHEMA = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    displayEquation: DisplayEquation(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    inlineEquation: InlineEquation,
    citation: Citation,
    crossRef: CrossRef,
  },
});

export type ManuscriptEditor = typeof MANUSCRIPT_EDITOR_SCHEMA.BlockNoteEditor;
