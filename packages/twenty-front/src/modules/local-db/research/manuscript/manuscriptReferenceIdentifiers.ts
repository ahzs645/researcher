import { isNonEmptyString } from '@sniptt/guards';

import { cslDatePartsYear, doiCslJsonUrl } from './manuscriptReferenceImport';

// Cite-by-identifier, the Manubot idea: the author pastes a *persistent
// identifier* and the metadata is fetched, so there is no bibliographic entry
// left to get wrong. This module is the pure half — recognise what was pasted,
// normalise it, say which URL answers it, and turn each API's reply into a CSL
// JSON item. The fetching lives in the component layer, which keeps every
// branch here testable with a recorded payload and no network.
//
// Everything ends as a CSL JSON item so it rejoins `cslItemToReferenceDraft`,
// the same adapter the DOI / BibTeX / Zotero paths already use — an identifier
// import is indistinguishable downstream.

export type ReferenceIdentifierKind =
  | 'DOI'
  | 'PMID'
  | 'PMCID'
  | 'ARXIV'
  | 'ISBN'
  | 'URL'
  | 'UNKNOWN';

export type ReferenceIdentifier = {
  kind: ReferenceIdentifierKind;
  // The identifier stripped of prefixes and host ("10.1038/x", "12345678",
  // "PMC1234567", "2401.00001", "9780306406157") — or the absolute URL.
  value: string;
  // The single URL whose response the matching reader below understands.
  // Empty for UNKNOWN, which has nothing to ask.
  requestUrl: string;
  // What the author actually pasted, so an error can quote them verbatim.
  raw: string;
};

export const REFERENCE_IDENTIFIER_LABELS: Record<
  ReferenceIdentifierKind,
  string
> = {
  DOI: 'DOI',
  PMID: 'PubMed ID',
  PMCID: 'PubMed Central ID',
  ARXIV: 'arXiv ID',
  ISBN: 'ISBN',
  URL: 'URL',
  UNKNOWN: 'unrecognised identifier',
};

// ── Request URLs ────────────────────────────────────────────────────────────

// NCBI E-utilities. esummary (rather than efetch) because its JSON docsum
// carries every field a CSL item needs, including the DOI under `articleids`,
// in one hop — the id-converter API would only get us the DOI and then need a
// second request to doi.org for the metadata.
const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export const pubmedSummaryUrl = (pmid: string): string =>
  `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json&version=2.0`;

// db=pmc keys on the bare number, so "PMC1234567" has to shed its prefix.
export const pmcSummaryUrl = (pmcid: string): string =>
  `${EUTILS_BASE}/esummary.fcgi?db=pmc&id=${encodeURIComponent(pmcid.replace(/^PMC/i, ''))}&retmode=json&version=2.0`;

export const arxivAtomUrl = (arxivId: string): string =>
  `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`;

// arXiv has minted a DataCite DOI for every paper since 2022, back-filled over
// the whole archive. It is the fallback when a browser blocks the Atom API:
// doi.org content negotiation is reachable from anywhere. The version suffix is
// not part of the DOI.
export const arxivDoi = (arxivId: string): string =>
  `10.48550/arXiv.${arxivId.replace(/v\d+$/i, '')}`;

