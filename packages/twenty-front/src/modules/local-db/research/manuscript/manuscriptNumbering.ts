import { isNonEmptyString } from '@sniptt/guards';

import {
  type AssetKind,
  type FigureLike,
  type JournalStyle,
  type NumberedFigure,
  type NumberedSection,
  type SectionLike,
} from './manuscriptTypes';

// Auto-numbering for figures, tables, schemes… — the modular heart of "how
// figures are numbered based on the journal's formatting". Each asset kind keeps
// its own counter, the supplement runs a separate prefixed sequence (Figure S1),
// and the label template comes from the journal style (Figure 1 / Fig. 1 /
// FIGURE 1). Pure and deterministic so a re-render never renumbers differently.
//
// An asset with `numbered: false` is skipped entirely: unnumbered display
// equations are ordinary in a paper, and they must not consume a number that
// the equations after them would then be missing.

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

const DEFAULT_PANEL_LABEL_FORMAT = '{n}{p}';
const DEFAULT_SECTION_REF_FORMAT = 'Section {n}';

// A panel of another figure rather than a figure of its own.
export const isFigurePanel = (figure: FigureLike): boolean =>
  isNonEmptyString(figure.parentFigureId);

// a, b, … z, aa, ab — the spreadsheet column sequence, because a figure with
// twenty-seven panels is still a figure and still has to letter them.
export const panelLetterAt = (index: number): string => {
  let remaining = index;
  let letters = '';
  do {
    letters = String.fromCharCode(97 + (remaining % 26)) + letters;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return letters;
};

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
  // Panels are taken out of the sequence before it starts: the parent takes
  // the number and each panel takes a letter off it, so a two-panel Figure 3
  // is followed by Figure 4 rather than by Figure 5.
  const { topLevel, panelsByParentId } = splitFigurePanels(figures);
  const ordered = [...topLevel].sort(compareAssets);
  // Figures not anchored to a section join the chapter of the previous
  // anchored figure; anything before the first chapter joins chapter 1.
  let lastChapter = 1;

  const numberOne = (figure: FigureLike): NumberedFigure => {
    const kind = asKind(figure.assetKind);
    const supplement = isSupplement(figure.placement);
    // An asset the author has taken out of the numbering takes nothing from
    // the sequence either: switch off Eq. (5) and what was (6) becomes (5).
    // It is set without a label, and a cross-reference to it has no number to
    // print — buildManuscriptBundle reports that rather than printing a gap.
    if (figure.numbered === false) {
      return { ...figure, number: '', label: '', crossRefLabel: '' };
    }
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
  };

  // Flat and in render order: every parent immediately followed by its panels,
  // so a lookup finds a panel and a walk that skips panels still reads the
  // figures in the order they are printed.
  return attachNumberedPanels(
    ordered.flatMap((figure) => {
      const parent = numberOne(figure);
      return [
        parent,
        ...numberFigurePanels(
          parent,
          panelsByParentId.get(figure.id) ?? [],
          style,
        ),
      ];
    }),
  );
};

// Split a flat asset list into the figures that number and the panels that
// hang off them. A panel naming a parent that is not in the list has nothing
// to be a panel of, so it numbers as a figure of its own rather than
// disappearing from the paper.
const splitFigurePanels = (
  figures: FigureLike[],
): {
  topLevel: FigureLike[];
  panelsByParentId: Map<string, FigureLike[]>;
} => {
  const ids = new Set(figures.map((figure) => figure.id));
  const topLevel: FigureLike[] = [];
  const panelsByParentId = new Map<string, FigureLike[]>();
  for (const figure of figures) {
    const parentId = (figure.parentFigureId ?? '').trim();
    if (parentId.length === 0 || parentId === figure.id || !ids.has(parentId)) {
      topLevel.push(figure);
      continue;
    }
    const list = panelsByParentId.get(parentId) ?? [];
    list.push(figure);
    panelsByParentId.set(parentId, list);
  }
  return { topLevel, panelsByParentId };
};

