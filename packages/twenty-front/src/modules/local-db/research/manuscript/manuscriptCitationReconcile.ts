// Citation reconciliation for imported manuscripts. An imported paper keeps its
// citations as *text* — `[1]` or `(Mendell et al., 2013)` — and a References
// section as one block. This turns those into live citations: it parses the
// reference list into `reference` drafts (CSL-JSON-first), assigns citation
// keys, and rewrites the in-text markers to `[@key]` so the composer can
// re-style them and build a bibliography. Pure and unit-tested; entry fields
// are read by `manuscriptReferenceParse`, and the verbatim entry travels with
// the record so an imperfect parse is never lossy — the linking is exact.

import {
  cslItemToReferenceDraft,
  type ReferenceDraft,
} from './manuscriptReferenceImport';
import { parseReferenceEntryFields } from './manuscriptReferenceParse';
import { generateCitationKey } from './manuscriptReferenceStore';
import { type ImportedSectionDraft } from './manuscriptDocImport';

// The disambiguating suffix is part of the citation: "Weakley et al., 2018a"
// and "…, 2018b" are two different papers.
const YEAR_RE = /\b(?:19|20)\d{2}\b/;

// One parsed reference-list entry: its 1-based list number (for numeric styles)
// and the draft it became.
export type ParsedReferenceEntry = {
  index: number;
  draft: ReferenceDraft;
  // "2018a" → "a": the year suffix the source used to tell two papers apart.
  yearSuffix?: string;
};

// Split a References section body into individual entries. Handles numbered
// lists ("1. …", "[1] …", "1) …") with multi-line wrapping, and falls back to
// one-entry-per-line.
const splitReferenceEntries = (
  text: string,
): { index: number; raw: string }[] => {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    // Drop a leading "References"/"Bibliography" heading if it survived.
    .filter(
      (line, position) =>
        line.length > 0 &&
        !(
          position === 0 &&
          /^(references|bibliography|works cited)$/i.test(line)
        ),
    );

  const marker = /^\[?(\d+)[\].)]\s+(.*)$/;
  const numbered = lines.filter((line) => marker.test(line)).length;

  // Numbered list: a new entry starts at each marker; later lines wrap into it.
  if (numbered >= Math.max(2, Math.ceil(lines.length / 2))) {
    const entries: { index: number; raw: string }[] = [];
    for (const line of lines) {
      const match = marker.exec(line);
      if (match !== null) {
        entries.push({ index: Number(match[1]), raw: match[2].trim() });
      } else if (entries.length > 0) {
        entries[entries.length - 1].raw += ` ${line}`;
      }
    }
    return entries;
  }

  // Otherwise: one entry per non-empty line, numbered by position.
  return lines.map((raw, position) => ({ index: position + 1, raw }));
};

// Pull the first author's family name from the head of an entry.
const firstAuthorFamily = (raw: string): string => {
  const head = raw.split(YEAR_RE)[0] ?? raw;
  // "Mendell, M. J.; …" → Mendell · "M. Mendell and …" → Mendell · "Mendell MJ" → Mendell
  const beforeComma = head.split(/[,;]/)[0]?.trim() ?? '';
  const token = beforeComma.includes('.')
    ? (beforeComma.split(/\s+/).find((part) => !part.includes('.')) ??
      beforeComma)
    : (beforeComma.split(/\s+/).pop() ?? beforeComma);
  // Keep the letters the author actually wrote: stripping non-ASCII turned
  // "Düsing" into "Dsing" in the printed bibliography. The citation *key* is
  // transliterated separately.
  return token.replace(/[^\p{L}-]/gu, '');
};

