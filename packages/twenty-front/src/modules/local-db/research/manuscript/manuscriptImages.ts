import { isNonEmptyString } from '@sniptt/guards';

import { type FigureLike, type NumberedFigure } from './manuscriptTypes';

// The modular "ways images are added" layer. A figure's pixels can come from an
// uploaded file (stored as a data-URL), an external URL, a dataset render, or
// be a placeholder. This classifies the source and builds the export markdown,
// so adding a new source kind (e.g. a chart-from-query renderer) is one case
// here — the rest of the pipeline is unchanged.

export type ResolvedImage =
  | { kind: 'dataurl'; src: string }
  | { kind: 'url'; src: string }
  | { kind: 'none' };

const DATA_URL_PREFIX = /^data:image\//i;
const UNSUPPORTED_INLINE_DATA_URL = /^data:image\/(?:tiff?)(?:;|,)/i;
const HTTP_URL = /^https?:\/\//i;

export const isImageDataUrl = (value: string | null | undefined): boolean =>
  isNonEmptyString(value) && DATA_URL_PREFIX.test(value);

export const isHttpUrl = (value: string | null | undefined): boolean =>
  isNonEmptyString(value) && HTTP_URL.test(value);

// Where the figure's image actually resolves from, regardless of the declared
// `imageSource` (which is the user's intent; this is the runtime reality).
export const resolveFigureImage = (figure: FigureLike): ResolvedImage => {
  if (
    isImageDataUrl(figure.imageUrl) &&
    !UNSUPPORTED_INLINE_DATA_URL.test(figure.imageUrl as string)
  ) {
    return { kind: 'dataurl', src: figure.imageUrl as string };
  }
  if (isHttpUrl(figure.imageUrl)) {
    return { kind: 'url', src: figure.imageUrl as string };
  }
  return { kind: 'none' };
};

// True when a figure has a usable image (vs caption-only placeholder). A
// diagram counts: its picture is rendered from Mermaid source at export time,
// and so does a panel's, because a figure made of panels is a container — its
// pixels are its panels'.
export const figureHasImage = (
  figure: FigureLike & { panels?: readonly FigureLike[] },
): boolean =>
  resolveFigureImage(figure).kind !== 'none' ||
  isNonEmptyString(figure.diagramSource) ||
  (figure.panels ?? []).some(
    (panel) =>
      resolveFigureImage(panel).kind !== 'none' ||
      isNonEmptyString(panel.diagramSource),
  );

// Render a numbered figure as a self-contained Markdown block: the image (or a
// placeholder), then the captioned label, plus credit if present. Tables, which
// have no raster image, render their caption only.
export const figureToMarkdown = (figure: NumberedFigure): string => {
  const image = resolveFigureImage(figure);
  const alt = isNonEmptyString(figure.altText)
    ? figure.altText
    : (figure.name ?? figure.label);

  const lines: string[] = [];
  lines.push(`<a id="${figure.refKey ?? figure.id}"></a>`);

  // Equations carry LaTeX rather than a raster image, and their label is the
  // number itself — no "Figure 1." caption prefix.
  if (figure.assetKind === 'EQUATION') {
    if (isNonEmptyString(figure.equationLatex)) {
      lines.push(`$$${figure.equationLatex.trim()}$$`);
    }
    lines.push(figure.label);
    if (isNonEmptyString(figure.caption)) lines.push(figure.caption);
    return lines.join('\n\n');
  }

  // A figure made of panels draws each panel in turn, each under its own
  // letter, and then one caption for the lot: the panels are cells of one
  // numbered figure, not figures that happen to be adjacent.
  const panels = figure.panels ?? [];
  if (panels.length > 0) {
    for (const panel of panels) {
      const panelImage = resolveFigureImage(panel);
      lines.push(`<a id="${panel.refKey ?? panel.id}"></a>`);
      if (panelImage.kind !== 'none') {
        lines.push(
          `![${isNonEmptyString(panel.altText) ? panel.altText : (panel.name ?? panel.label)}](${panelImage.src})`,
        );
      } else if (isNonEmptyString(panel.diagramSource)) {
        lines.push(`\`\`\`mermaid\n${panel.diagramSource.trim()}\n\`\`\``);
      }
      const panelCaption = isNonEmptyString(panel.caption)
        ? panel.caption
        : isNonEmptyString(panel.name)
          ? panel.name
          : '';
      lines.push(
        [`**${panel.label}**`, panelCaption]
          .filter((part) => part.length > 0)
          .join(' '),
      );
    }
  } else if (image.kind !== 'none') {
    lines.push(`![${alt}](${image.src})`);
  } else if (isNonEmptyString(figure.diagramSource)) {
    // No raster yet — carry the Mermaid source itself, which every Markdown
    // renderer that understands the fence can draw.
    lines.push(`\`\`\`mermaid\n${figure.diagramSource.trim()}\n\`\`\``);
  } else if (figure.assetKind !== 'TABLE') {
    lines.push(`*[${figure.label}: image to be added]*`);
  }

  const captionParts = [`**${figure.label}.**`];
  const caption = isNonEmptyString(figure.caption)
    ? figure.caption
    : isNonEmptyString(figure.name)
      ? figure.name
      : '';
  if (caption.length > 0) captionParts.push(caption);
  lines.push(captionParts.join(' '));

  // Tables render their grid (a GFM Markdown table) under the caption.
  if (figure.assetKind === 'TABLE' && isNonEmptyString(figure.tableData)) {
    lines.push(figure.tableData.trim());
  }

  if (isNonEmptyString(figure.credit)) {
    lines.push(`*Credit: ${figure.credit}*`);
  }
  return lines.join('\n\n');
};

// A short, human description of where a figure's image comes from, for the UI.
export const describeImageSource = (figure: FigureLike): string => {
  // An equation is typeset, not pictured — "No image yet" reads as a missing
  // asset when nothing is missing.
  if (figure.assetKind === 'EQUATION') {
    return isNonEmptyString(figure.equationLatex)
      ? 'Typeset from LaTeX'
      : 'No equation body yet';
  }
  if (figure.assetKind === 'TABLE' && isNonEmptyString(figure.tableData)) {
    return 'Table grid';
  }
  const resolved = resolveFigureImage(figure);
  if (resolved.kind === 'dataurl' || resolved.kind === 'url') {
    switch (figure.imageSource) {
      case 'DATASET':
        return 'Plotted from dataset';
      case 'GENERATED':
        return 'Generated chart';
      case 'DIAGRAM':
        return 'Mermaid diagram';
      case 'URL':
        return 'Linked image';
      default:
        return resolved.kind === 'dataurl' ? 'Uploaded image' : 'Linked image';
    }
  }
  if (isNonEmptyString(figure.diagramSource)) {
    return 'Mermaid diagram (renders at export)';
  }
  switch (figure.imageSource) {
    case 'DATASET':
      return 'From a dataset (no render yet)';
    case 'GENERATED':
      return 'Generated (no render yet)';
    default:
      return 'No image yet';
  }
};