// Number one figure's panels off the number the figure already has. The letter
// is positional — it follows the order the panels lay out in, not the document
// — which is why no target has to run a counter for it.
const numberFigurePanels = (
  parent: NumberedFigure,
  panels: FigureLike[],
  style: JournalStyle,
): NumberedFigure[] => {
  if (panels.length === 0) return [];
  const format = style.panelLabelFormat ?? DEFAULT_PANEL_LABEL_FORMAT;
  const capitals = format.includes('{P}');
  const kind = asKind(parent.assetKind);
  const parentKey = parent.refKey ?? parent.id;
  let letterIndex = 0;
  return [...panels].sort(compareAssets).map((panel) => {
    // A panel taken out of the numbering takes no letter either, exactly as an
    // unnumbered figure takes no number; the panel after it becomes (b).
    if (panel.numbered === false || parent.number.length === 0) {
      return { ...panel, number: '', label: '', crossRefLabel: '' };
    }
    const letter = panelLetterAt(letterIndex);
    letterIndex += 1;
    const shown = capitals ? letter.toUpperCase() : letter;
    const number = format
      .replace(/\{n\}/g, parent.number)
      .replace(/\{p\}/g, letter)
      .replace(/\{P\}/g, letter.toUpperCase());
    return {
      ...panel,
      number,
      // What is printed beside the panel itself. The parent's caption carries
      // "Figure 3"; repeating it under every panel is not how a figure is set.
      label: `(${shown})`,
      crossRefLabel: applyTemplate(crossRefFormatFor(kind, style), number),
      panelLetter: shown,
      parentRefKey: parentKey,
      parentNumber: parent.number,
    };
  });
};

// Hang every panel back onto its parent, so a renderer that draws one figure
// can reach the cells it is made of. Idempotent, and run again after the text
// passes rewrite captions — the nested copies have to be the rewritten ones.
export const attachNumberedPanels = (
  numbered: NumberedFigure[],
): NumberedFigure[] => {
  const panelsByParentId = new Map<string, NumberedFigure[]>();
  for (const figure of numbered) {
    const parentId = (figure.parentFigureId ?? '').trim();
    if (parentId.length === 0) continue;
    const list = panelsByParentId.get(parentId) ?? [];
    list.push(figure);
    panelsByParentId.set(parentId, list);
  }
  if (panelsByParentId.size === 0) return numbered;
  return numbered.map((figure) => {
    const panels = panelsByParentId.get(figure.id);
    return panels === undefined
      ? figure
      : { ...figure, panels: panels.map((panel) => ({ ...panel })) };
  });
};

const KIND_PREFIX = /^(fig|figure|tab|table|scheme|box|eq|equation):/;

// Lookup by refKey *and* by id so cross-references resolve whichever the author
// used. refKeys are matched case-insensitively and ignore a kind prefix
// (`fig:arpes` and `arpes` both resolve).
export const buildAssetLookup = (
  numbered: NumberedFigure[],
): Map<string, NumberedFigure> => {
  const lookup = new Map<string, NumberedFigure>();
  // MyST gives a panel an implicit label of its parent's plus its letter, and
  // an author who has already written `[#fig:arpes-b]` should not have to name
  // the panel a second time for that to resolve. Registered before the keys
  // records actually carry, so a key the author did give always wins.
  for (const asset of numbered) {
    const letter = (asset.panelLetter ?? '').toLowerCase();
    const parentKey = (asset.parentRefKey ?? '').trim().toLowerCase();
    if (letter.length === 0 || parentKey.length === 0) continue;
    for (const stem of new Set([
      parentKey,
      parentKey.replace(KIND_PREFIX, ''),
    ])) {
      lookup.set(`${stem}${letter}`, asset);
      lookup.set(`${stem}-${letter}`, asset);
    }
  }
  for (const asset of numbered) {
    lookup.set(asset.id, asset);
    const key = (asset.refKey ?? '').trim().toLowerCase();
    if (key.length > 0) {
      lookup.set(key, asset);
    }
  }
  return lookup;
};

// ── Sections ───────────────────────────────────────────────────────────────
// The front and back matter are never part of the numbered sequence, whatever
// the journal says about numbering sections. Canonical here because the block
// builder, both source writers and the section counter all have to agree about
// which headings are in the sequence — three copies of this pattern would be
// three chances for a reference to print a number the heading does not.
export const UNNUMBERED_HEADING =
  /^(abstract|keywords|acknowledge?ments?|author contributions?|funding|competing interests?|conflicts? of interest|data availability|references|supplementary material|appendix(?:\s+[A-Z0-9]+)?(?:[.:]\s*.*)?)$/i;