// OpenLibrary rather than Crossref for ISBNs: Crossref indexes books only when
// the publisher deposited them, while OpenLibrary answers for trade titles too,
// and `jscmd=data` returns the fields a `book` CSL item wants.
export const openLibraryIsbnUrl = (isbn: string): string =>
  `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;

// ── Normalising ─────────────────────────────────────────────────────────────

const stripLabel = (input: string, label: RegExp): string | null => {
  const match = input.match(label);
  return match === null ? null : input.slice(match[0].length).trim();
};

const BARE_DOI = /^10\.\d{4,9}\/\S+$/;
// New-style arXiv ids are YYMM.NNNNN; the four-digit form predates 2015.
const BARE_ARXIV_NEW = /^\d{4}\.\d{4,5}(v\d+)?$/i;
// Old-style ids are archive[.subject]/YYMMNNN, e.g. hep-th/9901001.
const BARE_ARXIV_OLD = /^[a-z][a-z-]+(\.[a-z]{2})?\/\d{7}(v\d+)?$/i;
// PubMed has not yet reached nine digits, so anything longer is not a PMID —
// which is what keeps a 10- or 13-digit ISBN from being read as one.
const BARE_PMID = /^\d{1,8}$/;
const BARE_PMCID = /^PMC\d+$/i;
const ABSOLUTE_URL = /^https?:\/\/\S+$/i;
// A bare host with an optional path. Deliberately strict: a reference-list line
// ("Smith, J. (2020). Title.") also has dots, and must not become a URL.
const BARE_HOST_URL = /^(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/\S*|\?\S*|#\S*)?$/i;

export const normalizeIsbn = (input: string): string =>
  input.replace(/[\s-]/g, '').toUpperCase();

// ISBN-10 uses a modulo-11 check with X standing in for ten; ISBN-13 is the
// EAN-13 modulo-10 check. Verifying it is what separates a real ISBN from any
// other ten- or thirteen-digit number someone pasted.
export const isValidIsbn = (input: string): boolean => {
  const isbn = normalizeIsbn(input);
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (total, character, index) =>
        total + (character === 'X' ? 10 : Number(character)) * (10 - index),
      0,
    );
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (total, character, index) =>
        total + Number(character) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    return sum % 10 === 0;
  }
  return false;
};

const identifier = (
  kind: Exclude<ReferenceIdentifierKind, 'UNKNOWN'>,
  value: string,
  requestUrl: string,
  raw: string,
): ReferenceIdentifier => ({ kind, value, requestUrl, raw });

const doiIdentifier = (value: string, raw: string): ReferenceIdentifier =>
  identifier('DOI', value, doiCslJsonUrl(value), raw);

// Each recogniser returns null when the input is not its shape, so the chain
// below reads as a priority order. That order is the whole game: a doi.org URL
// is a DOI not a URL, an arxiv.org URL is an arXiv id not a URL, and a blog
// post whose slug merely says "arxiv" is a URL and nothing else.

const readDoi = (input: string): ReferenceIdentifier | null => {
  const labelled = stripLabel(input, /^doi:?\s*/i);
  if (labelled !== null && BARE_DOI.test(labelled)) {
    return doiIdentifier(labelled, input);
  }
  const hosted = input.match(
    /^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/\S+)$/i,
  );
  if (hosted !== null) return doiIdentifier(hosted[1], input);
  return BARE_DOI.test(input) ? doiIdentifier(input, input) : null;
};

const arxivIdentifier = (value: string, raw: string): ReferenceIdentifier =>
  identifier('ARXIV', value, arxivAtomUrl(value), raw);

const readArxiv = (input: string): ReferenceIdentifier | null => {
  const labelled = stripLabel(input, /^arxiv:\s*/i);
  if (
    labelled !== null &&
    (BARE_ARXIV_NEW.test(labelled) || BARE_ARXIV_OLD.test(labelled))
  ) {
    return arxivIdentifier(labelled, input);
  }
  // Only the arxiv.org host counts. Matching the word anywhere would swallow
  // every article *about* arXiv that someone cites by URL.
  const hosted = input.match(
    /^https?:\/\/(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/(\S+?)(?:\.pdf)?$/i,
  );
  if (hosted !== null) return arxivIdentifier(hosted[1], input);
  return BARE_ARXIV_NEW.test(input) || BARE_ARXIV_OLD.test(input)
    ? arxivIdentifier(input, input)
    : null;
};

const pmcidIdentifier = (value: string, raw: string): ReferenceIdentifier =>
  identifier('PMCID', value.toUpperCase(), pmcSummaryUrl(value), raw);

const readPmcid = (input: string): ReferenceIdentifier | null => {
  const labelled = stripLabel(input, /^pmcid:?\s*/i);
  const candidate = labelled ?? input;
  if (BARE_PMCID.test(candidate)) return pmcidIdentifier(candidate, input);
  const hosted = input.match(
    /^https?:\/\/(?:www\.)?ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)\/?$/i,
  );
  return hosted === null ? null : pmcidIdentifier(hosted[1], input);
};

const pmidIdentifier = (value: string, raw: string): ReferenceIdentifier =>
  identifier('PMID', value, pubmedSummaryUrl(value), raw);

const readPmid = (input: string): ReferenceIdentifier | null => {
  const labelled = stripLabel(input, /^pmid:?\s*/i);
  if (labelled !== null && BARE_PMID.test(labelled)) {
    return pmidIdentifier(labelled, input);
  }
  const hosted = input.match(
    /^https?:\/\/(?:www\.)?(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d{1,8})\/?$/i,
  );
  if (hosted !== null) return pmidIdentifier(hosted[1], input);
  return BARE_PMID.test(input) ? pmidIdentifier(input, input) : null;
};

const isbnIdentifier = (value: string, raw: string): ReferenceIdentifier =>
  identifier('ISBN', value, openLibraryIsbnUrl(value), raw);

const readIsbn = (input: string): ReferenceIdentifier | null => {
  const labelled = stripLabel(input, /^isbn(?:-1[03])?:?\s*/i);
  if (labelled !== null) {
    const isbn = normalizeIsbn(labelled);
    // An explicit "ISBN:" is taken at its word on the check digit — plenty of
    // books went to press with a wrong one — but the length still has to fit.
    return /^(?:\d{9}[\dX]|\d{13})$/.test(isbn)
      ? isbnIdentifier(isbn, input)
      : null;
  }
  if (!/^[\d-]+[\dX]$/i.test(input)) return null;
  const isbn = normalizeIsbn(input);
  return isValidIsbn(isbn) ? isbnIdentifier(isbn, input) : null;
};

const readUrl = (input: string): ReferenceIdentifier | null => {
  if (ABSOLUTE_URL.test(input)) return identifier('URL', input, input, input);
  // A bare host is still a URL an author meant to cite; https is the safe
  // scheme to add, since a fetch to http from an https app is blocked anyway.
  return BARE_HOST_URL.test(input)
    ? identifier('URL', `https://${input}`, `https://${input}`, input)
    : null;
};

