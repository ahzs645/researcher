import CSL from 'citeproc';
import { isNonEmptyString } from '@sniptt/guards';

// Full CSL rendering via citeproc-js — the upgrade from the built-in
// deterministic formatter to true journal-accurate references across the 10,000+
// CSL styles. The CSL style XML and the en-US locale are fetched from the CSL
// repos on jsDelivr (a CORS-enabled CDN), cached, and fed to a citeproc Engine.
// Everything runs client-side. On any failure (offline, unknown style) the
// caller falls back to the deterministic bibliography, so it never blocks.

const STYLE_BASE =
  'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master';
const LOCALE_URL =
  'https://cdn.jsdelivr.net/gh/citation-style-language/locales@master/locales-en-US.xml';

let localeCache: string | undefined;
const styleCache = new Map<string, string>();

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.text();
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
      styleCache.set(style, await fetchText(`${STYLE_BASE}/${style}.csl`));
    }
    if (localeCache === undefined) {
      localeCache = await fetchText(LOCALE_URL);
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
