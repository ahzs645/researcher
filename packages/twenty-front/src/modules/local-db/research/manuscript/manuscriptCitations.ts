import { isNonEmptyString } from '@sniptt/guards';

import {
  citationClusterItemKeys,
  replaceCitationTokens,
  scanCitationTokens,
  toCitationClusterItems,
  type CitationClusterInput,
  type CitationClusterItem,
} from './manuscriptCitationTokens';
import { type CitationMode, type ReferenceLike } from './manuscriptTypes';
import { decodeXmlEntities } from './manuscriptXmlEntities';

// In-text citations + bibliography, formatted by the journal's citation mode.
//
// This is a deterministic, dependency-free formatter covering the common modes
// (numeric, superscript-numeric, author–date). It is intentionally a *fallback*:
// full CSL fidelity across 10,000+ journal styles is the citeproc-js upgrade
// (drop a `CslCitationRenderer` in via the seam at the bottom). Both consume the
// same CSL-JSON-backed reference records, so swapping is transparent.

const asMode = (value: string | null | undefined): CitationMode => {
  switch (value) {
    case 'NUMERIC':
    case 'NUMERIC_SUPERSCRIPT':
    case 'AUTHOR_DATE':
    case 'AUTHOR_NUMBER':
      return value;
    default:
      return 'NUMERIC';
  }
};

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

const toSuperscript = (value: string): string =>
  value
    .split('')
    .map((character) => SUPERSCRIPT_DIGITS[character] ?? character)
    .join('');

// "Smith, J.; Doe, A." → "Smith". Falls back to the whole string.
export const firstAuthorSurname = (
  authors: string | null | undefined,
): string => {
  if (!isNonEmptyString(authors)) return '';
  const first = authors.split(/;|\band\b/)[0].trim();
  // "Smith, J." → "Smith"; "Jane Smith" → "Smith".
  if (first.includes(',')) return first.split(',')[0].trim();
  const parts = first.split(/\s+/);
  return parts[parts.length - 1] ?? first;
};

const authorYear = (reference: ReferenceLike): string => {
  const surname = firstAuthorSurname(reference.authors) || 'Anon.';
  const year = reference.year ?? 'n.d.';
  return `${surname}, ${year}`;
};

export type CitationContext = {
  // Final reference order → 1-based citation number (numeric styles).
  numberByKey: Map<string, number>;
  referencesByKey: Map<string, ReferenceLike>;
  mode: CitationMode;
};

// Build the ordered reference list + numbering for a manuscript. Numeric styles
// order by first citation; author–date orders alphabetically by first author.
export const buildCitationContext = (
  citedKeys: string[],
  referencesByKey: Map<string, ReferenceLike>,
  mode: string | null | undefined,
): {
  context: CitationContext;
  orderedKeys: string[];
  missingKeys: string[];
} => {
  const resolvedMode = asMode(mode);
  const known = citedKeys.filter((key) => referencesByKey.has(key));
  const missingKeys = citedKeys.filter((key) => !referencesByKey.has(key));

  const orderedKeys =
    resolvedMode === 'AUTHOR_DATE'
      ? [...known].sort((a, b) => {
          const refA = referencesByKey.get(a);
          const refB = referencesByKey.get(b);
          return authorYear(refA as ReferenceLike).localeCompare(
            authorYear(refB as ReferenceLike),
          );
        })
      : known;

  const numberByKey = new Map<string, number>();
  orderedKeys.forEach((key, index) => numberByKey.set(key, index + 1));

  return {
    context: { numberByKey, referencesByKey, mode: resolvedMode },
    orderedKeys,
    missingKeys,
  };
};

const hasCitationItemAffixes = (item: CitationClusterItem): boolean =>
  item.locator.length > 0 || item.prefix.length > 0 || item.suffix.length > 0;

// Wrap one rendered source in the prefix/locator/suffix its token carried.
// The locator follows the source ("[1, p. 42]"), the prefix leads it
// ("[see 1]") and a free-text suffix trails it.
const withCitationItemAffixes = (
  item: CitationClusterItem,
  body: string,
): string => {
  const withLocator =
    item.locator.length > 0 ? `${body}, ${item.locator}` : body;
  const withPrefix =
    item.prefix.length > 0 ? `${item.prefix} ${withLocator}` : withLocator;
  return item.suffix.length > 0 ? `${withPrefix} ${item.suffix}` : withPrefix;
};

