// One free-text reference-list entry → structured CSL fields.
//
// An imported bibliography is prose: "Bond, T. C., Doherty, S. J., Fahey, D. W.,
// et al. (2013). Bounding the role of black carbon… Journal of Geophysical
// Research: Atmospheres, 118, 5380–5552." Storing only the first family name and
// the year — which is all the importer used to recover — makes the *exported*
// bibliography read "Bond: Bounding the role…, 2013.": every co-author, every
// initial, the journal, the volume and the pages gone, and every in-text
// citation reduced to "(Bond, 2013)" where the paper said "(Bond et al., 2013)".
//
// This reads the whole entry. It recognises the three shapes reference lists
// actually come in:
//
//   author-date   Bond, T. C., and Doherty, S. J. (2013). Title. Journal, 118, 5380–5552.
//   Copernicus    Bond, T. C., and Doherty, S. J.: Title, J. Geophys. Res., 118, 5380–5552, 2013.
//   ACS/Vancouver Mendell, M. J.; et al. Title. Indoor Air 2013, 23, 515-528.
//
// Anything it cannot read confidently it leaves unset rather than guessing: the
// verbatim entry is kept alongside, so a partial parse is never lossy.

export type ParsedReferenceName = {
  family: string;
  given?: string;
};

export type ParsedReferenceEntryFields = {
  authors: ParsedReferenceName[];
  // The source truncated the author list ("et al."), so the names we have are
  // a prefix of the real list.
  truncatedAuthors: boolean;
  year?: number;
  yearSuffix?: string;
  title?: string;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
};

const DOI_PATTERN = /10\.\d{4,9}\/[^\s"'<>]+/i;
const URL_PATTERN = /https?:\/\/\S+/gi;
const YEAR_PATTERN = /\b((?:19|20)\d{2})([a-z])?\b/;

// A DOI runs to the first whitespace or quote. Elsevier suffixes carry balanced
// parentheses ("10.1016/S0021-8502(03)00359-8"), so a closing bracket only ends
// the DOI when nothing inside it opened one.
const trimDoi = (raw: string): string => {
  let doi = raw.replace(/[.,;:]+$/, '');
  while (doi.endsWith(')')) {
    const opens = (doi.match(/\(/g) ?? []).length;
    const closes = (doi.match(/\)/g) ?? []).length;
    if (closes <= opens) break;
    doi = doi.slice(0, -1).replace(/[.,;:]+$/, '');
  }
  return doi;
};

export const extractReferenceDoi = (raw: string): string => {
  const match = DOI_PATTERN.exec(raw);
  return match === null ? '' : trimDoi(match[0]);
};

const extractReferenceUrl = (raw: string): string | undefined => {
  URL_PATTERN.lastIndex = 0;
  for (const match of raw.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;]+$/, '');
    if (!/doi\.org/i.test(url)) return url;
  }
  return undefined;
};

