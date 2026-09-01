import { isNonEmptyString } from '@sniptt/guards';

import { type ManuscriptBundle } from './manuscriptAssembly';
import { resolveFigureImage } from './manuscriptImages';
import { type NumberedFigure } from './manuscriptTypes';

// Browser-only: draw a figure's panels into one picture, laid out as the row
// or grid the author asked for.
//
// Every other target can say "these images sit side by side" in its own
// markup — a `subfigure` row, a Typst `grid`, a CSS grid, a JATS `<fig-group>`.
// The two block-based targets cannot: DOCX and PDF are both rendered from one
// BlockNote document, and that document is a flow of blocks with no container
// able to hold two images beside each other. Stacking the panels would be a
// figure that reads differently in Word than in every other export of the same
// paper, which is the kind of quiet divergence this pipeline exists to avoid.
//
// So the row is drawn here instead, and the two exporters place the result as
// an ordinary single-image figure. What that costs is honest and worth saying:
// the panel letters in the *artwork* are pixels, exactly as they would be if
// the author had assembled the figure in a graphics program. What it does not
// cost is the thing that mattered — the letters are also real text in the
// caption, and "Figure 3b" in the prose is still a live Word REF field with a
// literal "b" after it. The pixels are a picture; the reference is not.
//
// Nothing here can be relied on: a canvas needs a browser, and an image loaded
// from another origin taints it so `toDataURL` throws. Every failure returns
// the bundle untouched, and `manuscriptBlocks` then sets the panels one above
// the other under one number — worse-looking, never wrong.

const COMPOSITE_WIDTH = 1600;
const PANEL_GUTTER = 24;
const LABEL_HEIGHT = 44;
const LABEL_FONT = 'bold 32px Georgia, "Times New Roman", serif';
// Printer's ink on printer's paper. These are not interface colours and have
// no business following the app's theme: the picture they draw is embedded in
// a .docx and a .pdf, where a dark-mode background would come out as a black
// rectangle on a white page.
// oxlint-disable-next-line twenty/no-hardcoded-colors
const PAGE_WHITE = '#ffffff';
// oxlint-disable-next-line twenty/no-hardcoded-colors
const INK_BLACK = '#000000';

const isBrowserEnvironment = (): boolean =>
  typeof document !== 'undefined' && typeof window !== 'undefined';

type LoadedPanel = {
  panel: NumberedFigure;
  image: HTMLImageElement;
};

// An image that never decodes must not wedge the export: a linked figure whose
// host is down would otherwise leave the author staring at a spinner with no
// file at the end of it. The wait is capped and a miss falls back to stacking.
const DECODE_TIMEOUT_MS = 10000;

const loadImage = (source: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const element = new Image();
    // A same-origin data URL needs nothing, but a linked figure would taint
    // the canvas; asking for CORS is the only way one can be drawn at all.
    element.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), DECODE_TIMEOUT_MS);
    const settle = (value: HTMLImageElement | null) => {
      clearTimeout(timer);
      resolve(value);
    };
    element.onload = () => settle(element);
    element.onerror = () => settle(null);
    element.src = source;
  });

const loadPanels = async (
  panels: readonly NumberedFigure[],
): Promise<LoadedPanel[] | null> => {
  const sources = panels.map((panel) => resolveFigureImage(panel));
  // A panel with no picture cannot be drawn into the row, and half a figure is
  // not a figure: the whole thing falls back to being stacked.
  if (sources.some((source) => source.kind === 'none')) return null;
  const images = await Promise.all(
    sources.map((source) =>
      source.kind === 'none' ? null : loadImage(source.src),
    ),
  );
  if (images.some((image) => image === null || image.naturalWidth === 0)) {
    return null;
  }
  return panels.map((panel, index) => ({
    panel,
    image: images[index] as HTMLImageElement,
  }));
};

