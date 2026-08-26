import { fireEvent, render, screen, within } from '@testing-library/react';
import { createElement as mockCreateElement } from 'react';

import { ManuscriptFrontMatterSections } from '@/local-db/research/components/composer/ManuscriptFrontMatterSections';
import {
  type JournalStyle,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

const enqueueErrorSnackBar = jest.fn();

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar }),
}));

// The real editor is a BlockNote instance; here it only has to prove which
// text it was mounted with and which section a save is addressed to.
jest.mock('@/local-db/research/components/ManuscriptSectionEditor', () => ({
  ManuscriptSectionEditor: ({
    initialMarkdown,
    onPersist,
  }: {
    initialMarkdown: string;
    onPersist: (markdown: string) => void;
  }) =>
    mockCreateElement(
      'button',
      { type: 'button', onClick: () => onPersist('edited markdown') },
      initialMarkdown,
    ),
}));

const MDPI_KEY = 'myst:tex/myst/mdpi:atmosphere';

const BASE_ABSTRACT: SectionLike = {
  id: 'abstract',
  name: 'Abstract',
  sectionType: 'ABSTRACT',
  placement: 'FRONT_MATTER',
  orderIndex: 0,
  level: 1,
  content: 'Paper abstract',
  wordCount: 246,
};

// Named apart from its base only so the test can prove it is absent; a real
// version usually carries the base's name, since that name is what exports.
const MDPI_ABSTRACT: SectionLike = {
  id: 'abstract-mdpi',
  name: 'Abstract for MDPI',
  sectionType: 'ABSTRACT',
  placement: 'FRONT_MATTER',
  orderIndex: 0,
  level: 1,
  content: 'MDPI abstract',
  wordCount: 182,
  wordLimit: 200,
  variantOfId: 'abstract',
  variantProfileKey: MDPI_KEY,
};

const BASE_SUMMARY: SectionLike = {
  id: 'summary',
  name: 'Lay summary',
  sectionType: 'SUMMARY',
  placement: 'FRONT_MATTER',
  orderIndex: 1,
  level: 1,
  content: 'Paper summary',
  wordCount: 120,
};

const MDPI_SUMMARY: SectionLike = {
  id: 'summary-mdpi',
  name: 'Lay summary for MDPI',
  sectionType: 'SUMMARY',
  placement: 'FRONT_MATTER',
  orderIndex: 1,
  level: 1,
  content: 'MDPI summary',
  wordCount: 90,
  variantOfId: 'summary',
  variantProfileKey: MDPI_KEY,
};

const MDPI_STYLE: JournalStyle = {
  name: 'MDPI Atmosphere',
  profileKey: MDPI_KEY,
};

const JOURNALS = [
  { id: 'journal-mdpi', name: 'MDPI Atmosphere', profileKey: MDPI_KEY },
];

const renderSections = (
  sections: SectionLike[],
  overrides: {
    onPersistSection?: jest.Mock;
    onCreateSectionVariant?: jest.Mock;
    selectedSectionId?: string;
    style?: JournalStyle;
  } = {},
) =>
  render(
    <ManuscriptFrontMatterSections
      existingJournals={JOURNALS}
      figures={[]}
      onChangeIncludeInExport={jest.fn()}
      onChangePlacement={jest.fn()}
      onCreateSectionVariant={overrides.onCreateSectionVariant ?? jest.fn()}
      onPersistSection={overrides.onPersistSection ?? jest.fn()}
      references={[]}
      sections={sections}
      selectedSectionId={overrides.selectedSectionId}
      style={overrides.style ?? MDPI_STYLE}
    />,
  );

