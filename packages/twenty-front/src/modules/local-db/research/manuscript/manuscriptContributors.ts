import { stripManuscriptScriptMarkers } from './manuscriptScripts';

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
  ',': '˒',
};

const REGULAR_DIGITS = Object.fromEntries(
  Object.entries(SUPERSCRIPT_DIGITS).map(([regular, superscript]) => [
    superscript,
    regular,
  ]),
);

export type ManuscriptAffiliation = {
  id: string;
  name: string;
};

export type ManuscriptAuthor = {
  id: string;
  name: string;
  affiliationIds: string[];
  isCorresponding: boolean;
};

const regularizeSuperscripts = (value: string): string =>
  [...stripManuscriptScriptMarkers(value)]
    .map((character) => REGULAR_DIGITS[character] ?? character)
    .join('');

// One affiliation often wraps onto a second line in the source document. A
// line that ends mid-clause — with a comma, or with "and" — is a continuation,
// not a second institution; without this the AMT draft's single affiliation
// imported as two, and every author's marker pointed at half of it.
const isAffiliationContinuation = (previous: string, line: string): boolean =>
  previous.length > 0 &&
  !/^\d+[.):]?\s/.test(line) &&
  (/[,;&]$/.test(previous) || /\b(?:and|of|for|the)$/i.test(previous));

export const parseManuscriptAffiliations = (
  value: string | null | undefined,
): ManuscriptAffiliation[] => {
  const lines = (value ?? '')
    .split(/\r?\n|[;,]\s*(?=\d+\s)/)
    .map((line) => line.trim().replace(/;$/, '').trim())
    .filter((line) => line.length > 0);

  const joined: string[] = [];
  for (const line of lines) {
    const previous = joined[joined.length - 1] ?? '';
    if (isAffiliationContinuation(previous, line)) {
      joined[joined.length - 1] = `${previous} ${line}`.replace(/\s+/g, ' ');
      continue;
    }
    joined.push(line);
  }

  return joined.map((line, index) => ({
    id: `affiliation-${index + 1}`,
    name: line.replace(/^\d+[.)]?\s*/, '').trim(),
  }));
};

// "Jane Smith, John Doe" is two authors; "Smith, J." is one. A comma only
// separates authors when every chunk it makes still reads as a whole name.
const splitOnAuthorCommas = (value: string): string[] => {
  const chunks = value
    .split(',')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  return chunks.length > 1 &&
    chunks.every((chunk) => /\s/.test(chunk) && !INITIALS_ONLY.test(chunk))
    ? chunks
    : [value];
};

const INITIALS_ONLY = /^(?:\p{Lu}\.?(?:\s*[-–]\s*\p{Lu}\.?)?\s*)+$/u;

