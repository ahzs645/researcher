import {
  cslItemToReferenceDraft,
  doiCslJsonUrl,
  parseBibtex,
  parseCslJson,
  parseReferences,
} from '@/local-db/research/manuscript/manuscriptReferenceImport';

describe('parseBibtex', () => {
  it('parses a typical journal entry', () => {
    const bibtex = `@article{smith2020,
  title = {On topological insulator films},
  author = {Smith, Jane and Doe, Alan},
  journal = {Nature Materials},
  year = {2020},
  volume = {19},
  pages = {123--130},
  doi = {10.1038/s41563-020-0001}
}`;
    const [draft] = parseBibtex(bibtex);
    expect(draft.citationKey).toBe('smith2020');
    expect(draft.cslType).toBe('ARTICLE_JOURNAL');
    expect(draft.name).toBe('On topological insulator films');
    expect(draft.authors).toBe('Smith, Jane; Doe, Alan');
    expect(draft.year).toBe(2020);
    expect(draft.containerTitle).toBe('Nature Materials');
    expect(draft.doi).toBe('10.1038/s41563-020-0001');
  });
});

describe('parseCslJson', () => {
  it('maps a CSL-JSON item to a reference draft and preserves the blob', () => {
    const item = {
      id: 'doe2019',
      type: 'article-journal',
      title: 'Spintronic devices',
      author: [{ family: 'Doe', given: 'Alan' }],
      issued: { 'date-parts': [[2019]] },
      'container-title': 'Physical Review Letters',
      DOI: '10.1103/PhysRevLett.000',
    };
    const [draft] = parseCslJson(JSON.stringify([item]));
    expect(draft.citationKey).toBe('doe2019');
    expect(draft.cslType).toBe('ARTICLE_JOURNAL');
    expect(draft.authors).toBe('Doe, Alan');
    expect(draft.year).toBe(2019);
    expect(draft.doi).toBe('10.1103/PhysRevLett.000');
    expect(JSON.parse(draft.cslJson as string).id).toBe('doe2019');
  });
});

describe('parseReferences dispatch', () => {
  it('routes JSON to CSL and @-text to BibTeX, and tolerates junk', () => {
    expect(parseReferences('[{"id":"x","title":"T"}]')).toHaveLength(1);
    expect(parseReferences('@book{k, title={T}\n}')).toHaveLength(1);
    expect(parseReferences('not a reference')).toEqual([]);
    expect(parseReferences('  ')).toEqual([]);
  });
});

describe('doiCslJsonUrl', () => {
  it('normalizes a bare or full DOI to the content-negotiation URL', () => {
    expect(doiCslJsonUrl('10.1038/x')).toBe('https://doi.org/10.1038/x');
    expect(doiCslJsonUrl('https://doi.org/10.1038/x')).toBe(
      'https://doi.org/10.1038/x',
    );
  });
});

describe('cslItemToReferenceDraft', () => {
  it('handles a literal-name author and missing fields', () => {
    const draft = cslItemToReferenceDraft({
      id: 'org2021',
      type: 'report',
      title: 'A report',
      author: [{ literal: 'World Health Organization' }],
    });
    expect(draft.authors).toBe('World Health Organization');
    expect(draft.cslType).toBe('REPORT');
    expect(draft.year).toBeNull();
  });
});