const expandRow = (name: RegExp) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('ManuscriptFrontMatterSections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gives a journal version no front-matter row of its own', () => {
    renderSections([BASE_ABSTRACT, MDPI_ABSTRACT]);

    expect(screen.getByText('Abstract')).toBeInTheDocument();
    expect(screen.queryByText('Abstract for MDPI')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1);
  });

  it('says on the collapsed row which version ships to the current journal', () => {
    renderSections([BASE_ABSTRACT, MDPI_ABSTRACT]);

    expect(
      screen.getByText('Exports as MDPI Atmosphere version'),
    ).toBeInTheDocument();
    // The count the journal will actually read, against the cap it imposes.
    expect(screen.getByText('182 / 200 words')).toBeInTheDocument();
  });

  it('says a section has versions but none for the journal now selected', () => {
    renderSections([BASE_ABSTRACT, MDPI_ABSTRACT], {
      style: { name: 'arXiv', profileKey: 'arxiv' },
    });

    expect(
      screen.getByText('Has 1 journal version, none for arXiv'),
    ).toBeInTheDocument();
    expect(screen.getByText('246 words')).toBeInTheDocument();
  });

  it('leaves a section with no versions exactly as it was', () => {
    renderSections([BASE_ABSTRACT]);

    expect(screen.getByText('246 words')).toBeInTheDocument();
    expect(screen.queryByText(/version/i)).not.toBeInTheDocument();
  });

  it('edits and saves the version the expanded row has selected', () => {
    const onPersistSection = jest.fn();
    renderSections([BASE_ABSTRACT, MDPI_ABSTRACT], { onPersistSection });

    expandRow(/Abstract/);
    expect(screen.getByText('Paper abstract')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'MDPI Atmosphere' }));

    expect(screen.getByText('MDPI abstract')).toBeInTheDocument();
    expect(screen.queryByText('Paper abstract')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('MDPI abstract'));
    expect(onPersistSection).toHaveBeenCalledWith(
      'abstract-mdpi',
      'edited markdown',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Paper' }));
    fireEvent.click(screen.getByText('Paper abstract'));
    expect(onPersistSection).toHaveBeenCalledWith(
      'abstract',
      'edited markdown',
    );
  });

  it('keeps each expanded row editing its own section', () => {
    renderSections([BASE_ABSTRACT, MDPI_ABSTRACT, BASE_SUMMARY, MDPI_SUMMARY]);

    expandRow(/Abstract/);
    expandRow(/Lay summary/);

    const [abstractBar, summaryBar] = screen.getAllByRole('group');
    fireEvent.click(
      within(abstractBar).getByRole('button', { name: 'MDPI Atmosphere' }),
    );

    expect(screen.getByText('MDPI abstract')).toBeInTheDocument();
    expect(screen.getByText('Paper summary')).toBeInTheDocument();

    fireEvent.click(
      within(summaryBar).getByRole('button', { name: 'MDPI Atmosphere' }),
    );

    expect(screen.getByText('MDPI abstract')).toBeInTheDocument();
    expect(screen.getByText('MDPI summary')).toBeInTheDocument();
  });

  it('opens the base row on the version the composer has selected', () => {
    renderSections([BASE_ABSTRACT, MDPI_ABSTRACT], {
      selectedSectionId: 'abstract-mdpi',
    });

    // The row expanded on its own, and on the newly created version — the same
    // landing the Write tab gives after "New version for this journal".
    expect(screen.getByText('MDPI abstract')).toBeInTheDocument();
    expect(screen.queryByText('Paper abstract')).not.toBeInTheDocument();
  });

  it('reports why a second version for the same journal was refused', async () => {
    const onCreateSectionVariant = jest
      .fn()
      .mockRejectedValue(
        new Error('Abstract already has a version for MDPI Atmosphere'),
      );
    renderSections([BASE_SUMMARY], { onCreateSectionVariant });

    expandRow(/Lay summary/);
    fireEvent.click(
      screen.getByRole('button', { name: /New version for MDPI Atmosphere/ }),
    );

    expect(onCreateSectionVariant).toHaveBeenCalledWith('summary');
    await screen.findByRole('button', {
      name: /New version for MDPI Atmosphere/,
    });
    expect(enqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'Abstract already has a version for MDPI Atmosphere',
    });
  });
});