export const classifyReferenceIdentifier = (
  input: string,
): ReferenceIdentifier => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { kind: 'UNKNOWN', value: '', requestUrl: '', raw: input };
  }
  const readers = [readDoi, readArxiv, readPmcid, readPmid, readIsbn, readUrl];
  for (const reader of readers) {
    const result = reader(trimmed);
    if (result !== null) return result;
  }
  return { kind: 'UNKNOWN', value: trimmed, requestUrl: '', raw: trimmed };
};

// One identifier per line, the way a reference list is pasted. Blank lines and
// list bullets are dropped rather than reported as junk.
export const classifyReferenceIdentifiers = (
  text: string,
): ReferenceIdentifier[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ''))
    .filter((line) => line.length > 0)
    .map(classifyReferenceIdentifier);

// ── API response → CSL JSON ─────────────────────────────────────────────────

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

// "2020 Mar 15", "2020 Mar", "2020" — the shapes NCBI's `pubdate` comes in.
const pubmedDateParts = (pubdate: unknown): number[] | null => {
  if (typeof pubdate !== 'string') return null;
  const year = pubdate.match(/\b((?:1[5-9]|20)\d{2})\b/);
  if (year === null) return null;
  const parts = [Number(year[1])];
  const month = pubdate.match(/\b([A-Za-z]{3})[a-z]*\b/);
  if (month !== null) {
    const index = MONTHS.indexOf(month[1].toLowerCase());
    if (index >= 0) parts.push(index + 1);
  }
  const day = pubdate.match(/\b(\d{1,2})\b(?!\d)/);
  if (day !== null && parts.length === 2) parts.push(Number(day[1]));
  return parts;
};

