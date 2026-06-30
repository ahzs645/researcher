import CSL from 'citeproc';
import { isNonEmptyString } from '@sniptt/guards';

import { getTwentyPublicBasePath } from '@/local-db/twenty-local/getTwentyPublicBasePath';

// Full CSL rendering via citeproc-js — the upgrade from the built-in
// deterministic formatter to true journal-accurate references across the 10,000+
// CSL styles. A curated set of common styles + the en-US locale ship with the
// app under `public/csl/`, so the everyday journals render **offline**; any other
// style still falls back to the CSL repos on jsDelivr (a CORS-enabled CDN).
// Everything runs client-side, results are cached, and on any failure (offline +
// uncommon style, unknown style) the caller falls back to the deterministic
// bibliography, so it never blocks.

const STYLE_BASE =
  'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master';
const LOCALE_URL =
  'https://cdn.jsdelivr.net/gh/citation-style-language/locales@master/locales-en-US.xml';

// Local, bundled copies — tried first so the common path needs no network.
const localCslBase = (): string => `${getTwentyPublicBasePath()}csl`;
const localStyleUrl = (style: string): string =>
  `${localCslBase()}/styles/${style}.csl`;
const localLocaleUrl = (): string => `${localCslBase()}/locales-en-US.xml`;

let localeCache: string | undefined;
const styleCache = new Map<string, string>();

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.text();
};

// Try each URL in order; return the first that loads. Lets a bundled style win
// when present and silently fall through to the CDN otherwise.
const fetchFirstText = async (urls: string[]): Promise<string> => {
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await fetchText(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No CSL source could be fetched');
};

const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export type CslBibliographyEntry = { id: string; text: string };

// Render the cited references as a CSL-formatted bibliography. Returns null on
// any failure so the caller can fall back to the deterministic formatter.
export const renderCslBibliography = async (
  cslItems: Record<string, unknown>[],
  citedKeys: string[],
  styleId: string | null | undefined,
): Promise<CslBibliographyEntry[] | null> => {
  try {
    const style = isNonEmptyString(styleId) ? styleId.trim() : 'apa';

    if (!styleCache.has(style)) {
      styleCache.set(
        style,
        await fetchFirstText([localStyleUrl(style), `${STYLE_BASE}/${style}.csl`]),
      );
    }
    if (localeCache === undefined) {
      localeCache = await fetchFirstText([localLocaleUrl(), LOCALE_URL]);
    }
    const styleXml = styleCache.get(style);
    const localeXml = localeCache;
    if (styleXml === undefined) return null;

    const itemsById = new Map<string, Record<string, unknown>>(
      cslItems.map((item) => [String(item.id), item]),
    );

    const engine = new CSL.Engine(
      {
        retrieveLocale: () => localeXml,
        retrieveItem: (id: string) =>
          itemsById.get(id) ?? { id, type: 'article-journal' },
      },
      styleXml,
      'en-US',
    );

    const ids = citedKeys.filter((key) => itemsById.has(key));
    engine.updateItems(ids);
    const result = engine.makeBibliography();
    if (result === false) return null;

    const [meta, htmlEntries] = result;
    const orderedIds = meta.entry_ids.map((group) => group[0]);
    return htmlEntries.map((html, index) => ({
      id: orderedIds[index] ?? `entry-${index}`,
      text: stripHtml(html),
    }));
  } catch {
    return null;
  }
};
