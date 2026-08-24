import {
  type AssetKind,
  type FigureLike,
  type JournalStyle,
  type NumberedFigure,
  type SectionLike,
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

// The in-text cross-reference format. `crossRefFormat` is the journal's *figure*
// reference style (e.g. "Fig. {n}"); tables and other kinds are referenced by
// their own label format ("Table 1"), never the figure style — otherwise
// [#tab:x] would render as "Fig. 1".
const crossRefFormatFor = (kind: AssetKind, style: JournalStyle): string =>
  kind === 'FIGURE' && style.crossRefFormat
    ? style.crossRefFormat
    : labelFormatFor(kind, style);

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
//
// With `numberingScope: 'PER_SECTION'` (and the manuscript's sections), main
// assets number per top-level section — Figure 1.1, 1.2 — each kind restarting
// its counter per chapter. Supplements keep their continuous prefixed sequence.
export const numberAssets = (
  figures: FigureLike[],
  style: JournalStyle = {},
  sections?: SectionLike[],
): NumberedFigure[] => {
  const supplementPrefix = style.supplementPrefix ?? 'S';
  const perSection =
    style.numberingScope === 'PER_SECTION' &&
    sections !== undefined &&
    sections.length > 0;
  // Chapter index per section id: increments at each level-1 main section;
  // deeper subsections belong to the chapter they sit under.
  const chapterBySectionId = new Map<string, number>();
  if (perSection) {
    const mainSections = sections
      .filter((section) => (section.placement ?? 'MAIN') === 'MAIN')
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    let chapter = 0;
    for (const section of mainSections) {
      if ((section.level ?? 1) <= 1) chapter += 1;
      chapterBySectionId.set(section.id, chapter);
    }
  }
  const counters = new Map<string, number>();
  const ordered = [...figures].sort(compareAssets);
  // Figures not anchored to a section join the chapter of the previous
  // anchored figure; anything before the first chapter joins chapter 1.
  let lastChapter = 1;

  return ordered.map((figure) => {
    const kind = asKind(figure.assetKind);
    const supplement = isSupplement(figure.placement);
    // The source's own label wins when the journal keeps it — "(11a)" and
    // "Table B1" carry information a continuous sequence would throw away.
    const sourceNumber =
      style.keepSourceNumbers === true ? (figure.sourceLabel ?? '').trim() : '';
    if (sourceNumber.length > 0) {
      return {
        ...figure,
        number: sourceNumber,
        label: applyTemplate(labelFormatFor(kind, style), sourceNumber),
        crossRefLabel: applyTemplate(
          crossRefFormatFor(kind, style),
          sourceNumber,
        ),
      };
    }
    let chapter = 0;
    if (perSection && !supplement) {
      const assigned =
        figure.sectionId === null || figure.sectionId === undefined
          ? undefined
          : chapterBySectionId.get(figure.sectionId);
      if (assigned !== undefined && assigned > 0) lastChapter = assigned;
      chapter = lastChapter;
    }
    const counterKey = supplement
      ? `${kind}:S`
      : perSection
        ? `${kind}:M:${chapter}`
        : `${kind}:M`;
    const next = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, next);

    const number = supplement
      ? `${supplementPrefix}${next}`
      : perSection
        ? `${chapter}.${next}`
        : `${next}`;
    const label = applyTemplate(labelFormatFor(kind, style), number);
    const crossRefLabel = applyTemplate(crossRefFormatFor(kind, style), number);

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
