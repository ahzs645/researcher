import {
  cslItemToReferenceDraft,
  doiCslJsonUrl,
  parseBibtex,
  parseCslJson,
  parseReferences,
} from '@/local-db/research/manuscript/manuscriptReferenceImport';
import { dedupeReferenceDrafts } from '@/local-db/research/manuscript/manuscriptReferenceStore';

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
  const dated = (issued: unknown) =>
    cslItemToReferenceDraft({
      id: 'x2000',
      type: 'article-journal',
      title: 'A paper',
      issued,
    });

  it('reads a year from numeric and string date-parts alike', () => {
    // Zotero's Web API emits numbers; the field codes embedded in a .docx emit
    // strings. Both are valid CSL-JSON and both must keep the year.
    expect(dated({ 'date-parts': [[2000]] }).year).toBe(2000);
    expect(dated({ 'date-parts': [['2000']] }).year).toBe(2000);
    expect(dated({ 'date-parts': [['2000', '3', '15']] }).year).toBe(2000);
  });

  it('returns null for a non-numeric or absent year', () => {
    expect(dated({ 'date-parts': [['n.d.']] }).year).toBeNull();
    expect(dated({ 'date-parts': [['in press']] }).year).toBeNull();
    expect(dated({ 'date-parts': [[]] }).year).toBeNull();
    expect(dated({ raw: '2000' }).year).toBeNull();
    expect(dated(undefined).year).toBeNull();
  });

  it('keeps numeric string-ish fields that CSL allows as numbers', () => {
    const draft = cslItemToReferenceDraft({
      id: 12345,
      type: 'article-journal',
      title: 'A paper',
      volume: 19,
      issue: 4,
      page: 123,
    });
    expect(draft.citationKey).toBe('12345');
    expect(draft.volume).toBe('19');
    expect(draft.issue).toBe('4');
    expect(draft.pages).toBe('123');
  });

  it('gives string-year items distinct generated citation keys', () => {
    // Before the fix every string year read as null, so each key degraded to
    // "<family>nd" and the whole bibliography collided on one key.
    const drafts = [
      { family: 'Li', year: '2017' },
      { family: 'Manisalidis', year: '2020' },
      { family: 'Pehoiu', year: '2008' },
    ].map(({ family, year }) =>
      cslItemToReferenceDraft({
        type: 'article-journal',
        title: `Paper by ${family}`,
        author: [{ family, given: 'A' }],
        issued: { 'date-parts': [[year]] },
      }),
    );

    const { added } = dedupeReferenceDrafts([], drafts);

    expect(added.map((draft) => draft.citationKey)).toEqual([
      'li2017',
      'manisalidis2020',
      'pehoiu2008',
    ]);
  });

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
