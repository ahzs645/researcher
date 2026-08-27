// Browser-only: turn a figure's data URL into the colour sample the rainbow
// check scores. The reading and the scoring are pure and live in
// `manuscriptFigureColor.ts`; this file only does the canvas work, the same
// split `manuscriptChart.ts` and `manuscriptChartImage.ts` already make.
//
// Two decisions worth stating.
//
// **Nearest-neighbour, not averaging.** The obvious way to shrink an image is
// to average the pixels being merged, and it is the wrong way here. Averaging
// invents colours that were never in the figure — halfway between two Jet
// entries is not a Jet entry, and halfway between a red line and a white page
// is a pink that belongs to no colour map at all. A check whose whole subject
// is which colours the figure is drawn in has to sample colours it was
// actually drawn in, so smoothing is turned off and the browser takes every
// n-th pixel.
//
// **512 pixels on the long edge.** What this costs is stated rather than
// hidden: the check needs to see distinct steps along a ramp, so the sampled
// size sets a ceiling on how much of a ramp a *thin* feature can cover. A Jet
// colour bar running half the height of a 512-pixel sample yields about 256
// distinct levels, which is the whole ramp; the same bar in a 200-pixel sample
// would yield about 100 and could not clear a threshold set at half the ramp.
// Going higher costs time superlinearly on photographs and buys nothing on
// figures that are already resolved. A 4000×3000 figure is read at 512×384 —
// a sixtieth of the pixels, and the same palette.
//
// Only data URLs are decoded. A remote image would be a network request at
// screening time, which this app does not do, and would taint the canvas so
// `getImageData` throws anyway.

import { isImageDataUrl } from './manuscriptImages';
import {
  readFigureColorSample,
  type FigureColorSample,
} from './manuscriptFigureColor';

const SAMPLE_LONG_EDGE = 512;

const sampleSize = (
  width: number,
  height: number,
): { width: number; height: number } => {
  const longEdge = Math.max(width, height);
  if (longEdge <= SAMPLE_LONG_EDGE) return { width, height };
  const scale = SAMPLE_LONG_EDGE / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode figure image'));
    image.src = source;
  });

// Null rather than a throw for anything that did not work out: a figure whose
// image cannot be read is a figure this check has nothing to say about, and
// the screener reports that as not having read it rather than as an all-clear.
export const decodeFigureColorSample = async (
  imageUrl: string,
): Promise<FigureColorSample | null> => {
  if (!isImageDataUrl(imageUrl)) return null;

  try {
    const image = await loadImage(imageUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width === 0 || height === 0) return null;

    const size = sampleSize(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return null;

    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, size.width, size.height);
    const { data } = context.getImageData(0, 0, size.width, size.height);
    return readFigureColorSample(data);
  } catch {
    return null;
  }
};

export type DecodableFigure = {
  id: string;
  imageUrl?: string | null;
};

// One figure at a time, deliberately. Every `await` here is a yield, so a
// manuscript with a dozen figures spreads its decoding across a dozen turns of
// the event loop instead of holding the main thread for all of it at once.
//
// The result is keyed by figure id and omits the figures that produced
// nothing, so its presence means "decoding was attempted" and a missing entry
// means "this one could not be read" — a distinction the screener needs in
// order to decline instead of passing.
export const decodeFigureColorSamples = async (
  figures: DecodableFigure[],
): Promise<Record<string, FigureColorSample>> => {
  const samples: Record<string, FigureColorSample> = {};

  for (const figure of figures) {
    if (figure.imageUrl === undefined || figure.imageUrl === null) continue;
    const sample = await decodeFigureColorSample(figure.imageUrl);
    if (sample !== null) samples[figure.id] = sample;
  }

  return samples;
};
