import { isNonEmptyString } from '@sniptt/guards';

// CSL-JSON → BibTeX, shared by the LaTeX and Typst exports.
//
// Both of those emit *source*, so their bibliography has to travel as a file
// the toolchain reads rather than as text we rendered ourselves. BibTeX is the
// one format `bibtex`, `biber` and Typst's own `bibliography()` all accept, and
// the bundle already carries CSL-JSON for every reference — so this is a field
// mapping, not a second reference model.

const BIBTEX_TYPE_BY_CSL_TYPE: Record<string, string> = {
  'article-journal': 'article',
  'article-magazine': 'article',
  'article-newspaper': 'article',
  'paper-conference': 'inproceedings',
  book: 'book',
  chapter: 'incollection',
  thesis: 'phdthesis',
  report: 'techreport',
  manuscript: 'unpublished',
  webpage: 'misc',
  dataset: 'misc',
  software: 'misc',
  preprint: 'misc',
};

// One pass over a character class, not a chain of replaces: escaping the
// backslash first would otherwise re-escape the braces its own replacement
// introduces.
const BIBTEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
};

const escapeBibtexValue = (value: string): string =>
  value
    .replace(
      /[\\{}$&#^_%~]/g,
      (character) => BIBTEX_ESCAPES[character] ?? character,
    )
    .replace(/\s+/g, ' ')
    .trim();

// A BibTeX key may not carry whitespace, a comma, a brace or a comment
// character. Everything else survives, so `smith2020` and `smith:2020a` reach
// `\cite{}` unchanged and stay recognisable in a compiler's error messages.
export const manuscriptBibtexCitationKey = (id: string): string =>
  id
    .trim()
    .replace(/[\s,{}()%#\\~^"@=]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'reference';

type CslName = { family?: string; given?: string; literal?: string };

const nameList = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null;
  const names = value
    .map((entry) => {
      const name = entry as CslName;
      if (isNonEmptyString(name.literal)) {
        // Braces keep a corporate author from being split into first/last.
        return `{${escapeBibtexValue(name.literal)}}`;
      }
      const family = escapeBibtexValue(name.family ?? '');
      const given = escapeBibtexValue(name.given ?? '');
      if (family.length === 0) return given;
      return given.length === 0 ? family : `${family}, ${given}`;
    })
    .filter((name) => name.length > 0);
  return names.length === 0 ? null : names.join(' and ');
};

const issuedYear = (value: unknown): string | null => {
  const parts = (value as { 'date-parts'?: unknown } | undefined)?.[
    'date-parts'
  ];
  const year =
    Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined;
  return typeof year === 'number' || isNonEmptyString(year)
    ? String(year)
    : null;
};

const text = (value: unknown): string | null =>
  isNonEmptyString(value) ? escapeBibtexValue(value) : null;

// An extra brace layer around a title keeps BibTeX styles that lowercase
// titles from turning "Arctic PM2.5 in Alaska" into "Arctic pm2.5 in alaska".
const protectedTitle = (value: unknown): string | null => {
  const escaped = text(value);
  return escaped === null ? null : `{${escaped}}`;
};

const pageRange = (value: unknown): string | null => {
  const escaped = text(value);
  // BibTeX ranges are en-dashes; a single page stays a single page.
  return escaped === null ? null : escaped.replace(/\s*-+\s*/g, '--');
};

const fieldsForItem = (
  item: Record<string, unknown>,
  entryType: string,
): [string, string | null][] => {
  const container = item['container-title'];
  const publisher = item.publisher;
  const common: [string, string | null][] = [
    ['author', nameList(item.author)],
    ['editor', nameList(item.editor)],
    ['title', protectedTitle(item.title)],
    ['year', issuedYear(item.issued)],
  ];
  const tail: [string, string | null][] = [
    ['doi', text(item.DOI)],
    ['url', text(item.URL)],
    ['note', text(item.note)],
  ];

  switch (entryType) {
    case 'article':
      return [
        ...common,
        ['journal', protectedTitle(container)],
        ['volume', text(item.volume)],
        ['number', text(item.issue)],
        ['pages', pageRange(item.page)],
        ['publisher', text(publisher)],
        ...tail,
      ];
    case 'inproceedings':
    case 'incollection':
      return [
        ...common,
        ['booktitle', protectedTitle(container)],
        ['volume', text(item.volume)],
        ['pages', pageRange(item.page)],
        ['publisher', text(publisher)],
        ['address', text(item['publisher-place'])],
        ...tail,
      ];
    case 'book':
      return [
        ...common,
        ['volume', text(item.volume)],
        ['edition', text(item.edition)],
        ['publisher', text(publisher)],
        ['address', text(item['publisher-place'])],
        ...tail,
      ];
    case 'phdthesis':
      return [
        ...common,
        ['school', text(publisher)],
        ['address', text(item['publisher-place'])],
        ...tail,
      ];
    case 'techreport':
      return [
        ...common,
        ['institution', text(publisher)],
        ['number', text(item.number ?? item.issue)],
        ...tail,
      ];
    case 'unpublished':
      return [...common, ['note', text(item.note) ?? 'Unpublished'], ...tail];
    default:
      return [
        ...common,
        ['howpublished', protectedTitle(container)],
        ['publisher', text(publisher)],
        ...tail,
      ];
  }
};

const entryToBibtex = (item: Record<string, unknown>): string => {
  const entryType = BIBTEX_TYPE_BY_CSL_TYPE[String(item.type)] ?? 'misc';
  const key = manuscriptBibtexCitationKey(String(item.id ?? ''));
  const fields = fieldsForItem(item, entryType)
    // A field written twice (`note` on an unpublished entry) keeps the first.
    .filter(
      (field, index, all): field is [string, string] =>
        field[1] !== null &&
        field[1].length > 0 &&
        all.findIndex((other) => other[0] === field[0]) === index,
    )
    .map(([name, value]) => `  ${name} = {${value}}`);
  return [`@${entryType}{${key},`, fields.join(',\n'), '}'].join('\n');
};

export const buildManuscriptBibtex = (
  items: Record<string, unknown>[],
): string =>
  [
    '% Generated by the manuscript composer. Offline, from the manuscript',
    '% reference list — regenerate rather than editing by hand.',
    '',
    ...items.map(entryToBibtex),
    '',
  ].join('\n');