// The heading level a section prints at. The manuscript title is the h1, so a
// top-level section is an h2 and only h2 is in the numbered sequence.
export const manuscriptSectionHeadingLevel = (
  section: SectionLike,
  heading: string,
): 2 | 3 | 4 => {
  if (
    section.sectionType === 'ABSTRACT' ||
    section.sectionType === 'KEYWORDS'
  ) {
    return 3;
  }
  // The depth the author gave the section in the composer outline is the
  // authority — without it every section exported flat, which is why a
  // subsection was indistinguishable from the section above it.
  const outlineLevel = section.level;
  if (
    outlineLevel !== null &&
    outlineLevel !== undefined &&
    outlineLevel >= 2
  ) {
    return Math.round(outlineLevel) >= 3 ? 4 : 3;
  }
  const numericPrefix = /^(\d+(?:\.\d+)+)\b/.exec(heading)?.[1];
  return numericPrefix !== undefined && numericPrefix.split('.').length >= 3
    ? 3
    : 2;
};

export const manuscriptSectionHeading = (section: SectionLike): string =>
  isNonEmptyString(section.name)
    ? section.name
    : (section.sectionType ?? 'Section');

// Number the sections that are going out, in the order they are going out.
//
// This is the *only* section counter. The block builder used to run its own
// over the assembled headings, and a cross-reference resolved here would then
// have been a second opinion about the same number — so the number is worked
// out once, hung on the heading node, and printed from there. The rule is
// deliberately the one the block builder already applied: a level-2 heading,
// the journal numbering sections, and not one of the standing front- or
// back-matter titles.
export const numberManuscriptSections = (
  sections: SectionLike[],
  style: JournalStyle = {},
): NumberedSection[] => {
  const refFormat = style.sectionRefFormat ?? DEFAULT_SECTION_REF_FORMAT;
  let counter = 0;
  return sections.map((section) => {
    const heading = manuscriptSectionHeading(section);
    const headingLevel = manuscriptSectionHeadingLevel(section, heading);
    const inSequence =
      style.sectionNumbering === true &&
      headingLevel === 2 &&
      !UNNUMBERED_HEADING.test(heading.trim());
    if (inSequence) counter += 1;
    const number = inSequence ? String(counter) : '';
    return {
      ...section,
      number,
      heading,
      headingLevel,
      // With no number to print, the reference names the section instead —
      // which is what an author writes by hand in an unnumbered paper, and
      // what `\nameref` prints in LaTeX.
      crossRefLabel:
        number.length > 0 ? applyTemplate(refFormat, number) : heading,
      referenceKey: (section.refKey ?? '').trim() || section.id,
    };
  });
};

// Whether a section's reference key is one the author actually gave it, rather
// than the record id the lookup falls back on. Only an authored key is written
// into a document as an anchor: a record id means nothing outside the
// workspace it was minted in, and putting it in a `<sec id>` or a `\\label`
// would be noise in every paper that never asked for a section reference.
export const hasAuthoredSectionKey = (section: {
  id: string;
  referenceKey: string;
}): boolean => section.referenceKey !== section.id;

export const buildSectionLookup = (
  numbered: NumberedSection[],
): Map<string, NumberedSection> => {
  const lookup = new Map<string, NumberedSection>();
  for (const section of numbered) {
    lookup.set(section.id, section);
    const key = section.referenceKey.trim().toLowerCase();
    if (key.length > 0) lookup.set(key, section);
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
  return lookup.get(key.replace(KIND_PREFIX, ''));
};

// The same, for a section: `[#sec:methods]`, `[#methods]` and the bare id all
// land on the section that carries the key.
export const resolveSectionKey = (
  rawKey: string,
  lookup: Map<string, NumberedSection>,
): NumberedSection | undefined => {
  const key = rawKey.trim().toLowerCase();
  if (lookup.has(key)) return lookup.get(key);
  return lookup.get(key.replace(/^(sec|section):/, ''));
};
