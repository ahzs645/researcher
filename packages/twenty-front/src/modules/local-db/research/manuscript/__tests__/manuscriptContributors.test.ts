import {
  formatManuscriptAuthorLine,
  manuscriptAuthorLineSegments,
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
  serializeManuscriptAuthors,
} from '@/local-db/research/manuscript/manuscriptContributors';

describe('manuscript contributors', () => {
  it('maps digit-bearing placeholder authors to comma-separated affiliations', () => {
    const affiliations = parseManuscriptAffiliations(
      '1 [Affiliation 1], 2 [Affiliation 2]',
    );
    const authors = parseManuscriptAuthors(
      '[Author 1]1, [Author 2]2, [Author 3]1',
      affiliations,
    );

    expect(affiliations).toHaveLength(2);
    expect(authors.map((author) => author.name)).toEqual([
      '[Author 1]',
      '[Author 2]',
      '[Author 3]',
    ]);
    expect(
      formatManuscriptAuthorLine(
        '[Author 1]1, [Author 2]2, [Author 3]1',
        '1 [Affiliation 1], 2 [Affiliation 2]',
      ),
    ).toBe('[Author 1]¹, [Author 2]², [Author 3]¹');
  });

  const affiliations = parseManuscriptAffiliations(
    '1 Northern Analytical Lab\n2 Natural Resources\n3 Chemistry',
  );

  it('recovers author-to-affiliation links from an imported Word title line', () => {
    const authors = parseManuscriptAuthors(
      'Ahmad Jalil1*, Ann Duong1,2, Mya Schouwenburg1,2, Hossein Kazemian1,2,3',
      affiliations,
    );

    expect(authors).toHaveLength(4);
    expect(authors[0]).toMatchObject({
      name: 'Ahmad Jalil',
      affiliationIds: ['affiliation-1'],
      isCorresponding: true,
    });
    expect(authors[3].affiliationIds).toEqual([
      'affiliation-1',
      'affiliation-2',
      'affiliation-3',
    ]);
  });

  it('renumbers author references when affiliations are reordered', () => {
    const authors = parseManuscriptAuthors(
      'Ahmad Jalil [1*]; Ann Duong [1,2]',
      affiliations,
    );

    expect(
      serializeManuscriptAuthors(authors, [affiliations[1], affiliations[0]]),
    ).toBe('Ahmad Jalil [2*]; Ann Duong [1,2]');
  });

  it('formats references as superscripts and exposes semantic Word runs', () => {
    const display = formatManuscriptAuthorLine(
      'Ahmad Jalil [1*]; Ann Duong [1,2]',
      '1 Northern Analytical Lab\n2 Natural Resources',
    );

    expect(display).toBe('Ahmad Jalil¹*, Ann Duong¹˒²');
    expect(manuscriptAuthorLineSegments(display)).toEqual([
      { text: 'Ahmad Jalil', superscript: false },
      { text: '1*', superscript: true },
      { text: ', Ann Duong', superscript: false },
      { text: '1,2', superscript: true },
    ]);
  });
});
