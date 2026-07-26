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

// True when a figure has a usable image (vs caption-only placeholder).
export const figureHasImage = (figure: FigureLike): boolean =>
  resolveFigureImage(figure).kind !== 'none';

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

  if (image.kind !== 'none') {
    lines.push(`![${alt}](${image.src})`);
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
  const resolved = resolveFigureImage(figure);
  if (resolved.kind === 'dataurl') return 'Uploaded image';
  if (resolved.kind === 'url') return 'Linked image';
  switch (figure.imageSource) {
    case 'DATASET':
      return 'From a dataset (no render yet)';
    case 'GENERATED':
      return 'Generated (no render yet)';
    default:
      return 'No image yet';
  }
};
