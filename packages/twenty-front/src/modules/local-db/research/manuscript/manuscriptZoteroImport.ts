import {
  cslItemToReferenceDraft,
  type ReferenceDraft,
} from './manuscriptReferenceImport';

// Zotero Web API import. Pulls a user's (or group's) library as CSL JSON and
// normalizes it through the same `cslItemToReferenceDraft` adapter the paste /
// DOI paths use — so a Zotero reference is indistinguishable downstream.
//
// CORS note (the reason for the www.zotero.org host): api.zotero.org does not
// send CORS headers, so a browser fetch to it is blocked. www.zotero.org/api is
// the equivalent endpoint the Zotero site itself uses and is reachable from the
// browser. Auth is passed as the `key` query param (a "simple" GET — no custom
// header — so there's no CORS preflight to fail). A connector-runner proxy is
// the fallback if a future Zotero change tightens this.

export type ZoteroLibraryType = 'users' | 'groups';

export type ZoteroConfig = {
  apiKey: string;
  libraryType: ZoteroLibraryType;
  libraryId: string;
};

const ZOTERO_API_BASE = 'https://www.zotero.org/api';

export const zoteroItemsUrl = (
  config: ZoteroConfig,
  start = 0,
  limit = 100,
): string => {
  const id = encodeURIComponent(config.libraryId.trim());
  const key = encodeURIComponent(config.apiKey.trim());
  return `${ZOTERO_API_BASE}/${config.libraryType}/${id}/items?format=csljson&itemType=-attachment%20||%20note&limit=${limit}&start=${start}&key=${key}`;
};

// Zotero's csljson export returns `{ items: [...] }`; some endpoints return a
// bare array. Handle both, and skip notes/attachments that slipped through.
export const parseZoteroCslResponse = (data: unknown): ReferenceDraft[] => {
  const items = Array.isArray(data)
    ? data
    : data !== null &&
        typeof data === 'object' &&
        Array.isArray((data as { items?: unknown[] }).items)
      ? ((data as { items: unknown[] }).items ?? [])
      : [];
  return items
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .filter((item) => item.type !== 'note' && item.type !== 'attachment')
    .map(cslItemToReferenceDraft);
};

export const isZoteroConfigComplete = (config: ZoteroConfig): boolean =>
  config.apiKey.trim().length > 0 && config.libraryId.trim().length > 0;
