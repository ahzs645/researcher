// The one parser for the `[@key]` citation token grammar of
// `docs/manuscript-format.md` §3 — plain, cluster, locator, prefix and
// suppressed-author forms, plus the literal contexts that must survive
// untouched (backslash escapes, inline code spans, fenced code blocks).
//
// Both sides of the app consume it: the editor turns a token into an inline
// node, and the exporters rewrite a token into its formatted in-text citation.
// They used to parse the grammar separately and disagree about it, so this
// module holds no dependencies of its own and both import from here.

export type CitationClusterItem = {
  citationKey: string;
  locator: string;
  prefix: string;
  suffix: string;
  suppressAuthor: boolean;
};

// A cluster entry given as a bare string is a key with no locator/prefix.
export type CitationClusterInput = readonly (string | CitationClusterItem)[];

export const emptyCitationItem = (
  citationKey: string,
): CitationClusterItem => ({
  citationKey,
  locator: '',
  prefix: '',
  suffix: '',
  suppressAuthor: false,
});

export const toCitationClusterItems = (
  cluster: CitationClusterInput,
): CitationClusterItem[] =>
  cluster.map((entry) =>
    typeof entry === 'string' ? emptyCitationItem(entry) : entry,
  );

export const citationClusterItemKeys = (
  cluster: CitationClusterInput,
): string[] => toCitationClusterItems(cluster).map((item) => item.citationKey);

// Anchored at a `[`: the bracket may open with a prefix (`[see @key]`) or a
// suppression marker (`[-@key]`), so only the `@` is required inside.
export const CITATION_TOKEN = /^\[[^\]\r\n]*@[^\]\r\n]+\]/;

// `see -@key, p. 42` → prefix / suppression / key / locator. The key stops at
// whitespace, `,` and `;` so a locator can never be swallowed into it.
const CITATION_PART = /^(.*?)(-?)@([^\s,;]+)(?:,\s*(.*))?$/;

// Parse the body of one `[...]` token. Returns [] when any `;`-separated part
// is not a citation, so a bracket that merely contains an `@` stays literal.
export const parseCitationClusterToken = (
  token: string,
): CitationClusterItem[] => {
  const parts = token.slice(1, -1).split(';');
  const parsed = parts.map((rawPart): CitationClusterItem | undefined => {
    const match = CITATION_PART.exec(rawPart.trim());
    if (match === null) return undefined;
    return {
      citationKey: match[3],
      prefix: match[1].trim(),
      locator: (match[4] ?? '').trim(),
      suffix: '',
      suppressAuthor: match[2] === '-',
    };
  });
  return parsed.every((item): item is CitationClusterItem => item !== undefined)
    ? parsed
    : [];
};

export type CitationTokenMatch = {
  start: number;
  end: number;
  raw: string;
  items: CitationClusterItem[];
};

const FENCE_LINE = /^[ \t]{0,3}(`{3,}|~{3,})/;

const lineEnd = (markdown: string, index: number): number => {
  const next = markdown.indexOf('\n', index);
  return next === -1 ? markdown.length : next + 1;
};

// Backtick spans may wrap a line but not a blank line; without that bound a
// single stray backtick would silently swallow the rest of a section.
const inlineCodeSpanEnd = (markdown: string, start: number): number => {
  let delimiterEnd = start;
  while (markdown[delimiterEnd] === '`') delimiterEnd += 1;
  const delimiter = markdown.slice(start, delimiterEnd);
  const closing = markdown.indexOf(delimiter, delimiterEnd);
  if (closing === -1) return delimiterEnd;
  const span = markdown.slice(delimiterEnd, closing);
  if (/\n[ \t]*\n/.test(span)) return delimiterEnd;
  return closing + delimiter.length;
};

// Walk the Markdown once, skipping every context §3 declares literal, and
// report each real citation token with its source offsets.
export const scanCitationTokens = (markdown: string): CitationTokenMatch[] => {
  const matches: CitationTokenMatch[] = [];
  let index = 0;
  let openFence: string | undefined;

  while (index < markdown.length) {
    const isLineStart = index === 0 || markdown[index - 1] === '\n';
    if (isLineStart) {
      const line = markdown.slice(index, lineEnd(markdown, index));
      const fence = FENCE_LINE.exec(line)?.[1];
      if (openFence !== undefined) {
        // A fence closes only on the same character, at least as long.
        if (
          fence !== undefined &&
          fence[0] === openFence[0] &&
          fence.length >= openFence.length
        ) {
          openFence = undefined;
        }
        index += line.length;
        continue;
      }
      if (fence !== undefined) {
        openFence = fence;
        index += line.length;
        continue;
      }
    }

    const character = markdown[index];
    if (character === '\\') {
      // The backslash consumes the next character, so `\[@key]` never opens.
      index += 2;
      continue;
    }
    if (character === '`') {
      index = inlineCodeSpanEnd(markdown, index);
      continue;
    }
    if (character === '[') {
      const token = CITATION_TOKEN.exec(markdown.slice(index))?.[0];
      if (token !== undefined) {
        const items = parseCitationClusterToken(token);
        if (items.length > 0) {
          matches.push({
            start: index,
            end: index + token.length,
            raw: token,
            items,
          });
          index += token.length;
          continue;
        }
      }
    }
    index += 1;
  }

  return matches;
};

export const replaceCitationTokens = (
  markdown: string,
  replace: (items: CitationClusterItem[], raw: string) => string,
): string => {
  const matches = scanCitationTokens(markdown);
  if (matches.length === 0) return markdown;
  let result = '';
  let cursor = 0;
  for (const match of matches) {
    result += markdown.slice(cursor, match.start);
    result += replace(match.items, match.raw);
    cursor = match.end;
  }
  return result + markdown.slice(cursor);
};

// Render a cluster back to its canonical token form.
export const citationClusterToToken = (cluster: CitationClusterInput): string =>
  `[${toCitationClusterItems(cluster)
    .map((item) => {
      const prefix = item.prefix.length > 0 ? `${item.prefix} ` : '';
      const locator = item.locator.length > 0 ? `, ${item.locator}` : '';
      const suffix = item.suffix.length > 0 ? ` ${item.suffix}` : '';
      return `${prefix}${item.suppressAuthor ? '-' : ''}@${item.citationKey}${locator}${suffix}`;
    })
    .join('; ')}]`;
