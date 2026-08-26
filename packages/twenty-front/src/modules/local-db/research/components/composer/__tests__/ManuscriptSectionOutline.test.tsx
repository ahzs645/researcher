import { render, screen } from '@testing-library/react';

import { ManuscriptSectionOutline } from '@/local-db/research/components/composer/ManuscriptSectionOutline';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

const BASE_ABSTRACT: SectionLike = {
  id: 'abstract',
  name: 'Abstract',
  sectionType: 'ABSTRACT',
  placement: 'MAIN',
  orderIndex: 0,
  level: 1,
  wordCount: 246,
};

const INTRODUCTION: SectionLike = {
  id: 'introduction',
  name: 'Introduction',
  sectionType: 'INTRODUCTION',
  placement: 'MAIN',
  orderIndex: 1,
  level: 1,
  wordCount: 800,
};

// Named apart from its base only so the test can prove it is absent; a real
// version usually carries the base's name, since that name is what exports.
const MDPI_ABSTRACT: SectionLike = {
  id: 'abstract-mdpi',
  name: 'Abstract for MDPI',
  sectionType: 'ABSTRACT',
  placement: 'MAIN',
  orderIndex: 0,
  level: 1,
  wordCount: 182,
  wordLimit: 200,
  variantOfId: 'abstract',
  variantProfileKey: 'myst:tex/myst/mdpi:atmosphere',
};

const renderOutline = (
  sections: SectionLike[],
  activeVariantKey: string | null,
  activeJournalLabel: string | null,
) =>
  render(
    <ManuscriptSectionOutline
      sections={sections}
      activeVariantKey={activeVariantKey}
      activeJournalLabel={activeJournalLabel}
      onChangePlacement={jest.fn()}
      onEditFrontMatter={jest.fn()}
      onSelectSection={jest.fn()}
      onReorderSection={jest.fn()}
    />,
  );

describe('ManuscriptSectionOutline', () => {
  it('lists a journal version nowhere and counts it in no group', () => {
    renderOutline(
      [BASE_ABSTRACT, MDPI_ABSTRACT, INTRODUCTION],
      'myst:tex/myst/mdpi:atmosphere',
      'MDPI Atmosphere',
    );

    expect(screen.getByText('Abstract')).toBeInTheDocument();
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.queryByText('Abstract for MDPI')).not.toBeInTheDocument();
    // Two sections in the paper, not three: the version is an alternative
    // wording of one of them.
    expect(screen.getByRole('button', { name: /Main text/ })).toHaveTextContent(
      '2',
    );
  });

  it('names the version active for the selected journal and counts it against that cap', () => {
    renderOutline(
      [BASE_ABSTRACT, MDPI_ABSTRACT, INTRODUCTION],
      'myst:tex/myst/mdpi:atmosphere',
      'MDPI Atmosphere',
    );

    expect(screen.getByText('182 / 200 words')).toBeInTheDocument();
    expect(
      screen.getByText('Exports as MDPI Atmosphere version'),
    ).toBeInTheDocument();
    expect(screen.queryByText('246 words')).not.toBeInTheDocument();
  });

  it('says a section has versions but none for the journal now selected', () => {
    renderOutline(
      [BASE_ABSTRACT, MDPI_ABSTRACT, INTRODUCTION],
      'arxiv',
      'arXiv',
    );

    expect(screen.getByText('246 words')).toBeInTheDocument();
    expect(
      screen.getByText('Has 1 journal version, none for arXiv'),
    ).toBeInTheDocument();
  });

  it('leaves a paper with no versions exactly as it was', () => {
    renderOutline([BASE_ABSTRACT, INTRODUCTION], 'arxiv', 'arXiv');

    expect(screen.getByText('246 words')).toBeInTheDocument();
    expect(screen.queryByText(/version/)).not.toBeInTheDocument();
  });
});
