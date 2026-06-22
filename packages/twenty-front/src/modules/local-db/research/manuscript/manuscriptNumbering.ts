import {
  type AssetKind,
  type FigureLike,
  type JournalStyle,
  type NumberedFigure,
} from './manuscriptTypes';

// Auto-numbering for figures, tables, schemes… — the modular heart of "how
// figures are numbered based on the journal's formatting". Each asset kind keeps
// its own counter, the supplement runs a separate prefixed sequence (Figure S1),
// and the label template comes from the journal style (Figure 1 / Fig. 1 /
// FIGURE 1). Pure and deterministic so a re-render never renumbers differently.

const DEFAULT_LABEL_FORMAT: Record<AssetKind, string> = {
  FIGURE: 'Figure {n}',
  TABLE: 'Table {n}',
  SCHEME: 'Scheme {n}',
  BOX: 'Box {n}',
  EQUATION: '({n})',
};

const ASSET_KINDS: AssetKind[] = [
  'FIGURE',
  'TABLE',
  'SCHEME',
  'BOX',
  'EQUATION',
];

const asKind = (value: string | null | undefined): AssetKind =>
  ASSET_KINDS.includes(value as AssetKind) ? (value as AssetKind) : 'FIGURE';

const isSupplement = (placement: string | null | undefined): boolean =>
  placement === 'SUPPLEMENT';

const applyTemplate = (format: string, value: string): string =>
  format.replace(/\{n\}/g, value);

// The label template for a kind, with per-journal overrides for the two kinds
// journals customize most (figures and tables).
const labelFormatFor = (kind: AssetKind, style: JournalStyle): string => {
  if (kind === 'FIGURE' && style.figureLabelFormat)
    return style.figureLabelFormat;
  if (kind === 'TABLE' && style.tableLabelFormat) return style.tableLabelFormat;
  return DEFAULT_LABEL_FORMAT[kind];
};

// Stable ordering: main before supplement, then by explicit orderIndex, then by
// title so the sequence is deterministic even when orderIndex is unset.
const compareAssets = (a: FigureLike, b: FigureLike): number => {
  const supplementDelta =
    (isSupplement(a.placement) ? 1 : 0) - (isSupplement(b.placement) ? 1 : 0);
  if (supplementDelta !== 0) return supplementDelta;
  const orderDelta = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  if (orderDelta !== 0) return orderDelta;
  return (a.name ?? '').localeCompare(b.name ?? '');
};

// Number a set of assets. Returns them in render order, each carrying its number
// + rendered label. Counters are keyed by (kind, main|supplement).
export const numberAssets = (
  figures: FigureLike[],
  style: JournalStyle = {},
): NumberedFigure[] => {
  const supplementPrefix = style.supplementPrefix ?? 'S';
  const counters = new Map<string, number>();
  const ordered = [...figures].sort(compareAssets);

  return ordered.map((figure) => {
    const kind = asKind(figure.assetKind);
    const supplement = isSupplement(figure.placement);
    const counterKey = `${kind}:${supplement ? 'S' : 'M'}`;
    const next = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, next);

    const number = supplement ? `${supplementPrefix}${next}` : `${next}`;
    const label = applyTemplate(labelFormatFor(kind, style), number);
    const crossRefLabel = style.crossRefFormat
      ? applyTemplate(style.crossRefFormat, number)
      : label;

    return { ...figure, number, label, crossRefLabel };
  });
};

// Lookup by refKey *and* by id so cross-references resolve whichever the author
// used. refKeys are matched case-insensitively and ignore a kind prefix
// (`fig:arpes` and `arpes` both resolve).
export const buildAssetLookup = (
  numbered: NumberedFigure[],
): Map<string, NumberedFigure> => {
  const lookup = new Map<string, NumberedFigure>();
  for (const asset of numbered) {
    lookup.set(asset.id, asset);
    const key = (asset.refKey ?? '').trim().toLowerCase();
    if (key.length > 0) {
      lookup.set(key, asset);
    }
  }
  return lookup;
};

// Resolve a single cross-reference token's key (e.g. "fig:arpes", "tab:results",
// "arpes") to a numbered asset.
export const resolveAssetKey = (
  rawKey: string,
  lookup: Map<string, NumberedFigure>,
): NumberedFigure | undefined => {
  const key = rawKey.trim().toLowerCase();
  if (lookup.has(key)) return lookup.get(key);
  const withoutPrefix = key.replace(
    /^(fig|figure|tab|table|scheme|box|eq|equation):/,
    '',
  );
  return lookup.get(withoutPrefix);
};
