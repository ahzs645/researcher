import { isNonEmptyString } from '@sniptt/guards';

import { type CitationMode, type ReferenceLike } from './manuscriptTypes';

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

// Render one in-text citation cluster (one or more keys) in the active mode.
export const formatInTextCitation = (
  keys: string[],
  context: CitationContext,
): string => {
  const known = keys.filter((key) => context.referencesByKey.has(key));
  if (known.length === 0) return `[?]`;

  switch (context.mode) {
    case 'NUMERIC':
    case 'AUTHOR_NUMBER': {
      const numbers = known.map((key) => context.numberByKey.get(key) ?? 0);
      return `[${numbers.join(', ')}]`;
    }
    case 'NUMERIC_SUPERSCRIPT': {
      const numbers = known.map((key) => context.numberByKey.get(key) ?? 0);
      return toSuperscript(numbers.join(','));
    }
    case 'AUTHOR_DATE': {
      const rendered = known.map((key) =>
        authorYear(context.referencesByKey.get(key) as ReferenceLike),
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

// Rewrite every [@key] / [@a; @b] citation cluster in the Markdown to its
// formatted in-text form. (A simple pass that handles the common bracket forms.)
const CITATION_CLUSTER = /\[(@[^\]]+)\]/g;

export const renderCitationsInText = (
  markdown: string,
  context: CitationContext,
): string =>
  markdown.replace(CITATION_CLUSTER, (_match, inner: string) => {
    const keys = inner
      .split(';')
      .map((part) => part.trim().replace(/^@/, ''))
      .filter((part) => part.length > 0);
    return formatInTextCitation(keys, context);
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
