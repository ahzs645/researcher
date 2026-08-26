import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { exportManuscriptToHtml } from '@/local-db/research/manuscript/manuscriptHtmlExport';
import {
  buildManuscriptDiscoveryFacts,
  manuscriptJsonLdDocument,
} from '@/local-db/research/manuscript/manuscriptHtmlMetadata';
import { htmlMetaToCslItem } from '@/local-db/research/manuscript/manuscriptReferenceIdentifiers';

// The structured block the composer stores on the manuscript record: two
// ORCIDs, a ROR-identified institution with its address, and a funded award.
const CONTRIBUTOR_METADATA = JSON.stringify({
  authors: [
    {
      authorId: 'author-1',
      name: 'Jalil, A.',
      orcid: '0000-0002-1825-0097',
      email: 'jalil@example.edu',
      creditRoles: ['Conceptualization', 'Writing – original draft'],
    },
    {
      authorId: 'author-2',
      name: 'Kazemian, H.',
      orcid: '0000-0001-5109-3700',
    },
  ],
  affiliations: [
    {
      affiliationId: 'affiliation-1',
      name: 'University of Northern British Columbia',
      ror: '0213rcc28',
      city: 'Prince George',
      state: 'British Columbia',
      country: 'Canada',
    },
  ],
  funding: [
    {
      id: 'award-1',
      funder: 'Natural Sciences and Engineering Research Council of Canada',
      funderIdentifier: '01h531d29',
      awardId: 'RGPIN-2021-03948',
      recipientAuthorIds: ['author-1'],
    },
  ],
});

const input: BuildBundleInput = {
  manuscript: {
    id: 'm1',
    name: 'Particulate bound metals downtown',
    doi: '10.1234/aqj.2026.7',
    authorLine: 'Jalil, A. [1*]; Kazemian, H. [2]',
    affiliations: [
      '1 University of Northern British Columbia',
      '2 Simon Fraser University',
    ].join('\n'),
    contributorMetadata: CONTRIBUTOR_METADATA,
  },
  style: {
    name: 'Journal of Air Quality',
    citationMode: 'NUMERIC',
    tableStyle: 'ACADEMIC',
  },
  sections: [
    {
      id: 's-abs',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'Metals in urban air were sampled over one winter.',
    },
    {
      id: 's-kw',
      name: 'Keywords',
      sectionType: 'KEYWORDS',
      placement: 'FRONT_MATTER',
      orderIndex: 1,
      content: 'urban air quality; trace metals; hazard index',
    },
    {
      id: 's-results',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content: 'Copper dominated.',
    },
  ],
  figures: [],
  references: [],
};

// A manuscript with nothing filled in but a title: no DOI, no journal, no
// abstract, no keywords, no structured contributor block.
const bareInput: BuildBundleInput = {
  manuscript: { id: 'm2', name: 'Untitled draft', authorLine: 'Jalil, A.' },
  style: { citationMode: 'NUMERIC' },
  sections: [
    {
      id: 's1',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 0,
      content: 'Copper dominated.',
    },
  ],
  figures: [],
  references: [],
};

const parseHtml = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html');

const metaValues = (html: string, name: string): string[] =>
  [...parseHtml(html).querySelectorAll(`meta[name="${name}" i]`)].map(
    (element) => element.getAttribute('content') ?? '',
  );

const metaValue = (html: string, name: string): string | undefined =>
  metaValues(html, name)[0];

// Read the graph the way a browser does — off the parsed document — so the
// test proves the whole payload survived the HTML tokenizer, not just that the
// string we wrote happens to be valid JSON.
const jsonLd = (html: string): Record<string, unknown> => {
  const block = parseHtml(html).querySelector(
    'script[type="application/ld+json"]',
  );
  expect(block).not.toBeNull();
  return JSON.parse(block?.textContent ?? '') as Record<string, unknown>;
};

