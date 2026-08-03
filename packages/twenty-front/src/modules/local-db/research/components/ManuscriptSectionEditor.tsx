import { BlockNoteView } from '@blocknote/mantine';
import { SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { styled } from '@linaria/react';
import { useContext, useEffect, useRef, useState, type Ref } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptEditorContextProvider } from '@/local-db/research/components/editor/ManuscriptEditorContext';
import { useManuscriptSaveStatus } from '@/local-db/research/components/composer/ManuscriptSaveStatusContext';
import { ManuscriptEditorPopover } from '@/local-db/research/components/editor/ManuscriptEditorPopover';
import {
  ManuscriptCrossRefPicker,
  ManuscriptReferencePicker,
} from '@/local-db/research/components/editor/ManuscriptEditorPickers';
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
  type SectionLike,
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
  containerRef?: Ref<HTMLDivElement>;
  figures: FigureLike[];
  initialMarkdown: string;
  minimumHeight?: number;
  onPersist: (markdown: string) => void | Promise<void>;
  onPersistError?: () => void;
  onReady?: () => void;
  references: ReferenceLike[];
  readonly?: boolean;
  sections?: SectionLike[];
  style: JournalStyle;
};

const StyledEditorShell = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
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
  containerRef,
  figures,
  initialMarkdown,
  minimumHeight,
  onPersist,
  onPersistError,
  onReady,
  references,
  readonly = false,
  sections,
  style,
}: ManuscriptSectionEditorProps) => {
  const { colorScheme } = useContext(ThemeContext);
  const { trackSave } = useManuscriptSaveStatus();
  const editor = useCreateBlockNote({ schema: MANUSCRIPT_EDITOR_SCHEMA });
  const insertionPickerAnchorRef = useRef<HTMLDivElement>(null);
  const [mountedOnPersist] = useState(() => onPersist);
  const [insertionPicker, setInsertionPicker] = useState<
    'citation' | 'crossReference' | 'asset' | null
  >(null);
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
    const animationFrameId = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(animationFrameId);
    // Mount-once: the parent remounts via `key` when the section changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useDebouncedCallback(() => {
    void trackSave(() =>
      Promise.resolve(
        mountedOnPersist(manuscriptBlocksToMarkdown(editor, editor.document)),
      ),
    ).catch(onPersistError);
  }, 800);

  useEffect(
    () => () => {
      persist.flush();
    },
    [persist],
  );

  return (
    <ManuscriptEditorContextProvider
      citationKeys={citationKeys}
      figures={figures}
      references={references}
      sections={sections}
      style={style}
    >
      <StyledEditorShell
        ref={containerRef}
        style={
          minimumHeight === undefined ? undefined : { minHeight: minimumHeight }
        }
      >
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
                () => setInsertionPicker('citation'),
                () => setInsertionPicker('crossReference'),
                () => setInsertionPicker('asset'),
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
        {insertionPicker !== null ? (
          <StyledInsertionPopoverAnchor ref={insertionPickerAnchorRef}>
            <ManuscriptEditorPopover
              anchorRef={insertionPickerAnchorRef}
              onClose={() => setInsertionPicker(null)}
            >
              {insertionPicker === 'citation' ? (
                <ManuscriptReferencePicker
                  onSelect={(citationKey) => {
                    editor.insertInlineContent([
                      { type: 'citation', props: { citationKey } },
                      ' ',
                    ]);
                    setInsertionPicker(null);
                  }}
                />
              ) : (
                <ManuscriptCrossRefPicker
                  onSelect={(refKey) => {
                    if (insertionPicker === 'asset') {
                      const block = editor.getTextCursorPosition().block;
                      editor.updateBlock(block, {
                        type: 'assetPlacement',
                        props: { refKey },
                      });
                    } else {
                      editor.insertInlineContent([
                        { type: 'crossRef', props: { refKey } },
                        ' ',
                      ]);
                    }
                    setInsertionPicker(null);
                  }}
                />
              )}
            </ManuscriptEditorPopover>
          </StyledInsertionPopoverAnchor>
        ) : null}
      </StyledEditorShell>
    </ManuscriptEditorContextProvider>
  );
};
