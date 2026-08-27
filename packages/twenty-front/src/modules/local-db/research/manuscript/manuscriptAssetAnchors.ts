// Marks *where an asset's number is printed* — the "(7)" beside a display
// equation, the "Figure 2" that opens a caption — so an exporter that can set
// a live field knows which asset that run of digits belongs to.
//
// The cross-reference anchors in manuscriptCrossReference mark the other end:
// the places in prose that *name* a number. Together they are what lets the
// DOCX export write Word's own numbering — a SEQ field where the number is
// defined, a REF field pointing at it wherever the text refers to it — instead
// of typing today's numbers in as characters that go stale the moment an
// equation moves.
//
// The delimiters are Unicode invisible-operator characters rather than C0
// controls: they survive the editor and the Markdown parser, take no width,
// and cannot occur in a caption or in LaTeX.

const ANCHOR_OPEN = '⁡';
const ANCHOR_CLOSE = '⁤';

const ANCHOR_PATTERN = /⁡([^⁡⁤]*)⁤/g;

export const wrapAssetNumberAnchor = (refKey: string): string =>
  `${ANCHOR_OPEN}${refKey}${ANCHOR_CLOSE}`;

export const stripAssetNumberAnchors = (value: string): string =>
  value.replace(ANCHOR_PATTERN, '');

// The asset an anchored run belongs to, and the text with the marker removed.
export const readAssetNumberAnchor = (
  value: string,
): { refKey?: string; text: string } => {
  ANCHOR_PATTERN.lastIndex = 0;
  const match = ANCHOR_PATTERN.exec(value);
  if (match === null || match[1].length === 0) {
    return { text: stripAssetNumberAnchors(value) };
  }
  return { refKey: match[1], text: stripAssetNumberAnchors(value) };
};

// Word bookmark names take letters, digits and underscores, must not start
// with a digit, and are capped at 40 characters. `_Ref` is the prefix Word's
// own cross-reference dialog uses.
export const assetBookmarkId = (refKey: string): string =>
  `_Ref${refKey.replace(/[^A-Za-z0-9]/g, '_')}`.slice(0, 40);

// The counter Word keeps for section numbers. Sections run one continuous
// sequence, so unlike the asset counters there is nothing to key it on.
export const SECTION_SEQUENCE_NAME = 'Section';

// The name of the counter Word keeps for this asset. Each kind numbers on its
// own sequence, and a supplement runs a second one so "Figure S1" cannot
// disturb "Figure 1".
export const assetSequenceName = (
  assetKind: string | null | undefined,
  placement: string | null | undefined,
): string => {
  const kind = (assetKind ?? 'FIGURE').replace(/[^A-Za-z]/g, '');
  const name = kind.charAt(0) + kind.slice(1).toLowerCase();
  return placement === 'SUPPLEMENT' ? `${name}Supplement` : name;
};

// Split a printed number into the part Word can count and the letters around
// it. "7" counts; "S1" counts from 1 behind a literal "S"; "11a", "B1" and
// "1.2" carry information a plain counter cannot reproduce, so they stay
// literal — the bookmark still holds them, so cross-references to them are
// still links that show the right text, they simply do not renumber.
//
// A panel's "3b" is the one case that does not go through here: its letter is
// not part of any counter, so the reference is built from the *parent's*
// number — a live REF that gives back "3" — with the letter typed after it as
// text. See `crossReferenceRuns` in the DOCX export.
export type AssetNumberParts = {
  prefix: string;
  counted?: string;
  suffix: string;
};

export const splitAssetNumber = (number: string): AssetNumberParts => {
  const match = /^([A-Za-z]*)(\d+)$/.exec(number.trim());
  if (match === null) return { prefix: number, suffix: '' };
  return { prefix: match[1], counted: match[2], suffix: '' };
};