const yearOnlyDateParts = (value: unknown): number[] | null => {
  if (typeof value !== 'string') return null;
  const year = value.match(/\b((?:1[5-9]|20)\d{2})\b/);
  return year === null ? null : [Number(year[1])];
};

// "Smith J", "van der Berg AB" — NCBI writes family then initials with no
// comma, so the trailing run of capitals is the given name and the rest is the
// family. A collective author has no such split and stays literal.
const ncbiAuthorToCslName = (author: {
  name?: unknown;
  authtype?: unknown;
}): { family?: string; given?: string; literal?: string } | null => {
  const name = typeof author.name === 'string' ? author.name.trim() : '';
  if (name.length === 0) return null;
  if (author.authtype === 'CollectiveName') return { literal: name };
  const match = name.match(/^(.+?)\s+([A-Z]{1,3})$/);
  return match === null
    ? { literal: name }
    : { family: match[1], given: match[2] };
};

const ncbiArticleId = (
  articleids: unknown,
  idtype: string,
): string | undefined => {
  if (!Array.isArray(articleids)) return undefined;
  const entry = articleids.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { idtype?: unknown }).idtype === idtype,
  ) as { value?: unknown } | undefined;
  return typeof entry?.value === 'string' && entry.value.length > 0
    ? entry.value
    : undefined;
};

const ncbiDocumentSummary = (
  payload: unknown,
  id: string,
): Record<string, unknown> | null => {
  if (typeof payload !== 'object' || payload === null) return null;
  const result = (payload as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) return null;
  const uids = (result as { uids?: unknown }).uids;
  // Prefer the uid NCBI echoed back: asking by PMCID means the record is keyed
  // on the bare number, not on the string we sent.
  const key =
    Array.isArray(uids) && typeof uids[0] === 'string'
      ? uids[0]
      : id.replace(/^PMC/i, '');
  const summary = (result as Record<string, unknown>)[key];
  if (typeof summary !== 'object' || summary === null) return null;
  // esummary reports a bad id inside the docsum rather than as an HTTP error.
  const error = (summary as { error?: unknown }).error;
  return isNonEmptyString(error) ? null : (summary as Record<string, unknown>);
};

const asTrimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

// esummary's `pages` is "123-30" (NCBI elides the repeated century); CSL wants
// the pages as printed, so expand the second number back to full width.
const expandPageRange = (pages: string): string => {
  const match = pages.match(/^(\d+)\s*-\s*(\d+)$/);
  if (match === null) return pages;
  const [, first, last] = match;
  return last.length < first.length
    ? `${first}-${first.slice(0, first.length - last.length)}${last}`
    : pages;
};

// One NCBI esummary docsum (db=pubmed or db=pmc) → a CSL JSON item.
export const ncbiSummaryToCslItem = ({
  payload,
  id,
  kind,
}: {
  payload: unknown;
  id: string;
  kind: 'PMID' | 'PMCID';
}): Record<string, unknown> | null => {
  const summary = ncbiDocumentSummary(payload, id);
  if (summary === null) return null;
  const title = asTrimmedString(summary.title);
  if (title === undefined) return null;

  const item: Record<string, unknown> = {
    type: 'article-journal',
    // NCBI wraps the sentence-cased title in a trailing period; a CSL title
    // does not carry one, and the style will add its own.
    title: title.replace(/\.$/, ''),
  };
  const authors = Array.isArray(summary.authors)
    ? summary.authors
        .filter(
          (author): author is { name?: unknown; authtype?: unknown } =>
            typeof author === 'object' && author !== null,
        )
        .map(ncbiAuthorToCslName)
        .filter((name): name is NonNullable<typeof name> => name !== null)
    : [];
  if (authors.length > 0) item.author = authors;

  const dateParts = pubmedDateParts(summary.pubdate ?? summary.epubdate);
  if (dateParts !== null) item.issued = { 'date-parts': [dateParts] };

  const container =
    asTrimmedString(summary.fulljournalname) ?? asTrimmedString(summary.source);
  if (container !== undefined) item['container-title'] = container;
  const volume = asTrimmedString(summary.volume);
  if (volume !== undefined) item.volume = volume;
  const issue = asTrimmedString(summary.issue);
  if (issue !== undefined) item.issue = issue;
  const pages = asTrimmedString(summary.pages);
  if (pages !== undefined) item.page = expandPageRange(pages);

  const doi =
    ncbiArticleId(summary.articleids, 'doi') ?? asTrimmedString(summary.doi);
  if (doi !== undefined) item.DOI = doi;
  const pmid = ncbiArticleId(summary.articleids, 'pubmed');
  if (pmid !== undefined) item.PMID = pmid;
  const pmcid = ncbiArticleId(summary.articleids, 'pmcid') ?? undefined;
  if (pmcid !== undefined) item.PMCID = pmcid.split(';')[0].trim();

  item.URL =
    kind === 'PMCID'
      ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${id.toUpperCase()}/`
      : `https://pubmed.ncbi.nlm.nih.gov/${pmid ?? id}/`;
  return item;
};

