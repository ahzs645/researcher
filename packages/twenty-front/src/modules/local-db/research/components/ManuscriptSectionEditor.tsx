import { BlockNoteView } from '@blocknote/mantine';
import { SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { styled } from '@linaria/react';
import { useContext, useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptEditorContextProvider } from '@/local-db/research/components/editor/ManuscriptEditorContext';
import { ManuscriptEditorPopover } from '@/local-db/research/components/editor/ManuscriptEditorPopover';
import { ManuscriptReferencePicker } from '@/local-db/research/components/editor/ManuscriptEditorPickers';
import { MANUSCRIPT_EDITOR_SCHEMA } from '@/local-db/research/components/editor/ManuscriptEditorSchema';
import {
  getManuscriptReferenceSuggestionItems,
  getManuscriptSlashMenuItems,
} from '@/local-db/research/components/editor/manuscriptEditorSuggestionMenus';
import {
  manuscriptBlocksToMarkdown,
  markdownToManuscriptBlocks,
} from '@/local-db/research/manuscript/manuscriptEditorContent';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import 'katex/dist/katex.min.css';

// WYSIWYG section editor. BlockNote is the editing surface (a true block-based
// WYSIWYG with native image blocks), but Markdown stays the persisted source of
// truth — so the numbering / cross-ref / citation / export logic all keep
// operating on plain Markdown. The editor is mounted per-section (the parent
// supplies a `key`) and round-trips Markdown ⇄ blocks.
//
type ManuscriptSectionEditorProps = {
  citationKeys: string[];
  figures: FigureLike[];
  initialMarkdown: string;
  onPersist: (markdown: string) => void;
  references: ReferenceLike[];
  readonly?: boolean;
  style: JournalStyle;
};

const StyledEditorShell = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  min-height: 320px;
  padding: ${themeCssVariables.spacing[2]};
  position: relative;

  & .bn-editor {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14px;
  }
`;

const StyledInsertionPopoverAnchor = styled.div`
  left: ${themeCssVariables.spacing[4]};
  position: absolute;
  top: ${themeCssVariables.spacing[6]};
  z-index: 20;
`;

export const ManuscriptSectionEditor = ({
  citationKeys,
  figures,
  initialMarkdown,
  onPersist,
  references,
  readonly = false,
  style,
}: ManuscriptSectionEditorProps) => {
  const { colorScheme } = useContext(ThemeContext);
  const editor = useCreateBlockNote({ schema: MANUSCRIPT_EDITOR_SCHEMA });
  const citationPickerAnchorRef = useRef<HTMLDivElement>(null);
  const [isCitationPickerOpen, setIsCitationPickerOpen] = useState(false);
  // Don't persist the (lossy) re-serialization while loading the initial
  // content — only once the user actually edits.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // BlockNote's markdown ⇄ blocks methods are synchronous in this version.
    const blocks = markdownToManuscriptBlocks(
      editor,
      initialMarkdown.length > 0 ? initialMarkdown : '',
    );
    if (blocks.length > 0) {
      editor.replaceBlocks(editor.document, blocks);
    }
    setIsLoaded(true);
    // Mount-once: the parent remounts via `key` when the section changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useDebouncedCallback(() => {
    onPersist(manuscriptBlocksToMarkdown(editor, editor.document));
  }, 800);

  return (
    <ManuscriptEditorContextProvider
      citationKeys={citationKeys}
      figures={figures}
      references={references}
      style={style}
    >
      <StyledEditorShell>
        <BlockNoteView
          editor={editor}
          editable={!readonly}
          slashMenu={false}
          theme={colorScheme === 'light' ? 'light' : 'dark'}
          onChange={() => {
            if (isLoaded) persist();
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              getManuscriptSlashMenuItems(
                editor,
                () => setIsCitationPickerOpen(true),
                query,
              )
            }
          />
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) =>
              getManuscriptReferenceSuggestionItems(editor, references, query)
            }
          />
        </BlockNoteView>
        {isCitationPickerOpen ? (
          <StyledInsertionPopoverAnchor ref={citationPickerAnchorRef}>
            <ManuscriptEditorPopover
              anchorRef={citationPickerAnchorRef}
              onClose={() => setIsCitationPickerOpen(false)}
            >
              <ManuscriptReferencePicker
                onSelect={(citationKey) => {
                  editor.insertInlineContent([
                    { type: 'citation', props: { citationKey } },
                    ' ',
                  ]);
                  setIsCitationPickerOpen(false);
                }}
              />
            </ManuscriptEditorPopover>
          </StyledInsertionPopoverAnchor>
        ) : null}
      </StyledEditorShell>
    </ManuscriptEditorContextProvider>
  );
};
