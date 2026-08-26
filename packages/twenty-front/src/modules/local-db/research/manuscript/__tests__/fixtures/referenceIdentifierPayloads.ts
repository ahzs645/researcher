// Recorded replies from the identifier resolvers, trimmed to the fields the
// readers touch plus enough neighbours to keep the shape honest. Tests read
// these instead of the network, so a change in our parsing shows up as a test
// failure rather than a bad reference in someone's bibliography.

// GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi
//     ?db=pubmed&id=32109013&retmode=json&version=2.0
export const PUBMED_ESUMMARY_PAYLOAD = {
  header: { type: 'esummary', version: '0.3' },
  result: {
    uids: ['32109013'],
    '32109013': {
      uid: '32109013',
      pubdate: '2020 Mar 15',
      epubdate: '2020 Feb 24',
      source: 'Lancet',
      authors: [
        { name: 'Zhou F', authtype: 'Author', clusterid: '' },
        { name: 'van der Berg AB', authtype: 'Author', clusterid: '' },
        {
          name: 'WHO Rapid Evidence Appraisal Group',
          authtype: 'CollectiveName',
        },
      ],
      title:
        'Clinical course and risk factors for mortality of adult inpatients.',
      volume: '395',
      issue: '10229',
      pages: '1054-62',
      fulljournalname: 'Lancet (London, England)',
      articleids: [
        { idtype: 'pubmed', value: '32109013' },
        { idtype: 'doi', value: '10.1016/S0140-6736(20)30566-3' },
        { idtype: 'pmc', value: 'PMC7159299' },
        { idtype: 'pmcid', value: 'pmc-id: PMC7159299;' },
      ],
      pubtype: ['Journal Article'],
    },
  },
};

// The shape esummary uses to report a bad id: HTTP 200, error in the docsum.
export const PUBMED_ESUMMARY_NOT_FOUND_PAYLOAD = {
  header: { type: 'esummary', version: '0.3' },
  result: {
    uids: ['999999999'],
    '999999999': {
      uid: '999999999',
      error: 'cannot get document summary',
    },
  },
};

// GET …/esummary.fcgi?db=pmc&id=7159299&retmode=json&version=2.0
export const PMC_ESUMMARY_PAYLOAD = {
  header: { type: 'esummary', version: '0.3' },
  result: {
    uids: ['7159299'],
    '7159299': {
      uid: '7159299',
      title:
        'Clinical course and risk factors for mortality of adult inpatients',
      authors: [{ name: 'Zhou F', authtype: 'Author' }],
      pubdate: '2020 Mar 28',
      source: 'Lancet',
      volume: '395',
      issue: '10229',
      pages: '1054-1062',
      fulljournalname: '',
      articleids: [
        { idtype: 'pmcid', value: 'PMC7159299' },
        { idtype: 'doi', value: '10.1016/S0140-6736(20)30566-3' },
        { idtype: 'pubmed', value: '32109013' },
      ],
    },
  },
};

// GET https://export.arxiv.org/api/query?id_list=2401.00001&max_results=1
export const ARXIV_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query: search_query=&amp;id_list=2401.00001</title>
  <entry>
    <id>http://arxiv.org/abs/2401.00001v2</id>
    <updated>2024-02-11T18:02:00Z</updated>
    <published>2024-01-01T09:15:33Z</published>
    <title>Scaling Laws for Sparse Attention</title>
    <summary>  We study how sparse attention behaves at scale.
</summary>
    <author><name>Jane Q. Smith</name></author>
    <author><name>Alan Doe</name></author>
    <arxiv:journal_ref xmlns:arxiv="http://arxiv.org/schemas/atom">J. Mach. Learn. Res. 25 (2024) 1-40</arxiv:journal_ref>
    <link href="http://arxiv.org/abs/2401.00001v2" rel="alternate" type="text/html"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.LG"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

// A preprint that was later published carries the publisher's own DOI.
export const ARXIV_ATOM_WITH_DOI_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/hep-th/9901001v1</id>
    <published>1999-01-01T00:00:00Z</published>
    <title>An old preprint</title>
    <author><name>Ada Lovelace</name></author>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1103/PhysRevD.60.000000</arxiv:doi>
  </entry>
</feed>`;

// arXiv reports an unknown id as a normal feed whose entry is the error.
export const ARXIV_ATOM_ERROR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/api/errors#incorrect_id_format</id>
    <title>Error</title>
    <summary>incorrect id format for not-an-id</summary>
  </entry>
</feed>`;

// GET https://openlibrary.org/api/books?bibkeys=ISBN:0306406152&format=json&jscmd=data
export const OPEN_LIBRARY_PAYLOAD = {
  'ISBN:0306406152': {
    url: 'https://openlibrary.org/books/OL7353617M/Slaughterhouse_five',
    key: '/books/OL7353617M',
    title: 'Slaughterhouse-five',
    subtitle: 'or, The Children’s Crusade',
    authors: [
      {
        url: 'https://openlibrary.org/authors/OL20289A/Kurt_Vonnegut',
        name: 'Kurt Vonnegut',
      },
    ],
    number_of_pages: 215,
    publishers: [{ name: 'Dial Press' }],
    publish_places: [{ name: 'New York' }],
    publish_date: 'January 12, 1999',
    identifiers: { isbn_10: ['0306406152'], openlibrary: ['OL7353617M'] },
  },
};

