import {
  defaultDuplicateResolution,
  findDuplicateSectionGroups,
  findExistingSectionMatch,
  sectionContentSimilarity,
  type SectionDedupeShape,
} from '@/local-db/research/manuscript/manuscriptSectionDedupe';

const section = (
  id: string,
  name: string,
  sectionType: string,
  content: string,
  orderIndex: number,
): SectionDedupeShape => ({
  id,
  name,
  sectionType,
  content,
  orderIndex,
});

const words = (prefix: string, count: number): string =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(
    ' ',
  );

describe('findDuplicateSectionGroups', () => {
  it('groups identical funding declarations and reports their similarity', () => {
    const content = words('funding', 18);
    const [group] = findDuplicateSectionGroups([
      section('funding-2', 'FUNDING', 'FUNDING', ` ${content}\n`, 8),
      section('funding-1', 'Funding', 'FUNDING', content, 3),
    ]);

    expect(group.sections.map(({ id }) => id)).toEqual([
      'funding-1',
      'funding-2',
    ]);
    expect(group.pairSimilarities).toEqual([
      {
        firstSectionId: 'funding-1',
        secondSectionId: 'funding-2',
        similarity: 'identical',
      },
    ]);
    expect(defaultDuplicateResolution(group)).toEqual([
      {
        sectionId: 'funding-1',
        action: 'keep',
        suggestedKeep: true,
        needsReview: false,
      },
      {
        sectionId: 'funding-2',
        action: 'remove',
        suggestedKeep: false,
        needsReview: false,
      },
    ]);
  });

  it('keeps the 86-word author contribution and reviews the different 52-word variant', () => {
    const [group] = findDuplicateSectionGroups([
      section('empty', 'Author Contribution', 'OTHER', '', 1),
      section(
        'long',
        'Author contributions',
        'AUTHOR_CONTRIBUTIONS',
        words('long', 86),
        2,
      ),
      section(
        'variant',
        'AUTHOR CONTRIBUTION',
        'AUTHOR_CONTRIBUTIONS',
        words('variant', 52),
        3,
      ),
    ]);

    expect(group.emptySectionIds).toEqual(['empty']);
    expect(defaultDuplicateResolution(group)).toEqual([
      {
        sectionId: 'empty',
        action: 'remove',
        suggestedKeep: false,
        needsReview: false,
      },
      {
        sectionId: 'long',
        action: 'keep',
        suggestedKeep: true,
        needsReview: false,
      },
      {
        sectionId: 'variant',
        action: 'keep',
        suggestedKeep: false,
        needsReview: true,
      },
    ]);
  });

  it('keeps both differently sized references sections pending choice', () => {
    const [group] = findDuplicateSectionGroups([
      section('full', 'References', 'REFERENCES', words('full', 1285), 4),
      section('short', 'Reference', 'REFERENCES', words('short', 32), 5),
    ]);

    expect(defaultDuplicateResolution(group)).toEqual([
      {
        sectionId: 'full',
        action: 'keep',
        suggestedKeep: true,
        needsReview: false,
      },
      {
        sectionId: 'short',
        action: 'keep',
        suggestedKeep: false,
        needsReview: true,
      },
    ]);
  });

  it('groups consent sections by name despite ETHICS to OTHER type drift', () => {
    const [group] = findDuplicateSectionGroups([
      section('docx', 'Consent to Participate', 'ETHICS', 'Agreed.', 1),
      section('zip', 'consent   to participate', 'OTHER', 'Agreed.', 2),
    ]);

    expect(group.sections.map(({ id }) => id)).toEqual(['docx', 'zip']);
  });

  it('does not group OTHER sections solely by their type', () => {
    expect(
      findDuplicateSectionGroups([
        section('first', 'Limitations', 'OTHER', 'One', 1),
        section('second', 'Future work', 'OTHER', 'Two', 2),
      ]),
    ).toEqual([]);
  });

  it('groups singleton declarations by type even when their names differ', () => {
    const [group] = findDuplicateSectionGroups([
      section('first', 'Grant support', 'FUNDING', 'Grant A.', 1),
      section('second', 'Financial disclosure', 'funding', 'Grant B.', 2),
    ]);

    expect(group.sections.map(({ id }) => id)).toEqual(['first', 'second']);
  });
});

describe('sectionContentSimilarity', () => {
  it('uses normalized whitespace equality and greater-than-0.8 token overlap', () => {
    expect(sectionContentSimilarity('alpha \n beta', 'alpha beta')).toBe(
      'identical',
    );
    expect(
      sectionContentSimilarity(
        'alpha beta gamma delta epsilon',
        'alpha beta gamma delta epsilon zeta',
      ),
    ).toBe('similar');
    expect(sectionContentSimilarity('alpha beta', 'gamma delta')).toBe(
      'different',
    );
    expect(
      sectionContentSimilarity(
        'alpha beta gamma delta',
        'alpha beta gamma delta epsilon',
      ),
    ).toBe('different');
  });
});

describe('findExistingSectionMatch', () => {
  const existingSections = [
    section(
      'funding',
      'Funding',
      'FUNDING',
      'Grant 123 supported this work.',
      1,
    ),
    section(
      'contributions',
      'Author contributions',
      'AUTHOR_CONTRIBUTIONS',
      'A designed and B analyzed the study.',
      2,
    ),
    section(
      'consent',
      'Consent to Participate',
      'OTHER',
      'All participants consented.',
      3,
    ),
  ];

  it('finds identical existing singleton declarations', () => {
    expect(
      findExistingSectionMatch(
        {
          name: 'Funding source',
          sectionType: 'FUNDING',
          content: 'Grant 123 supported\nthis work.',
        },
        existingSections,
      ),
    ).toMatchObject({
      existingSection: { id: 'funding' },
      similarity: 'identical',
    });
  });

  it('matches plural-insensitive names and type-drifted consent names', () => {
    expect(
      findExistingSectionMatch(
        {
          name: 'Author Contribution',
          sectionType: 'OTHER',
          content: 'A designed and B analyzed the study carefully.',
        },
        existingSections,
      ),
    ).toMatchObject({
      existingSection: { id: 'contributions' },
      similarity: 'similar',
    });
    expect(
      findExistingSectionMatch(
        {
          name: 'consent to participate',
          sectionType: 'ETHICS',
          content: 'All participants consented.',
        },
        existingSections,
      ),
    ).toMatchObject({
      existingSection: { id: 'consent' },
      similarity: 'identical',
    });
  });
});
