// Citation reconciliation for imported manuscripts. An imported paper keeps its
// citations as *text* — `[1]` or `(Mendell et al., 2013)` — and a References
// section as one block. This turns those into live citations: it parses the
// reference list into `reference` drafts (CSL-JSON-first), assigns citation
// keys, and rewrites the in-text markers to `[@key]` so the composer can
// re-style them and build a bibliography. Pure and unit-tested; free-text
// reference parsing is heuristic (author/year/DOI are reliable; title/journal
// are best-effort), so records may need light cleanup — but the linking is exact.

import {
  cslItemToReferenceDraft,
  type ReferenceDraft,
} from './manuscriptReferenceImport';
import { generateCitationKey } from './manuscriptReferenceStore';
import { type ImportedSectionDraft } from './manuscriptDocImport';

const DOI_RE = /10\.\d{4,9}\/[^\s,;)"']+/i;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;

// One parsed reference-list entry: its 1-based list number (for numeric styles)
// and the draft it became.
export type ParsedReferenceEntry = {
  index: number;
  draft: ReferenceDraft;
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
  return token.replace(/[^A-Za-z-]/g, '');
};

// Best-effort title: the text between the author/year head and the next strong
// delimiter. Falls back to the whole entry so nothing is lost.
const guessTitle = (raw: string): string => {
  const afterYear = raw.split(YEAR_RE).slice(1).join(' ').trim();
  const candidate = afterYear.length > 0 ? afterYear : raw;
  const firstSentence = candidate.split(/(?<=[.?])\s/)[0]?.trim() ?? candidate;
  return (firstSentence.length >= 8 ? firstSentence : raw)
    .replace(/\s+/g, ' ')
    .trim();
};

const parseEntryToDraft = (
  raw: string,
  takenKeys: Set<string>,
): ReferenceDraft => {
  const doi = DOI_RE.exec(raw)?.[0] ?? '';
  const yearText = YEAR_RE.exec(raw)?.[0];
  const year = yearText === undefined ? undefined : Number(yearText);
  const family = firstAuthorFamily(raw);
  const cslItem: Record<string, unknown> = {
    id: 'tmp',
    type: 'article-journal',
    title: guessTitle(raw),
    ...(family.length > 0 ? { author: [{ family }] } : {}),
    ...(year !== undefined && Number.isFinite(year)
      ? { issued: { 'date-parts': [[year]] } }
      : {}),
    ...(doi.length > 0 ? { DOI: doi } : {}),
    // Keep the exact source entry inside the portable CSL record. The fallback
    // bibliography formatter can then reproduce imported references verbatim
    // instead of duplicating best-effort parsed fields and DOI text.
    'researcher:rawReference': raw,
  };
  const draft = cslItemToReferenceDraft(cslItem);
  const citationKey = generateCitationKey(
    { authors: draft.authors, year: draft.year },
    takenKeys,
  );
  takenKeys.add(citationKey);
  // Keep the raw entry so an imperfect parse is never lossy.
  return { ...draft, citationKey, notes: raw };
};

export const parseReferenceList = (text: string): ParsedReferenceEntry[] => {
  const taken = new Set<string>();
  return splitReferenceEntries(text)
    .filter(
      ({ raw }) => raw.length > 0 && !/^(?:table|fig(?:ure)?|\[#)/i.test(raw),
    )
    .map(({ index, raw }) => ({
      index,
      draft: parseEntryToDraft(raw, taken),
    }));
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

const relinkAuthorDate = (
  content: string,
  byAuthorYear: Map<string, string>,
): { content: string; linked: number } => {
  let linked = 0;
  const next = content.replace(
    /\(([^)]*\b(?:19|20)\d{2}[a-z]?[^)]*)\)/g,
    (whole, inner: string) => {
      // Split multiple citations in one paren group: "A, 2019; B et al., 2020".
      const parts = inner.split(';').map((part) => part.trim());
      const keys: string[] = [];
      for (const part of parts) {
        const year = YEAR_RE.exec(part)?.[0];
        const family = firstAuthorFamily(part).toLowerCase();
        const key = year ? byAuthorYear.get(`${family}|${year}`) : undefined;
        if (key === undefined) return whole; // leave the whole group untouched
        keys.push(key);
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
  const byAuthorYear = new Map(
    entries.map((entry) => [
      `${(entry.draft.authors ?? '').split(/[,;]/)[0]?.trim().toLowerCase()}|${entry.draft.year ?? ''}`,
      entry.draft.citationKey as string,
    ]),
  );

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
