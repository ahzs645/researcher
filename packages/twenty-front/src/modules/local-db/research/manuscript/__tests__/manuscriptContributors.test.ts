import {
  formatManuscriptAuthorLine,
  manuscriptAuthorLineSegments,
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
  serializeManuscriptAuthors,
} from '@/local-db/research/manuscript/manuscriptContributors';

describe('manuscript contributors', () => {
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