// A publisher landing page: Highwire `citation_*` tags.
export const HIGHWIRE_HTML = `<html><head>
<title>Bounding the role of black carbon | JGR Atmospheres</title>
<meta name="citation_title" content="Bounding the role of black carbon in the climate system">
<meta name="citation_author" content="Bond, Tami C.">
<meta name="citation_author" content="Doherty, Sarah J.">
<meta name="citation_journal_title" content="Journal of Geophysical Research: Atmospheres">
<meta name="citation_publication_date" content="2013/06/06">
<meta name="citation_volume" content="118">
<meta name="citation_issue" content="11">
<meta name="citation_firstpage" content="5380">
<meta name="citation_lastpage" content="5552">
<meta name="citation_doi" content="10.1002/jgrd.50171">
<meta name="citation_publisher" content="American Geophysical Union">
</head><body></body></html>`;

// A Dublin Core repository record.
export const DUBLIN_CORE_HTML = `<html><head>
<title>Repository item</title>
<meta name="DC.title" content="A thesis on aerosols">
<meta name="DC.creator" content="Ada Lovelace">
<meta name="DC.date" content="2011">
<meta name="DC.publisher" content="University of Somewhere">
<meta name="DC.identifier" content="doi:10.5555/thesis-123">
</head><body></body></html>`;

// A blog post: OpenGraph and a <title>, nothing bibliographic.
export const OPEN_GRAPH_HTML = `<html><head>
<title>Why arXiv is great — Some Blog</title>
<meta property="og:title" content="Why arXiv is great">
<meta property="og:site_name" content="Some Blog">
<meta property="article:published_time" content="2022-09-14T08:00:00Z">
</head><body></body></html>`;

// Nothing at all — the fetch succeeded but the page is opaque.
export const BARE_HTML = '<html><head></head><body>hello</body></html>';

// GET https://api.crossref.org/works/10.1016/j.jinf.2020.03.062
export const CROSSREF_RETRACTED_PAYLOAD = {
  status: 'ok',
  'message-type': 'work',
  message: {
    DOI: '10.1016/j.jinf.2020.03.062',
    title: ['A paper that was retracted'],
    'update-to': [
      {
        updated: {
          'date-parts': [[2020, 6, 4]],
          'date-time': '2020-06-04T00:00:00Z',
          timestamp: 1591228800000,
        },
        DOI: '10.1016/j.jinf.2020.05.062',
        type: 'retraction',
        label: 'Retraction',
      },
    ],
  },
};

// Corrected first, retracted later: the worst notice has to win.
export const CROSSREF_CORRECTED_THEN_RETRACTED_PAYLOAD = {
  status: 'ok',
  message: {
    DOI: '10.1000/corrected-then-retracted',
    title: ['A paper corrected and then retracted'],
    'update-to': [
      {
        updated: { 'date-parts': [[2018, 3, 1]] },
        DOI: '10.1000/corrigendum',
        type: 'corrigendum',
        label: 'Corrigendum',
      },
      {
        updated: { 'date-parts': [[2021, 11, 30]] },
        DOI: '10.1000/retraction',
        type: 'retraction',
        label: 'Retraction',
      },
    ],
  },
};

export const CROSSREF_EXPRESSION_OF_CONCERN_PAYLOAD = {
  status: 'ok',
  message: {
    DOI: '10.1000/concerning',
    title: ['A paper under an expression of concern'],
    'update-to': [
      {
        updated: { 'date-parts': [[2023, 1, 9]] },
        DOI: '10.1000/eoc',
        type: 'expression_of_concern',
      },
    ],
  },
};

export const CROSSREF_CLEAN_PAYLOAD = {
  status: 'ok',
  'message-type': 'work',
  message: {
    DOI: '10.1038/s41586-020-2649-2',
    title: ['Array programming with NumPy'],
    type: 'journal-article',
  },
};

// GET https://api.crossref.org/works?filter=doi:…,doi:…&select=DOI,update-to,title
export const CROSSREF_BATCH_PAYLOAD = {
  status: 'ok',
  'message-type': 'work-list',
  message: {
    'total-results': 2,
    items: [
      {
        DOI: '10.1016/J.JINF.2020.03.062',
        title: ['A paper that was retracted'],
        'update-to': [
          {
            updated: { 'date-parts': [[2020, 6, 4]] },
            DOI: '10.1016/j.jinf.2020.05.062',
            type: 'retraction',
            label: 'Retraction',
          },
        ],
      },
      {
        DOI: '10.1038/s41586-020-2649-2',
        title: ['Array programming with NumPy'],
      },
    ],
  },
};
