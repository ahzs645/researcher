import { parseBibtex } from '../manuscriptReferenceImport';
import {
  dedupeReferenceDrafts,
  generateCitationKey,
  normalizeDoi,
  referenceIdentity,
} from '../manuscriptReferenceStore';

describe('normalizeDoi', () => {
  it('reduces every DOI shape to a bare lower-cased id', () => {
    expect(normalizeDoi('10.1038/X')).toBe('10.1038/x');
    expect(normalizeDoi('https://doi.org/10.1038/X')).toBe('10.1038/x');
    expect(normalizeDoi('http://dx.doi.org/10.1038/x')).toBe('10.1038/x');
    expect(normalizeDoi('DOI: 10.1038/x')).toBe('10.1038/x');
    expect(normalizeDoi(null)).toBe('');
  });
});

describe('referenceIdentity', () => {
  it('prefers DOI, then citation key, then title+year', () => {
    expect(referenceIdentity({ doi: '10.1/A', citationKey: 'x', name: 't' })).toBe(
      'doi:10.1/a',
    );
    expect(referenceIdentity({ citationKey: 'Smith2020', name: 't' })).toBe(
      'key:smith2020',
    );
    expect(referenceIdentity({ name: 'Air Quality!', year: 2021 })).toBe(
      'title:air quality|2021',
    );
  });
});

describe('generateCitationKey', () => {
  it('builds <firstauthor><year> and disambiguates collisions', () => {
    const taken = new Set<string>();
    const a = generateCitationKey({ authors: 'Fuzzi, S.; Baltensperger, U.', year: 2015 }, taken);
    expect(a).toBe('fuzzi2015');
    taken.add(a);
    const b = generateCitationKey({ authors: 'Fuzzi, Sandro', year: 2015 }, taken);
    expect(b).toBe('fuzzi2015a');
  });

  it('handles missing author/year', () => {
    expect(generateCitationKey({ authors: null, year: null }, new Set())).toBe(
      'anonnd',
    );
  });
});

describe('dedupeReferenceDrafts', () => {
  const draft = (over: Record<string, unknown>) => ({
    name: 'T',
    citationKey: '',
    cslType: 'ARTICLE_JOURNAL',
    authors: 'Doe, J.',
    year: 2020,
    containerTitle: null,
    volume: null,
    issue: null,
    pages: null,
    doi: null,
    url: null,
    cslJson: '{}',
    ...over,
  });

  it('skips drafts already in the library (by DOI) and assigns keys', () => {
    const existing = [{ id: '1', doi: '10.1/a', citationKey: 'doe2019' }];
    const result = dedupeReferenceDrafts(existing as never, [
      draft({ doi: 'https://doi.org/10.1/A' }), // duplicate of existing
      draft({ doi: '10.2/b', authors: 'Fuzzi, S.', year: 2015 }), // new
    ]);
    expect(result.duplicateCount).toBe(1);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].doi).toBe('10.2/b');
    expect(result.added[0].citationKey).toBe('fuzzi2015');
  });

  it('de-duplicates within a single batch too', () => {
    const result = dedupeReferenceDrafts([], [
      draft({ doi: '10.1/a' }),
      draft({ doi: '10.1/A' }),
    ]);
    expect(result.added).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
  });

  it('disambiguates generated keys across the batch', () => {
    const result = dedupeReferenceDrafts([], [
      draft({ doi: '10.1/a', authors: 'Fuzzi, S.', year: 2015 }),
      draft({ doi: '10.2/b', authors: 'Fuzzi, X.', year: 2015 }),
    ]);
    expect(result.added.map((r) => r.citationKey)).toEqual([
      'fuzzi2015',
      'fuzzi2015a',
    ]);
  });
});

describe('parseBibtex stores structured CSL-JSON', () => {
  it('emits a non-empty CSL-JSON blob (not flat-only)', () => {
    const [draft] = parseBibtex(
      '@article{smith2020, title={A}, author={Smith, Jane and Doe, Alan}, journal={Nature}, year={2020}, volume={1}, pages={1--9}, doi={10.1/x}}',
    );
    const csl = JSON.parse(draft.cslJson as string);
    expect(csl.type).toBe('article-journal');
    expect(csl.author).toEqual([
      { family: 'Smith', given: 'Jane' },
      { family: 'Doe', given: 'Alan' },
    ]);
    expect(csl.issued).toEqual({ 'date-parts': [[2020]] });
    expect(csl['container-title']).toBe('Nature');
    expect(csl.page).toBe('1–9');
    expect(csl.DOI).toBe('10.1/x');
  });
});