const authorParts = (value: string): string[] => {
  if (value.includes(';')) return value.split(';');
  const matches = [
    ...regularizeSuperscripts(value).matchAll(
      /(?:^|,\s*)(.*?)(\d+(?:,\d+)*\*?)(?=,\s*\[?\p{Lu}|$)/gu,
    ),
  ];
  if (matches.length > 0) {
    return matches.map((match) => `${match[1]} [${match[2]}]`);
  }
  // A journal byline separates its authors with "and" or an ampersand and
  // carries no affiliation markers at all — "Ahmad Jalil and Hossein
  // Kazemian" is two people, not one author with a very long name.
  return value
    .split(/\s+and\s+|\s*&\s*/i)
    .map((part) => part.trim().replace(/,$/, '').trim())
    .filter((part) => part.length > 0)
    .flatMap(splitOnAuthorCommas);
};

export const parseManuscriptAuthors = (
  value: string | null | undefined,
  affiliations: ManuscriptAffiliation[],
): ManuscriptAuthor[] => {
  const authors = parseAuthorParts(value, affiliations);
  // A single-institution paper prints no markers at all, so every author
  // belongs to the one affiliation it does list.
  return affiliations.length === 1 &&
    authors.every((author) => author.affiliationIds.length === 0)
    ? authors.map((author) => ({
        ...author,
        affiliationIds: [affiliations[0].id],
      }))
    : authors;
};

const parseAuthorParts = (
  value: string | null | undefined,
  affiliations: ManuscriptAffiliation[],
): ManuscriptAuthor[] =>
  authorParts(value ?? '')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const normalized = regularizeSuperscripts(part);
      const bracketed = /^(.*?)\s*\[([\d,\s]*)(\*)?\]\s*$/.exec(normalized);
      const trailing = /^(.*?)(\d+(?:,\d+)*)(\*)?\s*$/.exec(normalized);
      const match = bracketed ?? trailing;
      const numbers = (match?.[2] ?? '')
        .split(',')
        .map((number) => Number(number.trim()))
        .filter((number) => Number.isInteger(number) && number > 0);
      return {
        id: `author-${index + 1}`,
        name: (match?.[1] ?? normalized).trim().replace(/,$/, '').trim(),
        affiliationIds: numbers.flatMap((number) => {
          const affiliation = affiliations[number - 1];
          return affiliation === undefined ? [] : [affiliation.id];
        }),
        isCorresponding: match?.[3] === '*',
      };
    });

export const serializeManuscriptAffiliations = (
  affiliations: ManuscriptAffiliation[],
): string =>
  affiliations
    .filter((affiliation) => affiliation.name.trim().length > 0)
    .map((affiliation, index) => `${index + 1} ${affiliation.name.trim()}`)
    .join('\n');

export const serializeManuscriptAuthors = (
  authors: ManuscriptAuthor[],
  affiliations: ManuscriptAffiliation[],
): string => {
  const numberById = new Map(
    affiliations.map((affiliation, index) => [affiliation.id, index + 1]),
  );
  return authors
    .filter((author) => author.name.trim().length > 0)
    .map((author) => {
      const numbers = author.affiliationIds
        .flatMap((id) => {
          const number = numberById.get(id);
          return number === undefined ? [] : [number];
        })
        .sort((left, right) => left - right);
      const reference = `${numbers.join(',')}${author.isCorresponding ? '*' : ''}`;
      return `${author.name.trim()}${reference.length > 0 ? ` [${reference}]` : ''}`;
    })
    .join('; ');
};

export const formatManuscriptAuthorLine = (
  value: string | null | undefined,
  affiliationValue: string | null | undefined,
): string => {
  const affiliations = parseManuscriptAffiliations(affiliationValue);
  return parseManuscriptAuthors(value, affiliations)
    .map((author) => {
      const numberById = new Map(
        affiliations.map((affiliation, index) => [affiliation.id, index + 1]),
      );
      const reference = [
        ...author.affiliationIds
          .flatMap((id) => {
            const number = numberById.get(id);
            return number === undefined ? [] : [number];
          })
          .sort((left, right) => left - right)
          .join(','),
      ]
        .map((character) => SUPERSCRIPT_DIGITS[character] ?? character)
        .join('');
      return `${author.name}${reference}${author.isCorresponding ? '*' : ''}`;
    })
    .join(', ');
};

export type AuthorLineSegment = {
  text: string;
  superscript: boolean;
};

export const manuscriptAuthorLineSegments = (
  value: string,
): AuthorLineSegment[] => {
  const segments: AuthorLineSegment[] = [];
  let buffer = '';
  let isSuperscript = false;
  const flush = () => {
    if (buffer.length === 0) return;
    segments.push({ text: buffer, superscript: isSuperscript });
    buffer = '';
  };
  for (const character of value) {
    const regular = REGULAR_DIGITS[character];
    const nextIsSuperscript = regular !== undefined || character === '*';
    if (nextIsSuperscript !== isSuperscript) {
      flush();
      isSuperscript = nextIsSuperscript;
    }
    buffer += regular ?? character;
  }
  flush();
  return segments;
};
