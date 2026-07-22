import { filterSuggestionItems } from '@blocknote/core/extensions';
import {
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { IconAt, IconFunction, IconLink } from 'twenty-ui/display';

import { type ManuscriptEditor } from '@/local-db/research/components/editor/ManuscriptEditorSchema';
import { manuscriptReferenceKey } from '@/local-db/research/components/editor/ManuscriptEditorContext';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

export const getManuscriptSlashMenuItems = (
  editor: ManuscriptEditor,
  openCitationPicker: () => void,
  query: string,
): DefaultReactSuggestionItem[] => {
  const items: DefaultReactSuggestionItem[] = [
    ...getDefaultReactSlashMenuItems(editor),
    {
      title: 'Inline equation',
      aliases: ['math', 'latex', 'formula'],
      group: 'Manuscript',
      icon: <IconFunction />,
      onItemClick: () =>
        editor.insertInlineContent([
          { type: 'inlineEquation', props: { latex: 'x' } },
          ' ',
        ]),
    },
    {
      title: 'Display equation',
      aliases: ['math', 'latex', 'formula', 'block equation'],
      group: 'Manuscript',
      icon: <IconFunction />,
      onItemClick: () => {
        const block = editor.getTextCursorPosition().block;
        editor.updateBlock(block, {
          type: 'displayEquation',
          props: { latex: 'x' },
        });
      },
    },
    {
      title: 'Citation',
      aliases: ['reference', 'cite', 'source'],
      group: 'Manuscript',
      icon: <IconAt />,
      onItemClick: openCitationPicker,
    },
  ];
  return filterSuggestionItems(items, query);
};

export const getManuscriptReferenceSuggestionItems = (
  editor: ManuscriptEditor,
  references: ReferenceLike[],
  query: string,
): DefaultReactSuggestionItem[] => {
  const normalized = query.trim().toLocaleLowerCase();
  return references
    .filter((reference) => {
      const searchable = [
        manuscriptReferenceKey(reference),
        reference.authors,
        reference.name,
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLocaleLowerCase();
      return searchable.includes(normalized);
    })
    .map((reference) => {
      const citationKey = manuscriptReferenceKey(reference);
      return {
        title: reference.name ?? citationKey,
        subtext: [citationKey, reference.authors].filter(Boolean).join(' · '),
        icon: <IconLink />,
        onItemClick: () =>
          editor.insertInlineContent([
            { type: 'citation', props: { citationKey } },
            ' ',
          ]),
      };
    });
};