// Suppressing the author leaves the year to stand alone after prose that
// already names them ("Li's model (2017)").
const authorDateBody = (
  reference: ReferenceLike,
  suppressAuthor: boolean,
): string =>
  suppressAuthor ? String(reference.year ?? 'n.d.') : authorYear(reference);

// Render one in-text citation cluster in the active mode. Entries may be bare
// keys or structured items carrying a locator, prefix, suffix or suppression.
export const formatInTextCitation = (
  cluster: CitationClusterInput,
  context: CitationContext,
): string => {
  const known = toCitationClusterItems(cluster).filter((item) =>
    context.referencesByKey.has(item.citationKey),
  );
  if (known.length === 0) return `[?]`;

  switch (context.mode) {
    case 'NUMERIC':
    case 'AUTHOR_NUMBER': {
      const rendered = known.map((item) =>
        withCitationItemAffixes(
          item,
          String(context.numberByKey.get(item.citationKey) ?? 0),
        ),
      );
      // "[1, 2]" reads as two sources, but once a locator is in play "[1, p.
      // 42, 2]" is ambiguous — so affixed clusters separate with a semicolon.
      const separator = known.some(hasCitationItemAffixes) ? '; ' : ', ';
      return `[${rendered.join(separator)}]`;
    }
    case 'NUMERIC_SUPERSCRIPT': {
      const numbers = known.map(
        (item) => context.numberByKey.get(item.citationKey) ?? 0,
      );
      const superscript = toSuperscript(numbers.join(','));
      // A superscript run cannot carry prose, so the prefix stays ahead of it
      // and locators/suffixes trail it in normal text instead of being lost.
      const prefix = known
        .map((item) => item.prefix)
        .filter((part) => part.length > 0)
        .join(' ');
      const trailing = known
        .flatMap((item) => [item.locator, item.suffix])
        .filter((part) => part.length > 0)
        .join(', ');
      return `${prefix.length > 0 ? `${prefix} ` : ''}${superscript}${
        trailing.length > 0 ? ` (${trailing})` : ''
      }`;
    }
    case 'AUTHOR_DATE': {
      const rendered = known.map((item) =>
        withCitationItemAffixes(
          item,
          authorDateBody(
            context.referencesByKey.get(item.citationKey) as ReferenceLike,
            item.suppressAuthor,
          ),
        ),
      );
      return `(${rendered.join('; ')})`;
    }
  }
};

// Render a single bibliography entry. Generic author–title–container style;
// numeric modes prepend the number.
export const formatReferenceEntry = (
  reference: ReferenceLike,
  number: number | undefined,
  mode: CitationMode,
): string => {
  if (isNonEmptyString(reference.cslJson)) {
    try {
      const parsed: unknown = JSON.parse(reference.cslJson);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'researcher:rawReference' in parsed &&
        isNonEmptyString(parsed['researcher:rawReference'])
      ) {
        const prefix =
          (mode === 'NUMERIC' ||
            mode === 'AUTHOR_NUMBER' ||
            mode === 'NUMERIC_SUPERSCRIPT') &&
          number !== undefined
            ? `${number}. `
            : '';
        return `${prefix}${parsed['researcher:rawReference'].trim()}`;
      }
    } catch {
      // Fall through to the structured generic formatter.
    }
  }
  const parts: string[] = [];
  const authors = isNonEmptyString(reference.authors)
    ? reference.authors
    : 'Anonymous';
  const year = reference.year ?? 'n.d.';
  parts.push(`${authors} (${year}).`);
  if (isNonEmptyString(reference.name)) parts.push(`${reference.name}.`);
  if (isNonEmptyString(reference.containerTitle)) {
    const locator = [
      reference.containerTitle,
      isNonEmptyString(reference.volume) ? reference.volume : undefined,
      isNonEmptyString(reference.pages) ? reference.pages : undefined,
    ]
      .filter((value): value is string => isNonEmptyString(value))
      .join(', ');
    parts.push(`${locator}.`);
  }
  if (isNonEmptyString(reference.doi)) {
    parts.push(
      `https://doi.org/${reference.doi.replace(/^https?:\/\/doi\.org\//, '')}`,
    );
  } else if (isNonEmptyString(reference.url)) {
    parts.push(reference.url);
  }

  const body = parts.join(' ');
  const prefix =
    (mode === 'NUMERIC' ||
      mode === 'AUTHOR_NUMBER' ||
      mode === 'NUMERIC_SUPERSCRIPT') &&
    number !== undefined
      ? `${number}. `
      : '';
  return `${prefix}${body}`;
};

