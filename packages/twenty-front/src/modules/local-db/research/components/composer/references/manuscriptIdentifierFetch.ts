import {
  arxivAtomToCslItem,
  arxivDoi,
  htmlMetaToCslItem,
  ncbiSummaryToCslItem,
  openLibraryToCslItem,
  REFERENCE_IDENTIFIER_LABELS,
  webpageCslItem,
  type ReferenceIdentifier,
} from '@/local-db/research/manuscript/manuscriptReferenceIdentifiers';
import { doiCslJsonUrl } from '@/local-db/research/manuscript/manuscriptReferenceImport';

// The network half of cite-by-identifier. Every branch here does one fetch and
// hands the body to a pure reader in `manuscriptReferenceIdentifiers`, so the
// parsing stays testable and this file stays boring.
//
// Everything is client-side, so a blocked request is normal rather than
// exceptional: a URL import will usually hit CORS, and the arXiv API may too.
// Each of those has a documented fallback and none of them throws.

export type ResolvedIdentifier = {
  identifier: ReferenceIdentifier;
  // The CSL JSON item, ready for `cslItemToReferenceDraft`.
  item: Record<string, unknown> | null;
  // Set when nothing could be resolved; already phrased for a snack bar.
  error: string | null;
};

const DOI_HEADERS = { Accept: 'application/vnd.citationstyles.csl+json' };

const failed = (
  identifier: ReferenceIdentifier,
  error: string,
): ResolvedIdentifier => ({ identifier, item: null, error });

const resolved = (
  identifier: ReferenceIdentifier,
  item: Record<string, unknown>,
): ResolvedIdentifier => ({ identifier, item, error: null });

const notFound = (identifier: ReferenceIdentifier): ResolvedIdentifier =>
  failed(
    identifier,
    `No record found for ${REFERENCE_IDENTIFIER_LABELS[identifier.kind]} ${identifier.value}`,
  );

const unreachable = (
  identifier: ReferenceIdentifier,
  host: string,
): ResolvedIdentifier =>
  failed(identifier, `Could not reach ${host} for ${identifier.value}`);

// A CSL-JSON item straight from doi.org content negotiation. Shared by the DOI
// path and by arXiv's fallback.
const fetchDoiItem = async (
  doi: string,
): Promise<Record<string, unknown> | null> => {
  const response = await fetch(doiCslJsonUrl(doi), { headers: DOI_HEADERS });
  if (!response.ok) return null;
  const item = (await response.json()) as unknown;
  return typeof item === 'object' && item !== null
    ? (item as Record<string, unknown>)
    : null;
};

const resolveDoi = async (
  identifier: ReferenceIdentifier,
): Promise<ResolvedIdentifier> => {
  try {
    const item = await fetchDoiItem(identifier.value);
    return item === null ? notFound(identifier) : resolved(identifier, item);
  } catch {
    return unreachable(identifier, 'doi.org');
  }
};

const resolveNcbi = async (
  identifier: ReferenceIdentifier,
  kind: 'PMID' | 'PMCID',
): Promise<ResolvedIdentifier> => {
  try {
    const response = await fetch(identifier.requestUrl);
    if (!response.ok) return notFound(identifier);
    const item = ncbiSummaryToCslItem({
      payload: await response.json(),
      id: identifier.value,
      kind,
    });
    return item === null ? notFound(identifier) : resolved(identifier, item);
  } catch {
    return unreachable(identifier, 'PubMed');
  }
};

const resolveArxiv = async (
  identifier: ReferenceIdentifier,
): Promise<ResolvedIdentifier> => {
  try {
    const response = await fetch(identifier.requestUrl);
    if (response.ok) {
      const item = arxivAtomToCslItem(await response.text());
      if (item !== null) return resolved(identifier, item);
    }
  } catch {
    // Fall through: the Atom API may be unreachable from the browser, and
    // arXiv has minted a DOI for every paper, so doi.org can answer instead.
  }
  try {
    const item = await fetchDoiItem(arxivDoi(identifier.value));
    return item === null ? notFound(identifier) : resolved(identifier, item);
  } catch {
    return unreachable(identifier, 'arXiv');
  }
};

const resolveIsbn = async (
  identifier: ReferenceIdentifier,
): Promise<ResolvedIdentifier> => {
  try {
    const response = await fetch(identifier.requestUrl);
    if (!response.ok) return notFound(identifier);
    const item = openLibraryToCslItem({
      payload: await response.json(),
      isbn: identifier.value,
    });
    return item === null ? notFound(identifier) : resolved(identifier, item);
  } catch {
    return unreachable(identifier, 'OpenLibrary');
  }
};

// Best effort by definition: most sites send no CORS header, so reading their
// meta tags fails and we keep the `webpage` item instead. That is still a real
// reference — the URL and the date it was read — so this branch never fails.
const resolveUrl = async (
  identifier: ReferenceIdentifier,
  accessedOn: Date,
): Promise<ResolvedIdentifier> => {
  const url = identifier.value;
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html' } });
    if (response.ok) {
      return resolved(
        identifier,
        htmlMetaToCslItem({ html: await response.text(), url, accessedOn }),
      );
    }
  } catch {
    // The page is not readable from the browser; the fallback below still
    // gives the author a citable entry to fill in by hand.
  }
  return resolved(identifier, webpageCslItem({ url, accessedOn }));
};

export const isBrowserOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

export const resolveReferenceIdentifier = async (
  identifier: ReferenceIdentifier,
  accessedOn: Date = new Date(),
): Promise<ResolvedIdentifier> => {
  if (identifier.kind === 'UNKNOWN') {
    return failed(
      identifier,
      `Not a DOI, PMID, PMCID, arXiv ID, ISBN or URL: "${identifier.raw}"`,
    );
  }
  if (isBrowserOffline()) {
    return failed(
      identifier,
      `Offline — could not look up ${identifier.value}`,
    );
  }
  switch (identifier.kind) {
    case 'DOI':
      return resolveDoi(identifier);
    case 'PMID':
      return resolveNcbi(identifier, 'PMID');
    case 'PMCID':
      return resolveNcbi(identifier, 'PMCID');
    case 'ARXIV':
      return resolveArxiv(identifier);
    case 'ISBN':
      return resolveIsbn(identifier);
    case 'URL':
      return resolveUrl(identifier, accessedOn);
  }
};

// Resolved in order so the imported references keep the order they were pasted
// in, which is the order the author reads them back in.
export const resolveReferenceIdentifiers = async (
  identifiers: ReferenceIdentifier[],
  accessedOn: Date = new Date(),
): Promise<ResolvedIdentifier[]> => {
  const results: ResolvedIdentifier[] = [];
  for (const identifier of identifiers) {
    results.push(await resolveReferenceIdentifier(identifier, accessedOn));
  }
  return results;
};