// "Jane Q. Smith" → { given: "Jane Q.", family: "Smith" }. arXiv and
// OpenLibrary both write names in reading order with no comma.
const readingOrderName = (
  name: string,
): { family?: string; given?: string; literal?: string } => {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { literal: name.trim() };
  const family = parts.pop() as string;
  return { family, given: parts.join(' ') };
};

const xmlText = (element: Element | null | undefined): string | undefined => {
  const text = element?.textContent?.replace(/\s+/g, ' ').trim();
  return text !== undefined && text.length > 0 ? text : undefined;
};

const ARXIV_SCHEMA = 'http://arxiv.org/schemas/atom';

// jsdom and browsers both namespace `arxiv:doi`, but a feed served without the
// declaration falls back to the prefixed tag name.
const arxivExtension = (entry: Element, name: string): Element | null =>
  entry.getElementsByTagNameNS(ARXIV_SCHEMA, name).item(0) ??
  entry.getElementsByTagName(`arxiv:${name}`).item(0);

// The arXiv API's Atom feed → a CSL JSON item. `type: 'article'` is the CSL
// type for a preprint, which our own map already reads as PREPRINT.
export const arxivAtomToCslItem = (
  atomXml: string,
): Record<string, unknown> | null => {
  const document = new DOMParser().parseFromString(atomXml, 'text/xml');
  if (document.getElementsByTagName('parsererror').length > 0) return null;
  const entry = document.getElementsByTagName('entry').item(0);
  if (entry === null) return null;

  const entryId = xmlText(entry.getElementsByTagName('id').item(0));
  // A bad id comes back as a normal feed whose single entry is the error text.
  if (entryId === undefined || /\/api\/errors/i.test(entryId)) return null;
  const title = xmlText(entry.getElementsByTagName('title').item(0));
  if (title === undefined) return null;

  const versionedId = entryId.match(/arxiv\.org\/abs\/(\S+)$/i)?.[1] ?? entryId;
  const item: Record<string, unknown> = {
    type: 'article',
    title,
    publisher: 'arXiv',
    number: `arXiv:${versionedId}`,
    URL: `https://arxiv.org/abs/${versionedId}`,
  };

  const authors = [...entry.getElementsByTagName('author')]
    .map((author) => xmlText(author.getElementsByTagName('name').item(0)))
    .filter((name): name is string => name !== undefined)
    .map(readingOrderName);
  if (authors.length > 0) item.author = authors;

  const published = xmlText(entry.getElementsByTagName('published').item(0));
  const publishedParts = published?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (publishedParts !== null && publishedParts !== undefined) {
    item.issued = {
      'date-parts': [
        [
          Number(publishedParts[1]),
          Number(publishedParts[2]),
          Number(publishedParts[3]),
        ],
      ],
    };
  }

  // A published paper carries the journal's DOI; everything else gets the DOI
  // arXiv minted for it.
  item.DOI = xmlText(arxivExtension(entry, 'doi')) ?? arxivDoi(versionedId);
  const journalRef = xmlText(arxivExtension(entry, 'journal_ref'));
  if (journalRef !== undefined) item['container-title'] = journalRef;
  const summary = xmlText(entry.getElementsByTagName('summary').item(0));
  if (summary !== undefined) item.abstract = summary;
  return item;
};

