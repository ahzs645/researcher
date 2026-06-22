import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { styled } from '@linaria/react';
import { useContext, useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

// WYSIWYG section editor. BlockNote is the editing surface (a true block-based
// WYSIWYG with native image blocks), but Markdown stays the persisted source of
// truth — so the numbering / cross-ref / citation / export logic all keep
// operating on plain Markdown. The editor is mounted per-section (the parent
// supplies a `key`) and round-trips Markdown ⇄ blocks.
//
// Authoring tokens ($…$ math, [@key] citations, [#fig:label] cross-refs) live as
// inline text in the Markdown; they render verbatim in the editor and are
// resolved by the assembly layer at preview/export time.

type ManuscriptSectionEditorProps = {
  initialMarkdown: string;
  onPersist: (markdown: string) => void;
  readonly?: boolean;
};

const StyledEditorShell = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  min-height: 320px;
  padding: ${themeCssVariables.spacing[2]};

  & .bn-editor {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14px;
  }
`;

export const ManuscriptSectionEditor = ({
  initialMarkdown,
  onPersist,
  readonly = false,
}: ManuscriptSectionEditorProps) => {
  const { colorScheme } = useContext(ThemeContext);
  const editor = useCreateBlockNote();
  // Don't persist the (lossy) re-serialization while loading the initial
  // content — only once the user actually edits.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // BlockNote's markdown ⇄ blocks methods are synchronous in this version.
    const blocks = editor.tryParseMarkdownToBlocks(
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
    onPersist(editor.blocksToMarkdownLossy(editor.document));
  }, 800);

  return (
    <StyledEditorShell>
      <BlockNoteView
        editor={editor}
        editable={!readonly}
        theme={colorScheme === 'light' ? 'light' : 'dark'}
        onChange={() => {
          if (isLoaded) {
            persist();
          }
        }}
      />
    </StyledEditorShell>
  );
};