export type FormattedBibliographyEntry = {
  key: string;
  number?: number;
  text: string;
  // Present on citeproc-rendered entries: the CSL markup (italics etc.).
  html?: string;
};

// CSL HTML → Markdown inline markup for bibliography entries: italics and
// bold survive, layout markup collapses to plain text.
export const bibliographyHtmlToMarkdown = (html: string): string =>
  decodeXmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<(\/?)i\b[^>]*>/gi, '*')
      .replace(/<(\/?)em\b[^>]*>/gi, '*')
      .replace(/<(\/?)b\b[^>]*>/gi, '**')
      .replace(/<(\/?)strong\b[^>]*>/gi, '**')
      .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '^$1^')
      .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, '~$1~')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

// CSL HTML → BlockNote-style inline content runs (bold/italic styles kept).
export type BibliographyInlineRun = {
  type: 'text';
  text: string;
  styles: { bold?: true; italic?: true };
};

const BIBLIOGRAPHY_BLOCK_TAG =
  /^<\/?(?:div|p|br|li|ol|ul|tr|td|th|section|table)\b/i;

export const bibliographyHtmlToInlineRuns = (
  html: string,
): BibliographyInlineRun[] => {
  const runs: BibliographyInlineRun[] = [];
  const pattern = /<(i|em|b|strong)\b[^>]*>([\s\S]*?)<\/\1>|<[^>]*>|([^<]+)/gi;
  for (const match of html.matchAll(pattern)) {
    const [, tag, inner, plain] = match;
    if (tag === undefined && plain === undefined) {
      // A block tag citeproc uses for layout — `csl-left-margin` holding "1."
      // next to `csl-right-inline` holding the entry. Dropping it silently
      // glued the two together as "1.McMichael"; a block is a word boundary.
      // Inline tags are not: `m<sup>3</sup>` must stay one word.
      const previous = runs.at(-1)?.text ?? '';
      if (
        BIBLIOGRAPHY_BLOCK_TAG.test(match[0]) &&
        previous.length > 0 &&
        !/\s$/.test(previous)
      ) {
        runs.push({ type: 'text', text: ' ', styles: {} });
      }
      continue;
    }
    if (tag !== undefined) {
      const text = decodeXmlEntities(
        inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '),
      );
      if (text.length === 0) continue;
      runs.push({
        type: 'text',
        text,
        styles: tag === 'i' || tag === 'em' ? { italic: true } : { bold: true },
      });
      continue;
    }
    if (plain !== undefined) {
      const text = decodeXmlEntities(plain);
      if (text.trim().length === 0) {
        // Keep inter-run spacing instead of dropping the run entirely.
        if (runs.length > 0) {
          runs.push({ type: 'text', text: ' ', styles: {} });
        }
        continue;
      }
      runs.push({ type: 'text', text, styles: {} });
    }
  }
  while ((runs.at(-1)?.text ?? 'x').trim().length === 0) runs.pop();
  return runs;
};

// The whole bibliography in final order.
export const formatBibliography = (
  context: CitationContext,
  orderedKeys: string[],
): FormattedBibliographyEntry[] =>
  orderedKeys.map((key) => {
    const reference = context.referencesByKey.get(key) as ReferenceLike;
    const number = context.numberByKey.get(key);
    return {
      key,
      number,
      text: formatReferenceEntry(reference, number, context.mode),
    };
  });

// Rewrite every citation token in the Markdown to its formatted in-text form.
// Parsing (including which brackets are literal) lives in
// `manuscriptCitationTokens` so the editor and the exporters cannot drift.