describe('self-contained HTML discovery metadata', () => {
  let html = '';

  beforeAll(async () => {
    html = await exportManuscriptToHtml(buildManuscriptBundle(input));
  });

  it('emits the Highwire tags Google Scholar and Zotero read', () => {
    expect(metaValue(html, 'citation_title')).toBe(
      'Particulate bound metals downtown',
    );
    // Byline order, and the parsed name rather than the raw "Jalil, A. [1*]".
    expect(metaValues(html, 'citation_author')).toEqual([
      'Jalil, A.',
      'Kazemian, H.',
    ]);
    expect(metaValues(html, 'citation_author_institution')).toEqual([
      'University of Northern British Columbia',
      'Simon Fraser University',
    ]);
    expect(metaValues(html, 'citation_author_orcid')).toEqual([
      'https://orcid.org/0000-0002-1825-0097',
      'https://orcid.org/0000-0001-5109-3700',
    ]);
    expect(metaValue(html, 'citation_journal_title')).toBe(
      'Journal of Air Quality',
    );
    expect(metaValue(html, 'citation_doi')).toBe('10.1234/aqj.2026.7');
    expect(metaValue(html, 'citation_abstract_html_url')).toBe(
      'https://doi.org/10.1234/aqj.2026.7',
    );
    expect(metaValue(html, 'citation_keywords')).toBe(
      'urban air quality; trace metals; hazard index',
    );
  });

  it("keeps each author's institution and ORCID next to that author", () => {
    // Highwire is positional: an institution belongs to the citation_author
    // above it, so a reader that walks the tags in document order must not see
    // the second author's institution attributed to the first.
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? '';
    const names = [...head.matchAll(/<meta name="(citation_[a-z_]+)"/g)].map(
      (match) => match[1],
    );
    const firstAuthor = names.indexOf('citation_author');
    expect(names.slice(firstAuthor, firstAuthor + 6)).toEqual([
      'citation_author',
      'citation_author_institution',
      'citation_author_orcid',
      'citation_author',
      'citation_author_institution',
      'citation_author_orcid',
    ]);
  });

  it('emits the Dublin Core tags repository software reads', () => {
    expect(metaValue(html, 'DC.title')).toBe(
      'Particulate bound metals downtown',
    );
    expect(metaValues(html, 'DC.creator')).toEqual([
      'Jalil, A.',
      'Kazemian, H.',
    ]);
    expect(metaValue(html, 'DC.source')).toBe('Journal of Air Quality');
    expect(metaValue(html, 'DC.description')).toBe(
      'Metals in urban air were sampled over one winter.',
    );
    expect(metaValues(html, 'DC.subject')).toEqual([
      'urban air quality',
      'trace metals',
      'hazard index',
    ]);
    expect(metaValue(html, 'DC.identifier')).toBe(
      'https://doi.org/10.1234/aqj.2026.7',
    );
  });

  it('types the document as a schema.org ScholarlyArticle', () => {
    const graph = jsonLd(html);

    expect(graph['@context']).toBe('https://schema.org');
    expect(graph['@type']).toBe('ScholarlyArticle');
    expect(graph.headline).toBe('Particulate bound metals downtown');
    expect(graph.identifier).toBe('https://doi.org/10.1234/aqj.2026.7');
    expect(graph.url).toBe('https://doi.org/10.1234/aqj.2026.7');
    expect(graph.isPartOf).toEqual({
      '@type': 'Periodical',
      name: 'Journal of Air Quality',
    });
    expect(graph.keywords).toEqual([
      'urban air quality',
      'trace metals',
      'hazard index',
    ]);
    expect(graph.author).toEqual([
      {
        '@type': 'Person',
        name: 'Jalil, A.',
        identifier: 'https://orcid.org/0000-0002-1825-0097',
        email: 'jalil@example.edu',
        affiliation: [
          {
            '@type': 'Organization',
            name: 'University of Northern British Columbia',
            identifier: 'https://ror.org/0213rcc28',
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Prince George',
              addressRegion: 'British Columbia',
              addressCountry: 'Canada',
            },
          },
        ],
      },
      {
        '@type': 'Person',
        name: 'Kazemian, H.',
        identifier: 'https://orcid.org/0000-0001-5109-3700',
        affiliation: [
          { '@type': 'Organization', name: 'Simon Fraser University' },
        ],
      },
    ]);
    expect(graph.funder).toEqual([
      {
        '@type': 'Organization',
        name: 'Natural Sciences and Engineering Research Council of Canada',
        identifier: 'https://ror.org/01h531d29',
      },
    ]);
    expect(graph.funding).toEqual([
      {
        '@type': 'Grant',
        identifier: 'RGPIN-2021-03948',
        funder: {
          '@type': 'Organization',
          name: 'Natural Sciences and Engineering Research Council of Canada',
          identifier: 'https://ror.org/01h531d29',
        },
      },
    ]);
  });

  it('reads its own head back through the app reference importer', () => {
    // The cheapest correctness test there is: the tags this exporter writes
    // are the tags `htmlMetaToCslItem` already reads off other people's pages.
    const item = htmlMetaToCslItem({
      html,
      url: 'https://example.org/preprint.html',
      accessedOn: new Date('2026-08-26T10:00:00Z'),
    });

    expect(item.title).toBe('Particulate bound metals downtown');
    expect(item.DOI).toBe('10.1234/aqj.2026.7');
    expect(item.type).toBe('article-journal');
    expect(item['container-title']).toBe('Journal of Air Quality');
    // The importer concatenates the Highwire, Dublin Core and generic author
    // tags without deduplicating them, so the same person arrives once per
    // vocabulary; what this export guarantees is the set and its order.
    const names = (item.author as { family: string; given: string }[]).map(
      (author) => `${author.family}, ${author.given}`,
    );
    expect([...new Set(names)]).toEqual(['Jalil, A.', 'Kazemian, H.']);
    expect(names.slice(0, 2)).toEqual(['Jalil, A.', 'Kazemian, H.']);
  });

  it('omits a tag rather than emitting an empty value', async () => {
    const bare = await exportManuscriptToHtml(buildManuscriptBundle(bareInput));
    const head = /<head>([\s\S]*?)<\/head>/.exec(bare)?.[1] ?? '';

    // An empty citation_doi does not mean "unknown", it means "no DOI" — a
    // claim about the paper that would be wrong.
    for (const name of [
      'citation_doi',
      'citation_abstract_html_url',
      'citation_journal_title',
      'citation_keywords',
      'citation_author_orcid',
      'citation_author_institution',
      'DC.identifier',
      'DC.source',
      'DC.description',
      'DC.subject',
    ]) {
      expect(metaValues(bare, name)).toEqual([]);
    }
    expect(head).not.toContain('content=""');
    // What it does have is what it knows.
    expect(metaValue(bare, 'citation_title')).toBe('Untitled draft');
    expect(metaValues(bare, 'citation_author')).toEqual(['Jalil, A.']);

    const graph = jsonLd(bare);
    expect(graph).not.toHaveProperty('identifier');
    expect(graph).not.toHaveProperty('url');
    expect(graph).not.toHaveProperty('isPartOf');
    expect(graph).not.toHaveProperty('abstract');
    expect(graph).not.toHaveProperty('keywords');
    expect(graph).not.toHaveProperty('funder');
    expect(graph).not.toHaveProperty('funding');
    expect(graph.author).toEqual([{ '@type': 'Person', name: 'Jalil, A.' }]);
    expect(Object.values(graph)).not.toContain(null);
    expect(Object.values(graph)).not.toContain('');
  });

  it('drops an identifier that fails its own validator', async () => {
    const mistyped = await exportManuscriptToHtml(
      buildManuscriptBundle({
        ...input,
        manuscript: {
          ...input.manuscript,
          // Not a DOI at all — what an author types before one is assigned.
          doi: 'to be assigned on acceptance',
          contributorMetadata: JSON.stringify({
            authors: [
              {
                authorId: 'author-1',
                name: 'Jalil, A.',
                // One digit off: a valid shape whose checksum fails.
                orcid: '0000-0002-1825-0098',
              },
            ],
            affiliations: [
              {
                affiliationId: 'affiliation-1',
                name: 'University of Northern British Columbia',
                ror: 'https://ror.org/not-a-ror-id',
              },
            ],
            funding: [{ id: 'award-1', awardId: 'RGPIN-2021-03948' }],
          }),
        },
      }),
    );

    expect(metaValues(mistyped, 'citation_doi')).toEqual([]);
    expect(metaValues(mistyped, 'citation_abstract_html_url')).toEqual([]);
    expect(metaValues(mistyped, 'DC.identifier')).toEqual([]);
    expect(metaValues(mistyped, 'citation_author_orcid')).toEqual([]);
    // The author and their institution are still named; only the broken
    // identifiers are missing.
    expect(metaValues(mistyped, 'citation_author')).toEqual([
      'Jalil, A.',
      'Kazemian, H.',
    ]);
    const graph = jsonLd(mistyped);
    expect(JSON.stringify(graph)).not.toContain('ror.org');
    expect(JSON.stringify(graph)).not.toContain('orcid.org');
    // An award with no funder named has no organization to attribute it to.
    expect(graph).not.toHaveProperty('funder');
    expect(graph).not.toHaveProperty('funding');
  });

  it('escapes quotes, ampersands and apostrophes in attribute values', async () => {
    const title = 'Metals & "particulates" in O\'Brien\'s air';
    const hostile = await exportManuscriptToHtml(
      buildManuscriptBundle({
        ...input,
        manuscript: {
          ...input.manuscript,
          name: title,
          authorLine: "O'Brien, S. & Smith, J.",
          affiliations: 'Ministry of Health & Long-Term Care',
          contributorMetadata: '',
        },
      }),
    );
    const head = /<head>([\s\S]*?)<\/head>/.exec(hostile)?.[1] ?? '';

    // The characters are neutralised in the source…
    expect(head).toContain('&amp;');
    expect(head).toContain('&quot;');
    expect(head).toContain('&#39;');
    // Every emitted tag is still exactly two well-formed attributes: nothing
    // in the title closed the quotes and started something of its own.
    for (const element of head.match(/<meta name="[^>]*>/g) ?? []) {
      expect(element).toMatch(/^<meta name="[^"]*" content="[^"]*">$/);
    }
    // …and a parser reads back exactly what the author typed.
    expect(metaValue(hostile, 'citation_title')).toBe(title);
    expect(metaValue(hostile, 'DC.title')).toBe(title);
    expect(metaValues(hostile, 'citation_author')).toEqual([
      "O'Brien, S.",
      'Smith, J.',
    ]);
    expect(metaValues(hostile, 'citation_author_institution')).toEqual([
      'Ministry of Health & Long-Term Care',
      'Ministry of Health & Long-Term Care',
    ]);
    expect(jsonLd(hostile).headline).toBe(title);
  });

  it('keeps a </script> in the abstract from ending the JSON-LD block', async () => {
    const abstract =
      'Levels rose </script><script>alert(1)</script> through winter & fell after.';
    const injected = await exportManuscriptToHtml(
      buildManuscriptBundle({
        ...input,
        sections: input.sections.map((section) =>
          section.id === 's-abs' ? { ...section, content: abstract } : section,
        ),
      }),
    );

    // One script element in the file, and it is the metadata block: the
    // attacker's tag never became a tag.
    expect(
      [...injected.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]),
    ).toEqual(['<script type="application/ld+json">']);
    expect(injected).not.toContain('<script>alert(1)</script>');
    // No raw `<` survives inside the block, so nothing in it can be markup.
    const block =
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
        injected,
      )?.[1] ?? '';
    expect(block).not.toContain('<');
    expect(block).toContain('\\u003c');
    // And it is still JSON, carrying the abstract verbatim.
    expect(jsonLd(injected).abstract).toBe(abstract);
    expect(metaValue(injected, 'DC.description')).toBe(abstract);
  });

  it('names a funder once however many of its awards paid for the work', () => {
    const facts = buildManuscriptDiscoveryFacts(
      buildManuscriptBundle({
        ...input,
        manuscript: {
          ...input.manuscript,
          contributorMetadata: JSON.stringify({
            funding: [
              {
                id: 'a1',
                funder: 'NSERC',
                funderIdentifier: '01h531d29',
                awardId: 'RGPIN-1',
              },
              {
                id: 'a2',
                funder: 'NSERC',
                funderIdentifier: '01h531d29',
                awardId: 'RGPIN-2',
              },
            ],
          }),
        },
      }),
    );
    const graph = manuscriptJsonLdDocument(facts);

    expect(graph.funder).toEqual([
      {
        '@type': 'Organization',
        name: 'NSERC',
        identifier: 'https://ror.org/01h531d29',
      },
    ]);
    // The two awards are still distinct grants.
    expect(
      (graph.funding as { identifier: string }[]).map(
        (grant) => grant.identifier,
      ),
    ).toEqual(['RGPIN-1', 'RGPIN-2']);
  });

  it('collapses a multi-line abstract into a single attribute value', () => {
    const facts = buildManuscriptDiscoveryFacts(
      buildManuscriptBundle({
        ...input,
        sections: input.sections.map((section) =>
          section.id === 's-abs'
            ? { ...section, content: 'First line.\n\nSecond line.' }
            : section,
        ),
      }),
    );

    expect(manuscriptJsonLdDocument(facts).abstract).toBe(
      'First line. Second line.',
    );
  });
});