// OpenLibrary's `jscmd=data` reply → a CSL JSON `book` item. The response is
// keyed by the bibkey we asked for and is `{}` when nothing matched.
export const openLibraryToCslItem = ({
  payload,
  isbn,
}: {
  payload: unknown;
  isbn: string;
}): Record<string, unknown> | null => {
  if (typeof payload !== 'object' || payload === null) return null;
  const keyed = payload as Record<string, unknown>;
  const book = keyed[`ISBN:${isbn}`] ?? Object.values(keyed)[0];
  if (typeof book !== 'object' || book === null) return null;
  const record = book as Record<string, unknown>;
  const title = asTrimmedString(record.title);
  if (title === undefined) return null;

  const subtitle = asTrimmedString(record.subtitle);
  const item: Record<string, unknown> = {
    type: 'book',
    title: subtitle === undefined ? title : `${title}: ${subtitle}`,
    ISBN: isbn,
  };
  const authors = Array.isArray(record.authors)
    ? record.authors
        .map((author) =>
          typeof author === 'object' && author !== null
            ? asTrimmedString((author as { name?: unknown }).name)
            : undefined,
        )
        .filter((name): name is string => name !== undefined)
        .map(readingOrderName)
    : [];
  if (authors.length > 0) item.author = authors;

  const dateParts = yearOnlyDateParts(record.publish_date);
  if (dateParts !== null) item.issued = { 'date-parts': [dateParts] };

  const publishers = Array.isArray(record.publishers)
    ? record.publishers
        .map((publisher) =>
          typeof publisher === 'object' && publisher !== null
            ? asTrimmedString((publisher as { name?: unknown }).name)
            : undefined,
        )
        .filter((name): name is string => name !== undefined)
    : [];
  if (publishers.length > 0) item.publisher = publishers.join(', ');

  const places = Array.isArray(record.publish_places)
    ? record.publish_places
        .map((place) =>
          typeof place === 'object' && place !== null
            ? asTrimmedString((place as { name?: unknown }).name)
            : undefined,
        )
        .filter((name): name is string => name !== undefined)
    : [];
  if (places.length > 0) item['publisher-place'] = places[0];

  if (typeof record.number_of_pages === 'number') {
    item['number-of-pages'] = String(record.number_of_pages);
  }
  const url = asTrimmedString(record.url);
  if (url !== undefined) item.URL = url;
  return item;
};

// ── URL → CSL, best effort ──────────────────────────────────────────────────

const dateToCslParts = (date: Date): { 'date-parts': number[][] } => ({
  'date-parts': [
    [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()],
  ],
});

// What every URL import is guaranteed to produce: the address and the day it
// was read. A `webpage` with an accessed date is a citable reference even when
// the page told us nothing about itself.
export const webpageCslItem = ({
  url,
  accessedOn,
  title,
}: {
  url: string;
  accessedOn: Date;
  title?: string;
}): Record<string, unknown> => ({
  type: 'webpage',
  title: title ?? url,
  URL: url,
  accessed: dateToCslParts(accessedOn),
});

// Matching is case-insensitive, so "DC.title" and "dc.title" are one name —
// listing both would read the same tag twice and duplicate every author.
const metaSelector = (name: string): string =>
  ['name', 'property', 'http-equiv']
    .map((attribute) => `meta[${attribute}="${name}" i]`)
    .join(',');

const metaContent = (
  document: Document,
  names: string[],
): string | undefined => {
  for (const name of names) {
    for (const element of document.querySelectorAll(metaSelector(name))) {
      const content = element.getAttribute('content')?.trim();
      if (content !== undefined && content.length > 0) return content;
    }
  }
  return undefined;
};

