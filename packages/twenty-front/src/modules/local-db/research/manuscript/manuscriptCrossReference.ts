import {
  buildAssetLookup,
  buildSectionLookup,
  resolveAssetKey,
  resolveSectionKey,
} from './manuscriptNumbering';
import { type NumberedFigure, type NumberedSection } from './manuscriptTypes';

// Cross-references and citation extraction over a section's Markdown.
//
// Authoring syntax (Pandoc-friendly):
//   [#fig:arpes]   → renders as "Figure 1" (per the journal's crossRefFormat)
//   [#fig:arpes-b] → a panel of that figure, "Figure 1b"
//   [#sec:methods] → renders as "Section 3", or the section's own title when
//                    the journal does not number sections
//   [@smith2020]   → a citation; the key is collected for the bibliography
//
// One token, three kinds of target, one syntax: an author should not have to
// know which of the paper's numbered things they are pointing at, only what
// they called it. Assets are looked up first, so nothing that resolved before
// sections existed resolves anywhere else now.
//
// Pure: resolution takes the numbered-asset lookup and returns rewritten text
// plus any keys that didn't resolve, so the UI can flag dangling references.

// The key charset matches the editor's tokenizer (manuscriptEditorContent):
// anything but whitespace or a closing bracket. A stricter pattern here made
// a refKey with a dot a live chip in the editor but literal text in exports.
const CROSS_REF_PATTERN = /\[#([^\]\s]+)\]/g;
// Citation keys: @key inside the text, key starts with a letter/digit and may
// contain word chars, ':', '.', '-'. Matches Pandoc citekeys — which never
// follow a word character, so "ajalil@unbc.ca" on a title page is an email
// address rather than a citation of "unbc.ca". Reading it as one put a key
// with no reference into the cited list, which shifted every CSL label after
// it by one and mislabelled the citation chips in the editor.
const CITATION_PATTERN = /(?:^|[^\w@])@([A-Za-z0-9_][\w:.-]*)/g;

export type CrossReferenceResult = {
  text: string;
  unresolvedKeys: string[];
  // Keys that named a real asset which carries no number — the author turned
  // its numbering off, so there is nothing for the reference to print.
  unnumberedKeys: string[];
};

// ── Cross-reference anchors ────────────────────────────────────────────────
// Resolving [#fig:x] to "Figure 3" is all Word and PDF need, but an HTML
// export can make that text jump to the figure. Exporters opt in, and the
// resolved label then carries the asset it resolved to inside control
// characters that cannot occur in prose.
const CROSS_REF_ANCHOR_OPEN = '\u0005';
const CROSS_REF_ANCHOR_SPLIT = '\u0011';
const CROSS_REF_ANCHOR_CLOSE = '\u0003';

export const CROSS_REF_ANCHOR_PATTERN =
  /\u0005([^\u0005\u0011\u0003]*)\u0011([^\u0003]*)\u0003/g;

export const stripCrossReferenceAnchors = (value: string): string =>
  value.replace(CROSS_REF_ANCHOR_PATTERN, (_match, _key, label: string) =>
    String(label),
  );

export type CrossReferenceSegment =
  | { kind: 'text'; value: string }
  | { kind: 'reference'; refKey: string; label: string };

// Split anchored text into prose and the places that name an asset's number,
// so an exporter can render those places as something other than characters.
export const splitCrossReferenceAnchors = (
  value: string,
): CrossReferenceSegment[] => {
  const segments: CrossReferenceSegment[] = [];
  let cursor = 0;
  CROSS_REF_ANCHOR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CROSS_REF_ANCHOR_PATTERN.exec(value)) !== null) {
    if (match.index > cursor) {
      segments.push({ kind: 'text', value: value.slice(cursor, match.index) });
    }
    segments.push({ kind: 'reference', refKey: match[1], label: match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) {
    segments.push({ kind: 'text', value: value.slice(cursor) });
  }
  return segments;
};

export const hasCrossReferenceAnchors = (value: string): boolean => {
  CROSS_REF_ANCHOR_PATTERN.lastIndex = 0;
  return CROSS_REF_ANCHOR_PATTERN.test(value);
};

// Replace every [#key] token with the target asset's cross-ref label. Unknown
// keys are left visible (so the gap is obvious) and reported.
export const resolveCrossReferences = (
  markdown: string,
  numbered: NumberedFigure[],
  withAnchors = false,
  numberedSections: NumberedSection[] = [],
): CrossReferenceResult => {
  const lookup = buildAssetLookup(numbered);
  const sectionLookup = buildSectionLookup(numberedSections);
  const unresolved = new Set<string>();
  const unnumbered = new Set<string>();

  const text = markdown.replace(CROSS_REF_PATTERN, (_match, rawKey: string) => {
    const asset = resolveAssetKey(rawKey, lookup);
    if (asset === undefined) {
      const section = resolveSectionKey(rawKey, sectionLookup);
      if (section === undefined) {
        unresolved.add(rawKey);
        return `[#${rawKey}]`;
      }
      if (!withAnchors) return section.crossRefLabel;
      return `${CROSS_REF_ANCHOR_OPEN}${section.referenceKey}${CROSS_REF_ANCHOR_SPLIT}${section.crossRefLabel}${CROSS_REF_ANCHOR_CLOSE}`;
    }
    // The asset exists but is not numbered, so its cross-ref label is empty.
    // Printing that would silently delete the reference from the sentence;
    // leave the token visible and let the caller report it.
    if (asset.crossRefLabel.length === 0) {
      unnumbered.add(rawKey);
      return `[#${rawKey}]`;
    }
    if (!withAnchors) return asset.crossRefLabel;
    // The anchor names the asset the key resolved to, not the key the author
    // typed, so aliases and prefixed forms land on the same element.
    const target = asset.refKey ?? asset.id;
    return `${CROSS_REF_ANCHOR_OPEN}${target}${CROSS_REF_ANCHOR_SPLIT}${asset.crossRefLabel}${CROSS_REF_ANCHOR_CLOSE}`;
  });

  return {
    text,
    unresolvedKeys: [...unresolved],
    unnumberedKeys: [...unnumbered],
  };
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
