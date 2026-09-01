import { cslItemToReferenceDraft } from '@/local-db/research/manuscript/manuscriptReferenceImport';
import {
  arxivAtomToCslItem,
  arxivDoi,
  classifyReferenceIdentifier,
  classifyReferenceIdentifiers,
  htmlMetaToCslItem,
  isResolvedBeyondUrl,
  isValidIsbn,
  ncbiSummaryToCslItem,
  normalizeIsbn,
  openLibraryToCslItem,
  webpageCslItem,
} from '@/local-db/research/manuscript/manuscriptReferenceIdentifiers';

import {
  ARXIV_ATOM_ERROR_XML,
  ARXIV_ATOM_WITH_DOI_XML,
  ARXIV_ATOM_XML,
  BARE_HTML,
  DUBLIN_CORE_HTML,
  HIGHWIRE_HTML,
  OPEN_GRAPH_HTML,
  OPEN_LIBRARY_PAYLOAD,
  PMC_ESUMMARY_PAYLOAD,
  PUBMED_ESUMMARY_NOT_FOUND_PAYLOAD,
  PUBMED_ESUMMARY_PAYLOAD,
} from './fixtures/referenceIdentifierPayloads';

const kindOf = (input: string) => classifyReferenceIdentifier(input).kind;

describe('classifyReferenceIdentifier', () => {
  it('recognises a DOI bare, prefixed, and as a doi.org URL', () => {
    for (const input of [
      '10.1038/s41586-020-2649-2',
      'doi:10.1038/s41586-020-2649-2',
      'DOI: 10.1038/s41586-020-2649-2',
      'https://doi.org/10.1038/s41586-020-2649-2',
      'http://dx.doi.org/10.1038/s41586-020-2649-2',
    ]) {
      const identifier = classifyReferenceIdentifier(input);
      expect(identifier.kind).toBe('DOI');
      expect(identifier.value).toBe('10.1038/s41586-020-2649-2');
      expect(identifier.requestUrl).toBe(
        'https://doi.org/10.1038/s41586-020-2649-2',
      );
    }
  });

  it('recognises a PMID bare, prefixed, and as a pubmed URL', () => {
    for (const input of [
      '32109013',
      'PMID: 32109013',
      'pmid:32109013',
      'https://pubmed.ncbi.nlm.nih.gov/32109013/',
      'https://www.ncbi.nlm.nih.gov/pubmed/32109013',
    ]) {
      const identifier = classifyReferenceIdentifier(input);
      expect(identifier.kind).toBe('PMID');
      expect(identifier.value).toBe('32109013');
    }
    expect(classifyReferenceIdentifier('32109013').requestUrl).toBe(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=32109013&retmode=json&version=2.0',
    );
  });

  it('recognises a PMCID bare, prefixed, and as a PMC article URL', () => {
    for (const input of [
      'PMC7159299',
      'pmc7159299',
      'PMCID: PMC7159299',
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7159299/',
    ]) {
      const identifier = classifyReferenceIdentifier(input);
      expect(identifier.kind).toBe('PMCID');
      expect(identifier.value).toBe('PMC7159299');
    }
    // db=pmc keys on the bare number, so the prefix must be dropped.
    expect(classifyReferenceIdentifier('PMC7159299').requestUrl).toContain(
      'db=pmc&id=7159299',
    );
  });

  it('recognises new-style and old-style arXiv ids, with versions', () => {
    expect(kindOf('2401.00001')).toBe('ARXIV');
    expect(kindOf('arXiv:2401.00001')).toBe('ARXIV');
    expect(kindOf('arxiv:2401.00001v2')).toBe('ARXIV');
    expect(kindOf('hep-th/9901001')).toBe('ARXIV');
    expect(kindOf('math.GT/0309136')).toBe('ARXIV');
    expect(kindOf('https://arxiv.org/abs/2401.00001')).toBe('ARXIV');
    expect(
      classifyReferenceIdentifier('https://arxiv.org/pdf/2401.00001v2.pdf')
        .value,
    ).toBe('2401.00001v2');
    expect(classifyReferenceIdentifier('2401.00001').requestUrl).toBe(
      'https://export.arxiv.org/api/query?id_list=2401.00001&max_results=1',
    );
  });

  it('recognises an ISBN with and without hyphens, in both lengths', () => {
    expect(kindOf('9780306406157')).toBe('ISBN');
    expect(kindOf('978-0-306-40615-7')).toBe('ISBN');
    expect(kindOf('0306406152')).toBe('ISBN');
    expect(kindOf('0-306-40615-2')).toBe('ISBN');
    expect(kindOf('ISBN: 978-0-306-40615-7')).toBe('ISBN');
    expect(kindOf('ISBN-13: 9780306406157')).toBe('ISBN');
    expect(classifyReferenceIdentifier('978-0-306-40615-7').value).toBe(
      '9780306406157',
    );
    expect(classifyReferenceIdentifier('9780306406157').requestUrl).toBe(
      'https://openlibrary.org/api/books?bibkeys=ISBN:9780306406157&format=json&jscmd=data',
    );
  });

  it('recognises a URL and adds a scheme to a bare host', () => {
    expect(kindOf('https://example.org/paper')).toBe('URL');
    expect(kindOf('http://example.org/paper')).toBe('URL');
    const bare = classifyReferenceIdentifier('www.example.org/paper');
    expect(bare.kind).toBe('URL');
    expect(bare.value).toBe('https://www.example.org/paper');
    expect(bare.requestUrl).toBe('https://www.example.org/paper');
  });

  describe('near misses', () => {
    it('reads a DOI whose suffix is an ISBN as a DOI', () => {
      const identifier = classifyReferenceIdentifier('10.1000/9780306406157');
      expect(identifier.kind).toBe('DOI');
      expect(identifier.value).toBe('10.1000/9780306406157');
    });

    it('reads the arXiv DOI as a DOI, not an arXiv id', () => {
      expect(kindOf('10.48550/arXiv.2401.00001')).toBe('DOI');
      expect(kindOf('https://doi.org/10.48550/arXiv.2401.00001')).toBe('DOI');
    });

    it('reads a page that merely mentions arxiv as a URL', () => {
      expect(kindOf('https://blog.example.com/why-arxiv-is-great')).toBe('URL');
      expect(kindOf('https://example.com/arxiv/2401.00001')).toBe('URL');
    });

    it('reads a pubmed-shaped URL on another host as a URL', () => {
      expect(kindOf('https://example.com/pubmed/32109013')).toBe('URL');
    });

    it('rejects a ten- or thirteen-digit number with a bad check digit', () => {
      expect(kindOf('9780306406158')).toBe('UNKNOWN');
      expect(kindOf('0306406153')).toBe('UNKNOWN');
    });

    it('does not read a long number as a PMID', () => {
      // PubMed has not reached nine digits, so this is neither PMID nor ISBN.
      expect(kindOf('123456789')).toBe('UNKNOWN');
    });

    it('does not read a reference-list line as a URL', () => {
      expect(kindOf('Bond, T. C., and Doherty, S. J. (2013). Title.')).toBe(
        'UNKNOWN',
      );
      expect(kindOf('Nature Materials, 19, 123-130.')).toBe('UNKNOWN');
    });

    it('returns UNKNOWN for junk and empty input, with no request URL', () => {
      for (const input of ['', '   ', 'not a reference', '???', '10.']) {
        const identifier = classifyReferenceIdentifier(input);
        expect(identifier.kind).toBe('UNKNOWN');
        expect(identifier.requestUrl).toBe('');
      }
    });

    it('keeps the raw input so an error can quote it', () => {
      expect(classifyReferenceIdentifier('  PMID: 32109013 ').raw).toBe(
        'PMID: 32109013',
      );
    });
  });
});