const metaContents = (document: Document, names: string[]): string[] => {
  const values: string[] = [];
  const seen = new Set<Element>();
  for (const name of names) {
    for (const element of document.querySelectorAll(metaSelector(name))) {
      if (seen.has(element)) continue;
      seen.add(element);
      const content = element.getAttribute('content')?.trim();
      if (content !== undefined && content.length > 0) values.push(content);
    }
  }
  return values;
};

// A publisher's landing page carries Highwire `citation_*` tags; a repository
// or library catalogue carries Dublin Core; a blog carries only OpenGraph and
// a <title>. Read whichever is there, in that order of trustworthiness, and
// keep the `webpage` fallback so the import never comes back empty-handed.
export const htmlMetaToCslItem = ({
  html,
  url,
  accessedOn,
}: {
  html: string;
  url: string;
  accessedOn: Date;
}): Record<string, unknown> => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const title =
    metaContent(document, ['citation_title', 'dc.title']) ??
    metaContent(document, ['og:title', 'twitter:title']) ??
    xmlText(document.querySelector('title'));

  const authorNames = [
    ...metaContents(document, ['citation_author']),
    ...metaContents(document, ['dc.creator', 'author']),
  ];
  const container = metaContent(document, [
    'citation_journal_title',
    'citation_conference_title',
    'dc.source',
  ]);
  const publishedOn = metaContent(document, [
    'citation_publication_date',
    'citation_date',
    'citation_online_date',
    'dc.date',
    'article:published_time',
  ]);
  const doi = metaContent(document, ['citation_doi', 'dc.identifier'])?.replace(
    /^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)/i,
    '',
  );

  const item = webpageCslItem({ url, accessedOn, title });
  // A journal article is only claimed when a journal actually named itself;
  // otherwise this stays a webpage, which is the honest description.
  if (container !== undefined) {
    item.type = 'article-journal';
    item['container-title'] = container;
  }
  if (authorNames.length > 0) {
    item.author = authorNames.map((name) =>
      // Highwire writes "Smith, Jane"; OpenGraph and DC write "Jane Smith".
      name.includes(',')
        ? {
            family: name.split(',')[0].trim(),
            given: name.split(',').slice(1).join(',').trim(),
          }
        : readingOrderName(name),
    );
  }
  if (publishedOn !== undefined) {
    const parts = publishedOn.match(
      /^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/,
    );
    if (parts !== null) {
      item.issued = {
        'date-parts': [
          [parts[1], parts[2], parts[3]]
            .filter((part): part is string => part !== undefined)
            .map(Number),
        ],
      };
    }
  }
  if (isNonEmptyString(doi) && BARE_DOI.test(doi)) item.DOI = doi;

  const publisher = metaContent(document, [
    'citation_publisher',
    'dc.publisher',
    'og:site_name',
  ]);
  if (publisher !== undefined && item.type !== 'article-journal') {
    item['container-title'] = publisher;
  }
  const volume = metaContent(document, ['citation_volume']);
  if (volume !== undefined) item.volume = volume;
  const issue = metaContent(document, ['citation_issue']);
  if (issue !== undefined) item.issue = issue;
  const firstPage = metaContent(document, ['citation_firstpage']);
  const lastPage = metaContent(document, ['citation_lastpage']);
  if (firstPage !== undefined) {
    item.page = lastPage === undefined ? firstPage : `${firstPage}-${lastPage}`;
  }
  return item;
};

// Whether a resolved item carries enough to be worth more than the URL alone —
// used to decide if a page's meta tags were readable or the fetch was blocked.
export const isResolvedBeyondUrl = (item: Record<string, unknown>): boolean =>
  item.title !== item.URL &&
  (Array.isArray(item.author) ||
    isNonEmptyString(item.DOI) ||
    cslDatePartsYear(item.issued) !== null);
