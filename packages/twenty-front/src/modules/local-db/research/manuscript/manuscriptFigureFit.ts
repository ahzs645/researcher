import { isNonEmptyString } from '@sniptt/guards';

import { type ManuscriptBundle } from './manuscriptAssembly';
import { resolveFigureImage } from './manuscriptImages';

// Fit a figure to the page before either block-based exporter places it.
//
// `figureToBlocks` asks for a width and lets the image keep its own aspect
// ratio, which is right for the wide charts a paper usually carries. A tall
// figure — a portrait flowchart, a stacked panel — then resolves to a height
// no page has, and react-pdf squashes it back to the space it has instead of
// scaling it down, so the picture comes out stretched. Word simply runs it off
// the page. Measuring the image and narrowing the request until the height
// fits is what keeps the proportions.

// The printable column `figureToBlocks` sizes against, in the same CSS pixels.
const PRINTABLE_WIDTH_PX = 600;
// A4 less one-inch margins is 697 pt ≈ 930 px at the 0.75 pt/px the exporters
// use; leave room for the caption and the paragraph that follows it.
const PRINTABLE_HEIGHT_PX = 840;

const isBrowserEnvironment = (): boolean =>
  typeof document !== 'undefined' && typeof window !== 'undefined';

const imageAspectRatio = async (source: string): Promise<number | null> => {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('figure did not decode'));
      element.src = source;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    return width > 0 && height > 0 ? width / height : null;
  } catch {
    return null;
  }
};

// The widest this figure can be drawn and still fit the page, as a percentage
// of the printable column. Exported for the test; `null` means "leave it".
export const fittedFigureWidthPercent = (
  aspectRatio: number,
  requestedPercent: number,
): number | null => {
  const widest = Math.min(100, Math.max(10, requestedPercent));
  const tallestFittingWidth = PRINTABLE_HEIGHT_PX * aspectRatio;
  const fitted = Math.floor((tallestFittingWidth / PRINTABLE_WIDTH_PX) * 100);
  return fitted >= widest ? null : Math.max(10, fitted);
};

export const fitManuscriptFigureImages = async (
  bundle: ManuscriptBundle,
): Promise<ManuscriptBundle> => {
  if (!isBrowserEnvironment()) return bundle;

  const percentByRefKey = new Map<string, number>();
  for (const figure of bundle.numberedFigures) {
    const image = resolveFigureImage(figure);
    if (image.kind === 'none') continue;
    const aspectRatio = await imageAspectRatio(image.src);
    if (aspectRatio === null) continue;
    const fitted = fittedFigureWidthPercent(
      aspectRatio,
      figure.widthPercent ?? 100,
    );
    if (fitted === null) continue;
    percentByRefKey.set(figure.refKey ?? figure.id, fitted);
  }
  if (percentByRefKey.size === 0) return bundle;

  const fitted = <T extends { id: string; refKey?: string | null }>(
    figure: T,
  ): T => {
    const percent = percentByRefKey.get(figure.refKey ?? figure.id);
    return percent === undefined
      ? figure
      : { ...figure, widthPercent: percent };
  };

  return {
    ...bundle,
    numberedFigures: bundle.numberedFigures.map(fitted),
    nodes: bundle.nodes.map((node) =>
      node.kind === 'figure' || node.kind === 'table'
        ? { ...node, figure: fitted(node.figure) }
        : node,
    ),
    sourceInput: {
      ...bundle.sourceInput,
      figures: bundle.sourceInput.figures.map((figure) =>
        isNonEmptyString(figure.refKey) || isNonEmptyString(figure.id)
          ? fitted(figure)
          : figure,
      ),
    },
  };
};