// Two clusters citing the same sources at different pages are different
// citations, so the cache key carries the locator/prefix/suffix/suppression
// too. Metadata-free clusters keep the bare joined-keys form callers (and the
// anchor encoding) already rely on.
const CITATION_ITEM_KEY_SEPARATOR = '\u001e';

const citationItemKeyPart = (item: CitationClusterItem): string => {
  const metadata = [
    item.prefix,
    item.locator,
    item.suffix,
    item.suppressAuthor ? '-' : '',
  ];
  return metadata.every((part) => part.length === 0)
    ? item.citationKey
    : `${item.citationKey}${CITATION_ITEM_KEY_SEPARATOR}${metadata.join(
        CITATION_ITEM_KEY_SEPARATOR,
      )}`;
};

export const citationClusterKey = (cluster: CitationClusterInput): string =>
  toCitationClusterItems(cluster).map(citationItemKeyPart).join('\u001f');

// ── Citation anchors ───────────────────────────────────────────────────────
// Rendering a citation cluster loses which references it pointed at, which is
// fine for Word and PDF but leaves an HTML export unable to link "[3]" to
// entry 3. Exporters that want the link ask for anchors, and the rendered text
// carries the keys alongside the label inside control characters that cannot
// occur in manuscript prose. Everything else strips them.
const CITATION_ANCHOR_OPEN = '\u0002';
const CITATION_ANCHOR_SPLIT = '\u0011';
const CITATION_ANCHOR_CLOSE = '\u0003';

export const CITATION_ANCHOR_PATTERN =
  /\u0002([^\u0002\u0011\u0003]*)\u0011([^\u0003]*)\u0003/g;

export const wrapCitationAnchor = (keys: string[], label: string): string =>
  `${CITATION_ANCHOR_OPEN}${citationClusterKey(keys)}${CITATION_ANCHOR_SPLIT}${label}${CITATION_ANCHOR_CLOSE}`;

export const citationAnchorKeys = (encoded: string): string[] =>
  encoded
    .split('\u001f')
    .map((part) => part.split(CITATION_ITEM_KEY_SEPARATOR)[0])
    .filter((key) => key.length > 0);

export const stripCitationAnchors = (value: string): string =>
  value.replace(CITATION_ANCHOR_PATTERN, (_match, _keys, label: string) =>
    String(label),
  );

export const extractCitationClusterItems = (
  markdown: string,
): CitationClusterItem[][] =>
  scanCitationTokens(markdown).map((match) => match.items);

export const extractCitationClusters = (markdown: string): string[][] =>
  extractCitationClusterItems(markdown).map(citationClusterItemKeys);

const renderedCluster = (
  items: CitationClusterItem[],
  label: string,
  withAnchors: boolean,
): string =>
  withAnchors
    ? wrapCitationAnchor(citationClusterItemKeys(items), label)
    : label;

export const renderCitationsInText = (
  markdown: string,
  context: CitationContext,
  withAnchors = false,
): string =>
  replaceCitationTokens(markdown, (items) =>
    renderedCluster(items, formatInTextCitation(items, context), withAnchors),
  );

export const renderCitationsInTextWithLabels = (
  markdown: string,
  labelsByCluster: ReadonlyMap<string, string>,
  fallbackContext: CitationContext,
  withAnchors = false,
): string =>
  replaceCitationTokens(markdown, (items) => {
    const label =
      labelsByCluster.get(citationClusterKey(items)) ??
      formatInTextCitation(items, fallbackContext);
    return renderedCluster(items, label, withAnchors);
  });

// ── Seam for full CSL rendering (citeproc-js / @citeproc-rs) ────────────────
// A renderer that, given CSL-JSON items + a CSL style id, returns the same
// shapes this module produces. The composer can inject one to upgrade from the
// built-in formatter to true 10,000-style CSL without touching callers.
export type CslCitationRenderer = (input: {
  cslJson: unknown[];
  styleId: string;
  citedKeys: string[];
}) => Promise<{
  inTextByCluster: Record<string, string>;
  bibliography: FormattedBibliographyEntry[];
}>;
