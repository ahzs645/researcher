import { isNonEmptyString } from '@sniptt/guards';

import { type ReferenceDraft } from './manuscriptReferenceImport';
import { type ReferenceLike } from './manuscriptTypes';

// Reference-library hygiene shared by every import path (DOI, BibTeX, CSL-JSON,
// Zotero). Citations are stored CSL-JSON-first (the Zotero interchange format);
// this layer keeps that library clean: a stable identity for de-duplication, a
// deterministic Better-BibTeX-style citation key, and idempotent merging so
// re-importing the same Zotero library (or DOI) never creates duplicates.

// Normalize a DOI to a bare, lower-cased identifier so the same paper compares
// equal whether stored as "10.x", "https://doi.org/10.x", or "DOI: 10.X".
export const normalizeDoi = (doi: string | null | undefined): string =>
  isNonEmptyString(doi)
    ? doi
        .trim()
        .toLowerCase()
        .replace(/^doi:\s*/, '')
        .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    : '';

// The identity used for de-duplication: DOI first (most reliable), then citation
// key, then a title+year fingerprint as a last resort.
export const referenceIdentity = (
  reference: Pick<
    ReferenceLike,
    'doi' | 'citationKey' | 'name' | 'year'
  >,
): string => {
  const doi = normalizeDoi(reference.doi);
  if (doi.length > 0) return `doi:${doi}`;
  if (isNonEmptyString(reference.citationKey)) {
    return `key:${reference.citationKey.trim().toLowerCase()}`;
  }
  const title = (reference.name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `title:${title}|${reference.year ?? ''}`;
};

const firstAuthorFamily = (authors: string | null | undefined): string => {
  if (!isNonEmptyString(authors)) return 'anon';
  // `authors` is "Family, Given; Family2, Given2" — take the first family name.
  const first = authors.split(';')[0]?.trim() ?? '';
  const family = first.includes(',') ? first.split(',')[0] : first.split(' ').pop() ?? '';
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return slug.length > 0 ? slug : 'anon';
};

// Deterministic citation key, Better-BibTeX style: <firstauthor><year><disambig>.
// `taken` carries the keys already in use so collisions get a, b, c… suffixes.
export const generateCitationKey = (
  reference: Pick<ReferenceLike, 'authors' | 'year'>,
  taken: Set<string>,
): string => {
  const base = `${firstAuthorFamily(reference.authors)}${reference.year ?? 'nd'}`;
  if (!taken.has(base)) return base;
  for (let suffix = 'a'.charCodeAt(0); suffix <= 'z'.charCodeAt(0); suffix += 1) {
    const candidate = `${base}${String.fromCharCode(suffix)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${taken.size}`;
};

export type DedupeResult = {
  // Incoming drafts not already present, each with a unique citation key.
  added: ReferenceDraft[];
  // How many incoming drafts were skipped as duplicates.
  duplicateCount: number;
};

// Merge incoming drafts into an existing library: drop anything whose identity
// already exists (in the library or earlier in the same batch), and ensure every
// kept draft has a unique citation key. Pure — the caller persists `added`.
export const dedupeReferenceDrafts = (
  existing: ReferenceLike[],
  incoming: ReferenceDraft[],
): DedupeResult => {
  const seenIdentities = new Set(existing.map(referenceIdentity));
  const takenKeys = new Set(
    existing
      .map((reference) => reference.citationKey)
      .filter(isNonEmptyString)
      .map((key) => key.trim()),
  );

  const added: ReferenceDraft[] = [];
  let duplicateCount = 0;

  for (const draft of incoming) {
    const identity = referenceIdentity(draft);
    if (seenIdentities.has(identity)) {
      duplicateCount += 1;
      continue;
    }
    seenIdentities.add(identity);

    const existingKey = draft.citationKey?.trim() ?? '';
    const citationKey =
      existingKey.length > 0 && !takenKeys.has(existingKey)
        ? existingKey
        : generateCitationKey(draft, takenKeys);
    takenKeys.add(citationKey);
    added.push({ ...draft, citationKey });
  }

  return { added, duplicateCount };
};
