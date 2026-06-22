import { buildAssetLookup, resolveAssetKey } from './manuscriptNumbering';
import { type NumberedFigure } from './manuscriptTypes';

// Cross-references and citation extraction over a section's Markdown.
//
// Authoring syntax (Pandoc-friendly):
//   [#fig:arpes]   → renders as "Figure 1" (per the journal's crossRefFormat)
//   [@smith2020]   → a citation; the key is collected for the bibliography
//
// Pure: resolution takes the numbered-asset lookup and returns rewritten text
// plus any keys that didn't resolve, so the UI can flag dangling references.

const CROSS_REF_PATTERN = /\[#([A-Za-z0-9:_-]+)\]/g;
// Citation keys: @key inside the text, key starts with a letter/digit and may
// contain word chars, ':', '.', '-'. Matches Pandoc citekeys.
const CITATION_PATTERN = /@([A-Za-z0-9_][\w:.-]*)/g;

export type CrossReferenceResult = {
  text: string;
  unresolvedKeys: string[];
};

// Replace every [#key] token with the target asset's cross-ref label. Unknown
// keys are left visible (so the gap is obvious) and reported.
export const resolveCrossReferences = (
  markdown: string,
  numbered: NumberedFigure[],
): CrossReferenceResult => {
  const lookup = buildAssetLookup(numbered);
  const unresolved = new Set<string>();

  const text = markdown.replace(CROSS_REF_PATTERN, (_match, rawKey: string) => {
    const asset = resolveAssetKey(rawKey, lookup);
    if (asset === undefined) {
      unresolved.add(rawKey);
      return `[#${rawKey}]`;
    }
    return asset.crossRefLabel;
  });

  return { text, unresolvedKeys: [...unresolved] };
};

// Pull every cited key from a body of Markdown, in first-appearance order
// (numeric citation styles number references by order of first use).
export const extractCitationKeys = (markdown: string): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(CITATION_PATTERN)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
};

// All cross-reference keys used in the text (to detect figures that are defined
// but never referenced, or referenced but missing).
export const extractCrossReferenceKeys = (markdown: string): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(CROSS_REF_PATTERN)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
};