// Everything that is an identifier rather than bibliographic prose.
const withoutIdentifiers = (raw: string): string =>
  raw
    .replace(URL_PATTERN, ' ')
    .replace(new RegExp(`doi:\\s*${DOI_PATTERN.source}`, 'gi'), ' ')
    .replace(new RegExp(DOI_PATTERN.source, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

// "T. C." · "C.-H." · "MJ" · "A. S. H." — the given-name half of a name that a
// comma already split away from its family half.
const INITIALS = /^(?:\p{Lu}\.?(?:\s*[-–]\s*\p{Lu}\.?)?\s*)+$/u;
// "Mendell MJ" — Vancouver runs the initials on without punctuation.
const RUN_ON_INITIALS = /^(.*\p{L})\s+(\p{Lu}{1,3})$/u;
const ET_AL = /,?\s*(?:et\s+al\.?|and\s+others)\.?\s*$/i;

const cleanNamePart = (value: string): string =>
  value
    .replace(/^[\s.,;&]+|[\s,;&]+$/g, '')
    .replace(/^and\s+/i, '')
    .trim();

// Split an author head into names. Commas do double duty in "Family, G. I.,
// Family2, G. I." — separating a family from its initials *and* one author from
// the next — so walk the chunks and let the initials pattern decide.
export const parseReferenceAuthorHead = (
  head: string,
): { authors: ParsedReferenceName[]; truncatedAuthors: boolean } => {
  const truncatedAuthors = ET_AL.test(head);
  const body = head.replace(ET_AL, '').replace(/\s*&\s*/g, ' and ');
  const chunks = body
    .split(/[,;]|\s+and\s+/i)
    .map(cleanNamePart)
    .filter((chunk) => chunk.length > 0);

  const authors: ParsedReferenceName[] = [];
  for (const chunk of chunks) {
    if (INITIALS.test(chunk) && authors.length > 0) {
      const last = authors[authors.length - 1];
      if (last.given === undefined) {
        last.given = chunk.replace(/\s+/g, ' ').trim();
        continue;
      }
    }
    const runOn = RUN_ON_INITIALS.exec(chunk);
    if (runOn !== null) {
      authors.push({ family: runOn[1].trim(), given: runOn[2] });
      continue;
    }
    authors.push({ family: chunk });
  }
  return { authors, truncatedAuthors };
};

type Segmented = {
  head?: string;
  rest: string;
  year?: number;
  yearSuffix?: string;
};

// A head is an author list only if it is punctuated like one. Without this,
// "U.S. Environmental Protection Agency. Positive Matrix Factorization model."
// would be cut at its first initial and lose the organisation's name.
const looksLikeAuthorHead = (head: string): boolean =>
  head.length > 0 &&
  head.length <= 400 &&
  !YEAR_PATTERN.test(head) &&
  (/[,;]/.test(head) || ET_AL.test(head) || /\p{Lu}\./u.test(head));

// Split an entry into its author head and everything after it, taking the year
// with it when the entry states the year up front.
const segmentEntry = (plain: string): Segmented => {
  // Copernicus: "Authors: Title, Journal, …, Year."
  const colon = /^([^:]{3,300}?[\p{L}.])\s*:\s+(.+)$/u.exec(plain);
  if (colon !== null && looksLikeAuthorHead(colon[1])) {
    return { head: colon[1], rest: colon[2] };
  }

  // Author-date: "Authors (2013). Title. Journal, …"
  const parenthesised =
    /^(.*?)\(\s*((?:19|20)\d{2})([a-z])?\s*\)\s*[.,:]?\s*/.exec(plain);
  if (parenthesised !== null && looksLikeAuthorHead(parenthesised[1].trim())) {
    return {
      head: parenthesised[1],
      rest: plain.slice(parenthesised[0].length),
      year: Number(parenthesised[2]),
      ...(parenthesised[3] !== undefined
        ? { yearSuffix: parenthesised[3] }
        : {}),
    };
  }

  // ACS / Vancouver: the author list ends at "et al.", or — failing that — at
  // the last initial before the title. "Mendell, M. J.; et al. Classroom…"
  // must not stop at "M.", so an explicit et-al wins and a bare initial only
  // counts when another initial does not follow it.
  const etAl = /(?:et\s+al\.|and\s+others\.)\s+(?=\p{Lu})/u.exec(plain);
  const boundaryEnd =
    etAl !== null
      ? etAl.index + etAl[0].length
      : [...plain.matchAll(/\p{Lu}\.\s+(?=\p{Lu})/gu)]
          .filter(
            (match) =>
              !/^\p{Lu}\.|^\p{Lu}{1,3}\b/u.test(
                plain.slice(match.index + match[0].length),
              ),
          )
          .at(-1)?.index;
  if (boundaryEnd !== undefined) {
    const end =
      etAl !== null
        ? boundaryEnd
        : boundaryEnd +
          (/\p{Lu}\.\s+/u.exec(plain.slice(boundaryEnd))?.[0].length ?? 0);
    const head = plain.slice(0, end);
    if (looksLikeAuthorHead(head.trim()) && /[,;]/.test(head)) {
      return { head, rest: plain.slice(end) };
    }
  }

  return { rest: plain };
};

const PAGES = /^(?:pp?\.\s*)?(\d+)\s*(?:[–—-]{1,2}\s*(\d+))?$/;
const VOLUME = /^(\d+)(?:\s*\(\s*([^)]+)\s*\))?$/;

type TailFields = Pick<
  ParsedReferenceEntryFields,
  'containerTitle' | 'volume' | 'issue' | 'pages' | 'year' | 'yearSuffix'
>;

// "Indoor Air. 2013;23(6):515-528." — the biomedical form packs the whole tail
// into one segment with its own punctuation.
const VANCOUVER_TAIL =
  /^(.*?)[.,]?\s*((?:19|20)\d{2})\s*[;,]\s*(\d+)\s*(?:\(([^)]+)\))?\s*[:,]\s*((?:\d+)(?:\s*[–—-]\s*\d+)?)/;

