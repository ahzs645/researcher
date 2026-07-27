import { render, screen } from '@testing-library/react';

import { ManuscriptEditorContextProvider } from '@/local-db/research/components/editor/ManuscriptEditorContext';
import { ManuscriptCitationChip } from '@/local-db/research/components/editor/ManuscriptEditorNodes';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

jest.mock('@blocknote/react', () => ({
  createReactInlineContentSpec: (config: unknown, implementation: unknown) => ({
    config,
    implementation,
  }),
}));

const REFERENCES: ReferenceLike[] = [
  {
    id: 'reference-1',
    citationKey: 'li2017',
    authors: 'Li, Wei',
    year: 2017,
    name: 'Particulate matter exposure',
  },
  {
    id: 'reference-2',
    citationKey: 'manisalidis2020',
    authors: 'Manisalidis, Ioannis',
    year: 2020,
    name: 'Environmental and health impacts of air pollution',
  },
  {
    id: 'reference-3',
    citationKey: 'pehoiu2008',
    authors: 'Pehoiu, Gica',
    year: 2008,
    name: 'Air quality monitoring',
  },
];

const renderChip = (citationKey: string) =>
  render(
    <ManuscriptEditorContextProvider
      citationKeys={['li2017', 'manisalidis2020', 'pehoiu2008']}
      figures={[]}
      references={REFERENCES}
      style={{ citationMode: 'AUTHOR_DATE' }}
    >
      <ManuscriptCitationChip
        citationKey={citationKey}
        onRemove={jest.fn()}
        onSave={jest.fn()}
      />
    </ManuscriptEditorContextProvider>,
  );

describe('ManuscriptCitationChip', () => {
  it('renders a multi-key cluster as one chip listing every source', () => {
    renderChip('li2017; manisalidis2020; pehoiu2008');

    expect(
      screen.getByRole('button', {
        name: 'Edit citation li2017; manisalidis2020; pehoiu2008',
      }),
    ).toHaveTextContent('(Li, 2017; Manisalidis, 2020; Pehoiu, 2008)');
  });

  it('still renders a single key as its own chip', () => {
    renderChip('li2017');

    expect(
      screen.getByRole('button', { name: 'Edit citation li2017' }),
    ).toHaveTextContent('(Li, 2017)');
  });

  it('warns with the raw token when a cluster key has no reference', () => {
    renderChip('li2017; ghost2001');

    expect(
      screen.getByRole('button', { name: 'Edit citation li2017; ghost2001' }),
    ).toHaveTextContent('[@li2017; @ghost2001]');
  });
});
