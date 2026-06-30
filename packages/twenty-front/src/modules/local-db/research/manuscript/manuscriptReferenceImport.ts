import { isNonEmptyString } from '@sniptt/guards';

import { type ReferenceLike } from './manuscriptTypes';

// Import references from the three sources, staged: paste BibTeX, paste CSL
// JSON, or add-by-DOI. All three normalize to the same `reference` draft (with
// the original CSL JSON preserved in `cslJson`), so the rest of the pipeline is
// source-agnostic. The Zotero Web API path reuses `cslItemToReferenceDraft`
// since the Web API returns CSL JSON too.

export type ReferenceDraft = Omit<ReferenceLike, 'id'>;

// Map CSL item type → our friendly UPPER_SNAKE select value.
const CSL_TYPE_MAP: Record<string, string> = {
  'article-journal': 'ARTICLE_JOURNAL',
  'paper-conference': 'PAPER_CONFERENCE',
  book: 'BOOK',
  chapter: 'CHAPTER',
  thesis: 'THESIS',
  report: 'REPORT',
  dataset: 'DATASET',
  webpage: 'WEBPAGE',
  'article-newspaper': 'OTHER',
  article: 'PREPRINT',
  software: 'SOFTWARE',
};

const cslAuthors = (authors: unknown): string => {
  if (!Array.isArray(authors)) return '';
  return authors
    .map((author) => {
      const record = author as {
        family?: string;
        given?: string;
        literal?: string;
      };
      if (isNonEmptyString(record.literal)) return record.literal;
      const family = record.family ?? '';
      const given = record.given ?? '';
      return [family, given].filter((part) => part.length > 0).join(', ');
    })
    .filter((name) => name.length > 0)
    .join('; ');
};

const cslYear = (item: Record<string, unknown>): number | null => {
  const issued = item.issued as { 'date-parts'?: number[][] } | undefined;
  const year = issued?.['date-parts']?.[0]?.[0];
  return typeof year === 'number' ? year : null;
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

// One CSL-JSON item → a reference draft. Used by paste-CSL, DOI, and Zotero.
export const cslItemToReferenceDraft = (
  item: Record<string, unknown>,
): ReferenceDraft => ({
  name: asString(item.title) ?? 'Untitled',
  citationKey: asString(item.id) ?? '',
  cslType: CSL_TYPE_MAP[String(item.type ?? '')] ?? 'OTHER',
  authors: cslAuthors(item.author),
  year: cslYear(item),
  containerTitle: asString(item['container-title']),
  volume: asString(item.volume),
  issue: asString(item.issue),
  pages: asString(item.page),
  doi: asString(item.DOI),
  url: asString(item.URL),
  cslJson: JSON.stringify(item),
});

// Parse a pasted CSL-JSON document (an array, or a single item).
export const parseCslJson = (text: string): ReferenceDraft[] => {
  const parsed = JSON.parse(text) as unknown;
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map(cslItemToReferenceDraft);
};

// ── Minimal BibTeX parser ───────────────────────────────────────────────────
// Handles the common `@type{key, field = {value}, field = "value", ...}` shape.
// Not a full BibTeX implementation — enough to import a Zotero/Mendeley export.

// BibTeX entry type → CSL item type (lower-hyphen). We build a real CSL item so
// the import is stored CSL-JSON-first like every other path, not flat-only.
const BIBTEX_CSL_TYPE_MAP: Record<string, string> = {
  article: 'article-journal',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  book: 'book',
  incollection: 'chapter',
  inbook: 'chapter',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  techreport: 'report',
  misc: 'document',
};

// "Last, First and Last2, First2" / "First Last and …" → CSL name objects.
const bibtexAuthorsToCsl = (
  value: string,
): { family?: string; given?: string; literal?: string }[] =>
  value
    .split(/\s+and\s+/i)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => {
      if (name.includes(',')) {
        const [family, given] = name.split(',').map((part) => part.trim());
        return { family, given };
      }
      const parts = name.split(/\s+/);
      if (parts.length === 1) return { literal: name };
      const family = parts.pop() as string;
      return { family, given: parts.join(' ') };
    });

const bibtexEntryToCslItem = (
  type: string,
  key: string,
  fields: Record<string, string>,
): Record<string, unknown> => {
  const item: Record<string, unknown> = {
    id: key,
    type: BIBTEX_CSL_TYPE_MAP[type] ?? 'document',
  };
  if (isNonEmptyString(fields.title)) item.title = fields.title;
  if (isNonEmptyString(fields.author)) {
    item.author = bibtexAuthorsToCsl(fields.author);
  }
  const year = Number(fields.year);
  if (Number.isFinite(year)) item.issued = { 'date-parts': [[year]] };
  const container = fields.journal ?? fields.booktitle;
  if (isNonEmptyString(container)) item['container-title'] = container;
  if (isNonEmptyString(fields.volume)) item.volume = fields.volume;
  if (isNonEmptyString(fields.number)) item.issue = fields.number;
  if (isNonEmptyString(fields.pages)) item.page = fields.pages.replace(/--/g, '–');
  if (isNonEmptyString(fields.doi)) item.DOI = fields.doi;
  if (isNonEmptyString(fields.url)) item.URL = fields.url;
  if (isNonEmptyString(fields.publisher)) item.publisher = fields.publisher;
  return item;
};

const stripBraces = (value: string): string =>
  value
    .trim()
    .replace(/^[{"]+/, '')
    .replace(/[}"]+$/, '')
    .replace(/[{}]/g, '')
    .trim();

const parseBibtexFields = (body: string): Record<string, string> => {
  const fields: Record<string, string> = {};
  // Split on commas that separate fields (naive but works for typical exports).
  const fieldPattern = /([A-Za-z]+)\s*=\s*(\{[^{}]*\}|"[^"]*"|[^,]+)/g;
  for (const match of body.matchAll(fieldPattern)) {
    fields[match[1].toLowerCase()] = stripBraces(match[2]);
  }
  return fields;
};

export const parseBibtex = (text: string): ReferenceDraft[] => {
  const drafts: ReferenceDraft[] = [];
  const entryPattern = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\}/g;
  for (const match of text.matchAll(entryPattern)) {
    const type = match[1].toLowerCase();
    const key = match[2].trim();
    const fields = parseBibtexFields(match[3]);
    // Build a real CSL item, then derive the draft the same way every other
    // path does — so BibTeX imports are stored CSL-JSON-first, not flat-only.
    const draft = cslItemToReferenceDraft(bibtexEntryToCslItem(type, key, fields));
    drafts.push({ ...draft, citationKey: key });
  }
  return drafts;
};

// Detect the paste format and dispatch. Returns [] on unparseable input rather
// than throwing, so the UI can show a friendly "couldn't parse" message.
export const parseReferences = (text: string): ReferenceDraft[] => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return parseCslJson(trimmed);
    } catch {
      return [];
    }
  }
  if (trimmed.includes('@')) {
    return parseBibtex(trimmed);
  }
  return [];
};

// The DOI content-negotiation URL the composer fetches; the response *is* CSL
// JSON, so the result feeds straight into `cslItemToReferenceDraft`.
export const doiCslJsonUrl = (doi: string): string => {
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  return `https://doi.org/${clean}`;
};