const parseTail = (tail: string): TailFields => {
  const cleaned = tail
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:]+/, '')
    .trim();
  if (cleaned.length === 0) return {};

  const vancouver = VANCOUVER_TAIL.exec(cleaned);
  if (vancouver !== null) {
    return {
      ...(vancouver[1].trim().length > 0
        ? { containerTitle: vancouver[1].replace(/[.,;\s]+$/, '').trim() }
        : {}),
      year: Number(vancouver[2]),
      volume: vancouver[3],
      ...(vancouver[4] !== undefined ? { issue: vancouver[4].trim() } : {}),
      pages: vancouver[5].replace(/\s+/g, ''),
    };
  }

  const segments = cleaned
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const fields: TailFields = {};
  const remaining: string[] = [];
  for (const raw of segments) {
    // Numbers and years never end in a meaningful period; a journal name can.
    const segment = raw.replace(/[.\s]+$/, '').trim();
    if (segment.length === 0) continue;
    const year = /^((?:19|20)\d{2})([a-z])?$/.exec(segment);
    if (year !== null) {
      fields.year = Number(year[1]);
      if (year[2] !== undefined) fields.yearSuffix = year[2];
      continue;
    }
    const pages = PAGES.exec(segment);
    if (pages !== null && pages[2] !== undefined) {
      fields.pages = `${pages[1]}–${pages[2]}`;
      continue;
    }
    const volume = VOLUME.exec(segment);
    if (volume !== null && fields.volume === undefined) {
      fields.volume = volume[1];
      if (volume[2] !== undefined) fields.issue = volume[2].trim();
      continue;
    }
    // A lone page number ("515") only reads as pages once a volume is known.
    if (pages !== null && fields.volume !== undefined) {
      fields.pages = pages[1];
      continue;
    }
    remaining.push(raw);
  }

  const container = remaining.join(', ').trim();
  if (container.length > 0) {
    // "Indoor Air 2013" — ACS puts the year inside the container segment.
    const trailingYear = /^(.*?)[\s.,]*\b((?:19|20)\d{2})([a-z])?\.?$/.exec(
      container,
    );
    const named =
      trailingYear !== null && trailingYear[1].trim().length > 0
        ? trailingYear[1].trim()
        : container;
    if (trailingYear !== null && trailingYear[1].trim().length > 0) {
      fields.year ??= Number(trailingYear[2]);
      if (trailingYear[3] !== undefined) fields.yearSuffix ??= trailingYear[3];
    }
    // "J. Geophys. Res.-Atmos." abbreviates: that closing period is part of
    // the journal's name. A name with no other period ends a sentence instead.
    fields.containerTitle = /\./.test(named.slice(0, -1))
      ? named.replace(/[,;\s]+$/, '').trim()
      : named.replace(/[.,;\s]+$/, '').trim();
  }
  return fields;
};

