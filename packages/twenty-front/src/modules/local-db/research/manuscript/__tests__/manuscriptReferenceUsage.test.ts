import {
  collectReferenceUsage,
  countCitationKeyOccurrences,
  summarizeReferenceUsage,
} from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import {
  type FigureLike,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

describe('collectReferenceUsage', () => {
  const references: ReferenceLike[] = [
    { id: 'r1', citationKey: 'alpha' },
    { id: 'r2', citationKey: 'beta' },
    { id: 'r3', citationKey: 'unused' },
    { id: 'r4', citationKey: null },
  ];
  const sections: SectionLike[] = [
    {
      id: 'introduction',
      content: 'First [@alpha], then a cluster [@alpha; @beta].',
    },
    { id: 'methods', content: 'Again [@beta].' },
  ];
  const figures: FigureLike[] = [
    {
      id: 'figure',
      sectionId: 'methods',
      caption: 'Caption [@alpha].',
      tableData: '| Source |\n| --- |\n| [@beta; @alpha] |',
    },
  ];

  it('counts cluster members in sections, figure captions, and table data', () => {
    const usage = collectReferenceUsage(sections, figures, references);

    expect(usage.get('alpha')).toEqual({
      count: 4,
      sectionIds: ['introduction', 'methods'],
    });
    expect(usage.get('beta')).toEqual({
      count: 3,
      sectionIds: ['introduction', 'methods'],
    });
    expect(usage.get('unused')).toEqual({ count: 0, sectionIds: [] });
    expect(usage.has('missing')).toBe(false);
  });

  it('summarizes reference records, including records without citation keys', () => {
    expect(
      summarizeReferenceUsage(
        references,
        collectReferenceUsage(sections, figures, references),
      ),
    ).toEqual({ total: 4, cited: 2, unused: 2 });
  });

  it('counts repeated members independently', () => {
    expect(
      countCitationKeyOccurrences('See [@alpha; @alpha; @beta].', 'alpha'),
    ).toBe(2);
  });
});