// The caption the composited figure carries: the figure's own words followed
// by each panel's letter and words, which is how a journal sets a multi-panel
// caption and — unlike the drawn letters — is real, selectable text.
const compositeCaption = (figure: NumberedFigure): string =>
  [
    isNonEmptyString(figure.caption) ? figure.caption.trim() : '',
    ...(figure.panels ?? []).map((panel) =>
      [
        panel.label,
        isNonEmptyString(panel.caption)
          ? panel.caption.trim()
          : isNonEmptyString(panel.name)
            ? panel.name.trim()
            : '',
      ]
        .filter((part) => part.length > 0)
        .join(' '),
    ),
  ]
    .filter((part) => part.length > 0)
    .join(' ');

const drawComposite = (
  loaded: LoadedPanel[],
  columns: number,
): string | null => {
  const cellWidth = Math.floor(
    (COMPOSITE_WIDTH - PANEL_GUTTER * (columns - 1)) / columns,
  );
  if (cellWidth <= 0) return null;
  const rows: LoadedPanel[][] = [];
  for (let index = 0; index < loaded.length; index += columns) {
    rows.push(loaded.slice(index, index + columns));
  }
  const cellHeight = (entry: LoadedPanel): number =>
    Math.round(
      (cellWidth * entry.image.naturalHeight) / entry.image.naturalWidth,
    );
  const rowHeights = rows.map(
    (row) => LABEL_HEIGHT + Math.max(...row.map(cellHeight)),
  );
  const height =
    rowHeights.reduce((total, rowHeight) => total + rowHeight, 0) +
    PANEL_GUTTER * (rows.length - 1);

  const canvas = document.createElement('canvas');
  canvas.width = COMPOSITE_WIDTH;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  context.fillStyle = PAGE_WHITE;
  context.fillRect(0, 0, canvas.width, height);
  context.fillStyle = INK_BLACK;
  context.font = LABEL_FONT;
  context.textBaseline = 'alphabetic';

  let top = 0;
  rows.forEach((row, rowIndex) => {
    row.forEach((entry, columnIndex) => {
      const left = columnIndex * (cellWidth + PANEL_GUTTER);
      context.fillText(entry.panel.label, left, top + LABEL_HEIGHT - 12);
      context.drawImage(
        entry.image,
        left,
        top + LABEL_HEIGHT,
        cellWidth,
        cellHeight(entry),
      );
    });
    top += rowHeights[rowIndex] + PANEL_GUTTER;
  });

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

const composeOne = async (
  figure: NumberedFigure,
): Promise<NumberedFigure | null> => {
  const panels = figure.panels ?? [];
  if (panels.length === 0) return null;
  const loaded = await loadPanels(panels);
  if (loaded === null) return null;
  const columns = Math.max(
    1,
    Math.min(panels.length, figure.panelColumns ?? panels.length),
  );
  const composite = drawComposite(loaded, columns);
  if (composite === null) return null;
  // `panels` is dropped on purpose: the block builder reads it as "lay these
  // out yourself", and there is nothing left for it to lay out.
  const { panels: _panels, ...withoutPanels } = figure;
  return {
    ...withoutPanels,
    imageUrl: composite,
    imageSource: 'GENERATED',
    caption: compositeCaption(figure),
  };
};

export const composeManuscriptFigurePanels = async (
  bundle: ManuscriptBundle,
): Promise<ManuscriptBundle> => {
  if (!isBrowserEnvironment()) return bundle;
  const compositesById = new Map<string, NumberedFigure>();
  for (const figure of bundle.numberedFigures) {
    if ((figure.panels ?? []).length === 0) continue;
    try {
      const composed = await composeOne(figure);
      if (composed !== null) compositesById.set(figure.id, composed);
    } catch {
      // Left as panels; the block builder stacks them.
    }
  }
  if (compositesById.size === 0) return bundle;

  const composed = (figure: NumberedFigure): NumberedFigure =>
    compositesById.get(figure.id) ?? figure;

  return {
    ...bundle,
    numberedFigures: bundle.numberedFigures.map(composed),
    nodes: bundle.nodes.map((node) =>
      node.kind === 'figure'
        ? { ...node, figure: composed(node.figure) }
        : node,
    ),
  };
};
