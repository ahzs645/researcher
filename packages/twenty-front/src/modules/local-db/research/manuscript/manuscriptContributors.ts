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

export const parseManuscriptAffiliations = (
  value: string | null | undefined,
): ManuscriptAffiliation[] =>
  (value ?? '')
    .split(/\r?\n|;\s*(?=\d+\s)/)
    .map((line) => line.trim().replace(/;$/, '').trim())
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      id: `affiliation-${index + 1}`,
      name: line.replace(/^\d+[.)]?\s*/, '').trim(),
    }));

const authorParts = (value: string): string[] => {
  if (value.includes(';')) return value.split(';');
  const matches = [
    ...regularizeSuperscripts(value).matchAll(
      /(?:^|,\s*)(.*?)(\d+(?:,\d+)*\*?)(?=,\s*[\p{Lu}]|$)/gu,
    ),
  ];
  return matches.length > 0
    ? matches.map((match) => `${match[1]} [${match[2]}]`)
    : [value];
};

export const parseManuscriptAuthors = (
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