// Where a title ends and the container information begins. A sentence break is
// the strongest signal, but "J. Geophys. Res." is full of abbreviating periods,
// so only a period followed by a space and a capital counts — and never one
// that closes an initial.
const splitTitleAndTail = (rest: string): { title: string; tail: string } => {
  const sentence = /(?<!\b\p{Lu})\.\s+(?=[^\s])/u.exec(rest);
  if (sentence !== null) {
    return {
      title: rest.slice(0, sentence.index).trim(),
      tail: rest.slice(sentence.index + sentence[0].length),
    };
  }
  return { title: rest.replace(/[.\s]+$/, '').trim(), tail: '' };
};

// Copernicus separates title from container with a comma, not a full stop, and
// the tail always ends with the year — so read the tail backwards and let the
// title keep everything the tail did not claim (commas in the title included).
const splitCopernicusTitleAndTail = (
  rest: string,
): { title: string; tail: string } => {
  const segments = rest.split(',');
  let boundary = segments.length;
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const segment = segments[index].replace(/[.\s]+$/, '').trim();
    const structural =
      /^((?:19|20)\d{2})([a-z])?$/.test(segment) ||
      PAGES.test(segment) ||
      VOLUME.test(segment) ||
      segment.length === 0;
    if (!structural) {
      // The segment before the numbers is the journal name.
      boundary = index;
      break;
    }
    boundary = index;
  }
  return {
    title: segments
      .slice(0, boundary)
      .join(',')
      .replace(/[.\s]+$/, '')
      .trim(),
    tail: segments.slice(boundary).join(','),
  };
};

export const parseReferenceEntryFields = (
  raw: string,
): ParsedReferenceEntryFields => {
  const doi = extractReferenceDoi(raw);
  const url = extractReferenceUrl(raw);
  const plain = withoutIdentifiers(raw).replace(/[\s.]+$/, '');
  const segmented = segmentEntry(plain);

  const { authors, truncatedAuthors } =
    segmented.head === undefined
      ? { authors: [], truncatedAuthors: false }
      : parseReferenceAuthorHead(segmented.head);

  const isCopernicus =
    segmented.head !== undefined &&
    segmented.year === undefined &&
    plain.startsWith(segmented.head) &&
    /^[^:]*:\s/.test(plain);

  // With no author head there is no reliable boundary between a title and a
  // container, and an institutional entry ("U.S. Environmental Protection
  // Agency. Positive Matrix Factorization model.") has no container at all —
  // so keep the text whole rather than inventing a journal for it.
  const { title, tail } =
    segmented.head === undefined
      ? { title: segmented.rest.replace(/[.\s]+$/, '').trim(), tail: '' }
      : isCopernicus
        ? splitCopernicusTitleAndTail(segmented.rest)
        : splitTitleAndTail(segmented.rest);
  const tailFields = parseTail(tail);

  const fallbackYear = YEAR_PATTERN.exec(plain);
  const year =
    segmented.year ??
    tailFields.year ??
    (fallbackYear === null ? undefined : Number(fallbackYear[1]));
  const yearSuffix =
    segmented.yearSuffix ??
    tailFields.yearSuffix ??
    (segmented.year === undefined && tailFields.year === undefined
      ? fallbackYear?.[2]
      : undefined);

  return {
    authors,
    truncatedAuthors,
    ...(year !== undefined && Number.isFinite(year) ? { year } : {}),
    ...(yearSuffix !== undefined ? { yearSuffix } : {}),
    ...(title !== undefined && title.length > 0 ? { title } : {}),
    ...(tailFields.containerTitle !== undefined
      ? { containerTitle: tailFields.containerTitle }
      : {}),
    ...(tailFields.volume !== undefined ? { volume: tailFields.volume } : {}),
    ...(tailFields.issue !== undefined ? { issue: tailFields.issue } : {}),
    ...(tailFields.pages !== undefined ? { pages: tailFields.pages } : {}),
    ...(doi.length > 0 ? { doi } : {}),
    ...(url !== undefined ? { url } : {}),
  };
};