// Best-effort title: the text between the author/year head and the next strong
// delimiter. Falls back to the whole entry so nothing is lost.
const parseEntryToDraft = (
  raw: string,
  referenceIndex: number,
  takenKeys: Set<string>,
): { draft: ReferenceDraft; yearSuffix: string } => {
  const fields = parseReferenceEntryFields(raw);
  const yearSuffix = fields.yearSuffix ?? '';
  const cslItem: Record<string, unknown> = {
    id: 'tmp',
    type: 'article-journal',
    title: fields.title ?? raw,
    ...(fields.authors.length > 0 ? { author: fields.authors } : {}),
    ...(fields.year !== undefined
      ? { issued: { 'date-parts': [[fields.year]] } }
      : {}),
    ...(fields.containerTitle !== undefined
      ? { 'container-title': fields.containerTitle }
      : {}),
    ...(fields.volume !== undefined ? { volume: fields.volume } : {}),
    ...(fields.issue !== undefined ? { issue: fields.issue } : {}),
    ...(fields.pages !== undefined ? { page: fields.pages } : {}),
    ...(fields.doi !== undefined ? { DOI: fields.doi } : {}),
    ...(fields.url !== undefined ? { URL: fields.url } : {}),
    // Keep the exact source entry inside the portable CSL record. The fallback
    // bibliography formatter can then reproduce imported references verbatim
    // instead of duplicating best-effort parsed fields and DOI text.
    'researcher:rawReference': raw,
    // The source truncated its own author list, so a style that would print
    // every name has fewer to print than the paper did.
    ...(fields.truncatedAuthors ? { 'researcher:truncatedAuthors': true } : {}),
    // Keep numbered-list order portable even though the reference object has
    // no custom orderIndex field. The linker also supports older imports via
    // their record creation timestamps.
    'researcher:referenceIndex': referenceIndex,
  };
  const draft = cslItemToReferenceDraft(cslItem);
  // Reuse the source's own disambiguation when it has one, so a paper cited as
  // "2018b" keeps that identity instead of being renamed by arrival order.
  const suffixedKey =
    yearSuffix.length > 0
      ? `${generateCitationKey({ authors: draft.authors, year: draft.year }, new Set())}${yearSuffix}`
      : undefined;
  const citationKey =
    suffixedKey !== undefined && !takenKeys.has(suffixedKey)
      ? suffixedKey
      : generateCitationKey(
          { authors: draft.authors, year: draft.year },
          takenKeys,
        );
  takenKeys.add(citationKey);
  // Keep the raw entry so an imperfect parse is never lossy.
  return { draft: { ...draft, citationKey, notes: raw }, yearSuffix };
};

export const parseReferenceList = (text: string): ParsedReferenceEntry[] => {
  const taken = new Set<string>();
  return splitReferenceEntries(text)
    .filter(
      ({ raw }) => raw.length > 0 && !/^(?:table|fig(?:ure)?|\[#)/i.test(raw),
    )
    .map(({ index, raw }) => {
      const { draft, yearSuffix } = parseEntryToDraft(raw, index, taken);
      return {
        index,
        draft,
        ...(yearSuffix.length > 0 ? { yearSuffix } : {}),
      };
    });
};

export type CitationStyleGuess = 'numeric' | 'author-date' | 'none';

// Decide which in-text convention the body uses, so we relink the right one.
export const detectCitationStyle = (body: string): CitationStyleGuess => {
  const numeric = (
    body.match(/\[\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+)*\]/g) ?? []
  ).length;
  const authorDate = (body.match(/\([^)]*\b(?:19|20)\d{2}[a-z]?\)/g) ?? [])
    .length;
  if (numeric === 0 && authorDate === 0) return 'none';
  return numeric >= authorDate ? 'numeric' : 'author-date';
};

// Expand a numeric token's inner list ("1,3–5") to the individual numbers.
const expandNumbers = (inner: string): number[] => {
  const numbers: number[] = [];
  for (const part of inner.split(',')) {
    const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part.trim());
    if (range !== null) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let n = start; n <= end; n += 1) numbers.push(n);
    } else if (/^\d+$/.test(part.trim())) {
      numbers.push(Number(part.trim()));
    }
  }
  return numbers;
};

const relinkNumeric = (
  content: string,
  byIndex: Map<number, string>,
): { content: string; linked: number } => {
  let linked = 0;
  const next = content.replace(
    /\[(\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*)\]/g,
    (whole, inner: string) => {
      const keys = expandNumbers(inner).map((n) => byIndex.get(n));
      if (keys.some((key) => key === undefined)) return whole;
      linked += keys.length;
      return `[${keys.map((key) => `@${key}`).join('; ')}]`;
    },
  );
  return { content: next, linked };
};

// Every year token in one citation part, including the shorthand a reference
// list uses for two papers by the same authors in the same year:
// "Weakley et al., 2018a, b" cites 2018a *and* 2018b.
const YEARS_IN_PART =
  /\b((?:19|20)\d{2})([a-z])?\b|(?<=[,;]\s*)([a-z])(?=\s*[,;)]|$)/g;

const partYearTokens = (part: string): string[] => {
  const tokens: string[] = [];
  let lastYear = '';
  YEARS_IN_PART.lastIndex = 0;
  for (
    let match = YEARS_IN_PART.exec(part);
    match !== null;
    match = YEARS_IN_PART.exec(part)
  ) {
    if (match[1] !== undefined) {
      lastYear = match[1];
      tokens.push(`${match[1]}${match[2] ?? ''}`);
      continue;
    }
    // A bare letter only continues a year that was itself suffixed.
    if (lastYear.length > 0 && tokens.at(-1)?.length === 5) {
      tokens.push(`${lastYear}${match[3]}`);
    }
  }
  return tokens;
};

