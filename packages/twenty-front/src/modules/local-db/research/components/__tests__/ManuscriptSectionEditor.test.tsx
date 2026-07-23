import { fireEvent, render, screen } from '@testing-library/react';
import { createElement as mockCreateElement, type ReactNode } from 'react';

import { ManuscriptSectionEditor } from '@/local-db/research/components/ManuscriptSectionEditor';

const mockEditor = {
  blocksToMarkdownLossy: jest.fn(() => 'edited markdown'),
  document: [{ id: 'block-id' }],
  insertInlineContent: jest.fn(),
  replaceBlocks: jest.fn(),
  tryParseMarkdownToBlocks: jest.fn(() => [{ id: 'block-id' }]),
};

jest.mock('@blocknote/react', () => ({
  SuggestionMenuController: () => null,
  useCreateBlockNote: () => mockEditor,
}));
jest.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({
    children,
    onChange,
  }: {
    children: ReactNode;
    onChange: () => void;
  }) =>
    mockCreateElement(
      'button',
      { type: 'button', onClick: onChange },
      children,
      'Edit section',
    ),
}));
jest.mock(
  '@/local-db/research/components/editor/ManuscriptEditorContext',
  () => ({
    ManuscriptEditorContextProvider: ({ children }: { children: ReactNode }) =>
      children,
  }),
);
jest.mock(
  '@/local-db/research/components/editor/ManuscriptEditorPopover',
  () => ({ ManuscriptEditorPopover: () => null }),
);
jest.mock(
  '@/local-db/research/components/editor/ManuscriptEditorPickers',
  () => ({ ManuscriptReferencePicker: () => null }),
);
jest.mock(
  '@/local-db/research/components/editor/ManuscriptEditorSchema',
  () => ({ MANUSCRIPT_EDITOR_SCHEMA: {} }),
);
jest.mock(
  '@/local-db/research/components/editor/manuscriptEditorSuggestionMenus',
  () => ({
    getManuscriptReferenceSuggestionItems: jest.fn(() => []),
    getManuscriptSlashMenuItems: jest.fn(() => []),
  }),
);

const editorProps = {
  citationKeys: [],
  figures: [],
  initialMarkdown: 'Initial markdown',
  references: [],
  style: {},
};

describe('ManuscriptSectionEditor', () => {
  it('flushes a pending edit to the old section when its keyed editor unmounts', () => {
    const persistOldSection = jest.fn();
    const persistNewSection = jest.fn();
    const { rerender } = render(
      <ManuscriptSectionEditor
        key="old-section"
        citationKeys={editorProps.citationKeys}
        figures={editorProps.figures}
        initialMarkdown={editorProps.initialMarkdown}
        onPersist={persistOldSection}
        references={editorProps.references}
        style={editorProps.style}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit section' }));
    rerender(
      <ManuscriptSectionEditor
        key="new-section"
        citationKeys={editorProps.citationKeys}
        figures={editorProps.figures}
        initialMarkdown={editorProps.initialMarkdown}
        onPersist={persistNewSection}
        references={editorProps.references}
        style={editorProps.style}
      />,
    );

    expect(persistOldSection).toHaveBeenCalledWith('edited markdown');
    expect(persistNewSection).not.toHaveBeenCalled();
  });
});