describe('classifyReferenceIdentifiers', () => {
  it('classifies one identifier per line and skips blanks and bullets', () => {
    const identifiers = classifyReferenceIdentifiers(
      [
        '10.1038/s41586-020-2649-2',
        '',
        '- PMID: 32109013',
        '2. arXiv:2401.00001',
        '   ',
        '978-0-306-40615-7',
        'https://example.org/page',
        'gibberish',
      ].join('\n'),
    );
    expect(identifiers.map((identifier) => identifier.kind)).toEqual([
      'DOI',
      'PMID',
      'ARXIV',
      'ISBN',
      'URL',
      'UNKNOWN',
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(
      classifyReferenceIdentifiers('10.1038/nature12373\r\nPMC123\r\n').map(
        (identifier) => identifier.kind,
      ),
    ).toEqual(['DOI', 'PMCID']);
  });
});

describe('isValidIsbn / normalizeIsbn', () => {
  it('validates both ISBN lengths and the X check digit', () => {
    expect(isValidIsbn('9780306406157')).toBe(true);
    expect(isValidIsbn('0306406152')).toBe(true);
    expect(isValidIsbn('080442957X')).toBe(true);
    expect(isValidIsbn('9780306406158')).toBe(false);
    expect(isValidIsbn('12345')).toBe(false);
  });

  it('strips hyphens, spaces, and upper-cases the check digit', () => {
    expect(normalizeIsbn('0-8044-2957-x')).toBe('080442957X');
  });
});

describe('arxivDoi', () => {
  it('builds the arXiv-minted DOI and drops the version', () => {
    expect(arxivDoi('2401.00001')).toBe('10.48550/arXiv.2401.00001');
    expect(arxivDoi('2401.00001v3')).toBe('10.48550/arXiv.2401.00001');
  });
});

describe('ncbiSummaryToCslItem', () => {
  it('maps a PubMed esummary docsum to a CSL item', () => {
    const item = ncbiSummaryToCslItem({
      payload: PUBMED_ESUMMARY_PAYLOAD,
      id: '32109013',
      kind: 'PMID',
    });
    expect(item).not.toBeNull();
    expect(item?.type).toBe('article-journal');
    expect(item?.title).toBe(
      'Clinical course and risk factors for mortality of adult inpatients',
    );
    expect(item?.['container-title']).toBe('Lancet (London, England)');
    expect(item?.volume).toBe('395');
    expect(item?.issue).toBe('10229');
    expect(item?.DOI).toBe('10.1016/S0140-6736(20)30566-3');
    expect(item?.PMID).toBe('32109013');
    expect(item?.issued).toEqual({ 'date-parts': [[2020, 3, 15]] });
    expect(item?.URL).toBe('https://pubmed.ncbi.nlm.nih.gov/32109013/');
  });

  it('splits NCBI "Family Initials" names and keeps a collective author whole', () => {
    const item = ncbiSummaryToCslItem({
      payload: PUBMED_ESUMMARY_PAYLOAD,
      id: '32109013',
      kind: 'PMID',
    });
    expect(item?.author).toEqual([
      { family: 'Zhou', given: 'F' },
      { family: 'van der Berg', given: 'AB' },
      { literal: 'WHO Rapid Evidence Appraisal Group' },
    ]);
  });

  it('expands the elided page range NCBI reports', () => {
    const item = ncbiSummaryToCslItem({
      payload: PUBMED_ESUMMARY_PAYLOAD,
      id: '32109013',
      kind: 'PMID',
    });
    // esummary says "1054-62"; the paper prints 1054-1062.
    expect(item?.page).toBe('1054-1062');
  });

  it('maps a PMC esummary docsum and falls back to `source` for the journal', () => {
    const item = ncbiSummaryToCslItem({
      payload: PMC_ESUMMARY_PAYLOAD,
      id: 'PMC7159299',
      kind: 'PMCID',
    });
    expect(item?.['container-title']).toBe('Lancet');
    expect(item?.PMCID).toBe('PMC7159299');
    expect(item?.URL).toBe(
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7159299/',
    );
  });

  it('returns null when esummary reports an error or the shape is wrong', () => {
    expect(
      ncbiSummaryToCslItem({
        payload: PUBMED_ESUMMARY_NOT_FOUND_PAYLOAD,
        id: '999999999',
        kind: 'PMID',
      }),
    ).toBeNull();
    expect(
      ncbiSummaryToCslItem({ payload: null, id: '1', kind: 'PMID' }),
    ).toBeNull();
    expect(
      ncbiSummaryToCslItem({ payload: { error: 'x' }, id: '1', kind: 'PMID' }),
    ).toBeNull();
  });

  it('feeds straight into cslItemToReferenceDraft', () => {
    const item = ncbiSummaryToCslItem({
      payload: PUBMED_ESUMMARY_PAYLOAD,
      id: '32109013',
      kind: 'PMID',
    });
    const draft = cslItemToReferenceDraft(item as Record<string, unknown>);
    expect(draft.cslType).toBe('ARTICLE_JOURNAL');
    expect(draft.year).toBe(2020);
    expect(draft.authors).toBe(
      'Zhou, F; van der Berg, AB; WHO Rapid Evidence Appraisal Group',
    );
    expect(draft.doi).toBe('10.1016/S0140-6736(20)30566-3');
  });
});

describe('arxivAtomToCslItem', () => {
  it('maps an arXiv Atom entry to a preprint CSL item', () => {
    const item = arxivAtomToCslItem(ARXIV_ATOM_XML);
    expect(item?.type).toBe('article');
    expect(item?.title).toBe('Scaling Laws for Sparse Attention');
    expect(item?.author).toEqual([
      { family: 'Smith', given: 'Jane Q.' },
      { family: 'Doe', given: 'Alan' },
    ]);
    expect(item?.issued).toEqual({ 'date-parts': [[2024, 1, 1]] });
    expect(item?.number).toBe('arXiv:2401.00001v2');
    expect(item?.URL).toBe('https://arxiv.org/abs/2401.00001v2');
    expect(item?.['container-title']).toBe(
      'J. Mach. Learn. Res. 25 (2024) 1-40',
    );
  });

  it('falls back to the arXiv-minted DOI when the entry has none', () => {
    expect(arxivAtomToCslItem(ARXIV_ATOM_XML)?.DOI).toBe(
      '10.48550/arXiv.2401.00001',
    );
  });

  it("prefers the publisher's DOI when the preprint was published", () => {
    const item = arxivAtomToCslItem(ARXIV_ATOM_WITH_DOI_XML);
    expect(item?.DOI).toBe('10.1103/PhysRevD.60.000000');
    expect(item?.number).toBe('arXiv:hep-th/9901001v1');
  });

  it("returns null for arXiv's error feed and for unparseable XML", () => {
    expect(arxivAtomToCslItem(ARXIV_ATOM_ERROR_XML)).toBeNull();
    expect(arxivAtomToCslItem('<feed></feed>')).toBeNull();
    expect(arxivAtomToCslItem('not xml at all')).toBeNull();
  });

  it('maps to a PREPRINT reference draft', () => {
    const draft = cslItemToReferenceDraft(
      arxivAtomToCslItem(ARXIV_ATOM_XML) as Record<string, unknown>,
    );
    expect(draft.cslType).toBe('PREPRINT');
    expect(draft.year).toBe(2024);
  });
});

describe('openLibraryToCslItem', () => {
  it('maps an OpenLibrary record to a book CSL item', () => {
    const item = openLibraryToCslItem({
      payload: OPEN_LIBRARY_PAYLOAD,
      isbn: '0306406152',
    });
    expect(item?.type).toBe('book');
    expect(item?.title).toBe('Slaughterhouse-five: or, The Children’s Crusade');
    expect(item?.author).toEqual([{ family: 'Vonnegut', given: 'Kurt' }]);
    expect(item?.publisher).toBe('Dial Press');
    expect(item?.['publisher-place']).toBe('New York');
    expect(item?.['number-of-pages']).toBe('215');
    expect(item?.ISBN).toBe('0306406152');
  });

  it('reads the year out of a prose publish date', () => {
    expect(
      openLibraryToCslItem({
        payload: OPEN_LIBRARY_PAYLOAD,
        isbn: '0306406152',
      })?.issued,
    ).toEqual({ 'date-parts': [[1999]] });
  });

  it('returns null for the empty reply OpenLibrary sends for an unknown ISBN', () => {
    expect(
      openLibraryToCslItem({ payload: {}, isbn: '0306406152' }),
    ).toBeNull();
    expect(
      openLibraryToCslItem({ payload: null, isbn: '0306406152' }),
    ).toBeNull();
  });

  it('maps to a BOOK reference draft', () => {
    const draft = cslItemToReferenceDraft(
      openLibraryToCslItem({
        payload: OPEN_LIBRARY_PAYLOAD,
        isbn: '0306406152',
      }) as Record<string, unknown>,
    );
    expect(draft.cslType).toBe('BOOK');
    expect(draft.year).toBe(1999);
  });
});

describe('webpageCslItem', () => {
  it('always produces a citable webpage with the URL and the accessed date', () => {
    const item = webpageCslItem({
      url: 'https://example.org/page',
      accessedOn: new Date('2026-08-26T10:00:00Z'),
    });
    expect(item.type).toBe('webpage');
    expect(item.title).toBe('https://example.org/page');
    expect(item.accessed).toEqual({ 'date-parts': [[2026, 8, 26]] });
  });
});

describe('htmlMetaToCslItem', () => {
  const accessedOn = new Date('2026-08-26T10:00:00Z');

  it('takes one vocabulary, not both, when a page carries Highwire and Dublin Core', () => {
    // Publishers routinely emit both for the same people. Concatenating them
    // imported every author twice, because the element-level dedupe cannot see
    // that two different tags name one person.
    const item = htmlMetaToCslItem({
      html: [
        '<html><head>',
        '<meta name="citation_title" content="Absorption closure over four sites">',
        '<meta name="citation_author" content="Jalil, Ahmad">',
        '<meta name="citation_author" content="Kazemian, Hossein">',
        '<meta name="DC.creator" content="Jalil, Ahmad">',
        '<meta name="DC.creator" content="Kazemian, Hossein">',
        '</head><body></body></html>',
      ].join(''),
      url: 'https://example.org/article',
      accessedOn,
    });

    expect(item.author).toHaveLength(2);
  });

  it('falls back to Dublin Core when a page carries no Highwire authors', () => {
    const item = htmlMetaToCslItem({
      html: [
        '<html><head>',
        '<meta name="DC.title" content="A repository record">',
        '<meta name="DC.creator" content="Jalil, Ahmad">',
        '</head><body></body></html>',
      ].join(''),
      url: 'https://repository.example.org/item/1',
      accessedOn,
    });

    expect(item.author).toHaveLength(1);
  });

  it('reads Highwire citation_* tags into a journal article', () => {
    const item = htmlMetaToCslItem({
      html: HIGHWIRE_HTML,
      url: 'https://agupubs.example.org/doi/10.1002/jgrd.50171',
      accessedOn,
    });
    expect(item.type).toBe('article-journal');
    expect(item.title).toBe(
      'Bounding the role of black carbon in the climate system',
    );
    expect(item['container-title']).toBe(
      'Journal of Geophysical Research: Atmospheres',
    );
    expect(item.author).toEqual([
      { family: 'Bond', given: 'Tami C.' },
      { family: 'Doherty', given: 'Sarah J.' },
    ]);
    expect(item.issued).toEqual({ 'date-parts': [[2013, 6, 6]] });
    expect(item.volume).toBe('118');
    expect(item.issue).toBe('11');
    expect(item.page).toBe('5380-5552');
    expect(item.DOI).toBe('10.1002/jgrd.50171');
    expect(item.accessed).toEqual({ 'date-parts': [[2026, 8, 26]] });
  });

  it('reads Dublin Core tags and strips a doi: prefix off the identifier', () => {
    const item = htmlMetaToCslItem({
      html: DUBLIN_CORE_HTML,
      url: 'https://repository.example.org/item/123',
      accessedOn,
    });
    expect(item.title).toBe('A thesis on aerosols');
    expect(item.author).toEqual([{ family: 'Lovelace', given: 'Ada' }]);
    expect(item.issued).toEqual({ 'date-parts': [[2011]] });
    expect(item.DOI).toBe('10.5555/thesis-123');
    // No journal named itself, so this stays a webpage.
    expect(item.type).toBe('webpage');
    expect(item['container-title']).toBe('University of Somewhere');
  });

  it('falls back to OpenGraph for a page with no bibliographic tags', () => {
    const item = htmlMetaToCslItem({
      html: OPEN_GRAPH_HTML,
      url: 'https://blog.example.com/why-arxiv-is-great',
      accessedOn,
    });
    expect(item.type).toBe('webpage');
    expect(item.title).toBe('Why arXiv is great');
    expect(item['container-title']).toBe('Some Blog');
    expect(item.issued).toEqual({ 'date-parts': [[2022, 9, 14]] });
  });

  it('falls back to the URL itself when the page says nothing', () => {
    const item = htmlMetaToCslItem({
      html: BARE_HTML,
      url: 'https://example.org/opaque',
      accessedOn,
    });
    expect(item.type).toBe('webpage');
    expect(item.title).toBe('https://example.org/opaque');
    expect(item.URL).toBe('https://example.org/opaque');
    expect(isResolvedBeyondUrl(item)).toBe(false);
  });

  it('reports a page that gave real metadata as resolved', () => {
    expect(
      isResolvedBeyondUrl(
        htmlMetaToCslItem({
          html: HIGHWIRE_HTML,
          url: 'https://agupubs.example.org/doi/10.1002/jgrd.50171',
          accessedOn,
        }),
      ),
    ).toBe(true);
  });

  it('maps to a WEBPAGE reference draft carrying the URL', () => {
    const draft = cslItemToReferenceDraft(
      htmlMetaToCslItem({
        html: OPEN_GRAPH_HTML,
        url: 'https://blog.example.com/why-arxiv-is-great',
        accessedOn,
      }),
    );
    expect(draft.cslType).toBe('WEBPAGE');
    expect(draft.url).toBe('https://blog.example.com/why-arxiv-is-great');
    expect(draft.name).toBe('Why arXiv is great');
  });
});