// The name(s) immediately before a narrative citation: "Petzold et al. (2013)",
// "Bond and Doherty (2013)", "Zotter et al. (2017)".
const NARRATIVE_AUTHOR =
  /(\p{Lu}[\p{L}'’-]+)(?:\s*(?:,|and|&)\s*\p{Lu}[\p{L}'’-]+)*(?:\s+et\s+al\.?)?[’']?s?\s*$/u;

const ONLY_YEARS =
  /^[\s(]*(?:(?:19|20)\d{2}[a-z]?)(?:\s*[,;]\s*(?:(?:19|20)\d{2}[a-z]?|[a-z]))*[\s)]*$/;

const relinkAuthorDate = (
  content: string,
  byAuthorYear: Map<string, string>,
): { content: string; linked: number } => {
  let linked = 0;
  const lookup = (family: string, yearToken: string): string | undefined =>
    byAuthorYear.get(`${family.toLowerCase()}|${yearToken}`) ??
    // A source that never disambiguated still matches the plain year.
    byAuthorYear.get(`${family.toLowerCase()}|${yearToken.slice(0, 4)}`);

  const next = content.replace(
    /\(([^)]*\b(?:19|20)\d{2}[a-z]?[^)]*)\)/g,
    (whole: string, inner: string, offset: number) => {
      // Narrative form: the author's name sits in the prose and only the year
      // is bracketed. The citation is then author-suppressed, so the rendered
      // year replaces the parentheses without repeating the name.
      if (ONLY_YEARS.test(inner)) {
        const family = NARRATIVE_AUTHOR.exec(
          content.slice(0, offset).trimEnd(),
        )?.[1];
        if (family === undefined) return whole;
        const keys = partYearTokens(inner).map((yearToken) =>
          lookup(family, yearToken),
        );
        if (keys.length === 0 || keys.some((key) => key === undefined)) {
          return whole;
        }
        linked += keys.length;
        return `[${keys.map((key) => `-@${key}`).join('; ')}]`;
      }

      // Split multiple citations in one paren group: "A, 2019; B et al., 2020".
      const parts = inner.split(';').map((part) => part.trim());
      const keys: string[] = [];
      for (const part of parts) {
        const family = firstAuthorFamily(part);
        const yearTokens = partYearTokens(part);
        if (family.length === 0 || yearTokens.length === 0) return whole;
        for (const yearToken of yearTokens) {
          const key = lookup(family, yearToken);
          if (key === undefined) return whole; // leave the whole group untouched
          keys.push(key);
        }
      }
      linked += keys.length;
      return `[${keys.map((key) => `@${key}`).join('; ')}]`;
    },
  );
  return { content: next, linked };
};

export type ReconcileResult = {
  sections: ImportedSectionDraft[];
  references: ReferenceDraft[];
  linkedCount: number;
  style: CitationStyleGuess;
};

// Reconcile an imported document: parse its References section into reference
// drafts and rewrite in-text markers in the other sections to `[@key]`.
export const reconcileImportedCitations = (
  sections: ImportedSectionDraft[],
): ReconcileResult => {
  const referencesSection = sections.find(
    (section) => section.sectionType === 'REFERENCES',
  );
  if (referencesSection === undefined) {
    return { sections, references: [], linkedCount: 0, style: 'none' };
  }

  const entries = parseReferenceList(referencesSection.content);
  if (entries.length === 0) {
    return { sections, references: [], linkedCount: 0, style: 'none' };
  }

  const byIndex = new Map(
    entries.map((entry) => [entry.index, entry.draft.citationKey as string]),
  );
  const byAuthorYear = new Map<string, string>();
  for (const entry of entries) {
    const family = (entry.draft.authors ?? '')
      .split(/[,;]/)[0]
      ?.trim()
      .toLowerCase();
    const year = entry.draft.year ?? '';
    const citationKey = entry.draft.citationKey as string;
    // Suffixed entries answer to both "2018a" and (for the first of them) the
    // bare year, so a source that cites inconsistently still links.
    const suffixed = `${family}|${year}${entry.yearSuffix ?? ''}`;
    if (!byAuthorYear.has(suffixed)) byAuthorYear.set(suffixed, citationKey);
    const plain = `${family}|${year}`;
    if (!byAuthorYear.has(plain)) byAuthorYear.set(plain, citationKey);
  }

  const body = sections
    .filter((section) => section.sectionType !== 'REFERENCES')
    .map((section) => section.content)
    .join('\n');
  const style = detectCitationStyle(body);

  let linkedCount = 0;
  const relinked = sections.map((section) => {
    if (section.sectionType === 'REFERENCES') return section;
    const result =
      style === 'author-date'
        ? relinkAuthorDate(section.content, byAuthorYear)
        : relinkNumeric(section.content, byIndex);
    linkedCount += result.linked;
    return { ...section, content: result.content };
  });

  return {
    sections: relinked,
    references: entries.map((entry) => entry.draft),
    linkedCount,
    style,
  };
};
