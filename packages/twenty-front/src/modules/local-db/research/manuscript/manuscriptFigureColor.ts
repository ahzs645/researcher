// ── Reading a figure's colours, and asking which colour map they came from ─
//
// This is JetFighter's heuristic, written out. It is worth being explicit
// about what the statistic actually is, because the obvious guess is wrong.
//
// The natural thing to measure is "what fraction of this figure is drawn in
// Jet colours", and that is not what JetFighter measures. Its `pct_cm` is
// *coverage of the colour map*: of the map's 256 entries, how many does some
// colour in the figure land on. `detect_cmap.py` computes
// `cm_colors.size / 256` and flags a page when that exceeds `cm_thresh = 0.5`.
//
// Measuring it that way round is the whole reason the check works on real
// papers. A figure whose only rainbow is a thin colour bar down one edge is a
// rounding error by area — and it sweeps the entire ramp, so it scores near
// 1.0 on coverage. That is the right answer: if the colour bar is Jet then the
// data it maps is Jet, however few pixels the bar occupies. Meanwhile a line
// plot with a red line and a blue line covers two entries out of 256 and
// scores 0.008, where an area-based measure would have to be told about line
// plots explicitly.
//
// The other statistic here, how much of the figure is drawn in matched
// colours, is JetFighter's `pct_page` weighted by pixels rather than by
// distinct colours. It never decides anything; it is there so the finding can
// tell the author whether the whole figure or only its colour bar is affected,
// which is the difference between recolouring a plot and regenerating it.
//
// Known limitation, stated rather than hidden: a photograph that spans the
// gamut — a bright macrograph, a colour-cast microscopy overlay — has some
// colour near almost every ramp entry and can score as rainbow. JetFighter has
// the same weakness and still measured strict false positives under 1% on real
// preprint pages, because scientific figures mostly are not photographs. The
// verdict this feeds never blocks anything and always names the figure, so the
// author can look and disagree.

import {
  labChroma,
  labDistance,
  srgbToLab,
  type LabColor,
} from './manuscriptColorSpace';
import {
  COLORMAP_ENTRY_COUNT,
  rainbowColormapsInLab,
} from './manuscriptColormaps';

// How close a figure colour has to be to a ramp entry to count as that entry,
// in CIELAB ΔE*ab.
//
// JetFighter uses `max_diff = 1.0` in CAM02-UCS, a later and better-behaved
// uniform space than CIELAB. CIELAB overstates differences among saturated
// colours — which is all a rainbow ramp contains — so the same perceptual
// tolerance is a larger number here; 2.0 is that translation, and it also sits
// just under the ~2.3 ΔE*ab usually quoted as the smallest difference a person
// can see at all. So a match means the figure colour and the ramp colour are
// the same colour to a reader, which is the claim the check needs to make.
export const COLORMAP_MATCH_RADIUS = 2.0;

// Below this much colour a pixel is grey, and grey is not a colour map. Black
// text, grey axes, a white background and every anti-aliased blend between
// them fall out here, which is what lets a greyscale figure be judged rather
// than guessed at.
export const NEUTRAL_CHROMA = 8;

// Fully transparent and near-transparent pixels are background, not figure.
const OPAQUE_ALPHA = 128;

// How many distinct colours a figure is allowed to spend before its palette is
// coarsened. A plot has hundreds and a Jet heat map with JPEG noise has tens of
// thousands, so nothing real is touched by this; a photograph has two hundred
// thousand, and scoring those unbudgeted is most of a second of blocked main
// thread per figure.
const DISTINCT_COLOR_BUDGET = 32768;

// Bits per channel to fall back through when the budget is spent. Six bits is
// a step of four in sRGB, under one ΔE*ab almost everywhere and so below the
// match radius that measured coverage does not move: a noisy Jet heat map
// scores 1.000 either way. Five and four bits do cost coverage, and are there
// only so a photograph terminates rather than to be relied on.
const COLOR_DEPTH_LADDER = [8, 6, 5, 4] as const;

const quantiseChannel = (value: number, bits: number): number => {
  if (bits >= 8) return value;
  const step = 1 << (8 - bits);
  // Snapped to the middle of the bucket rather than its floor, so the error is
  // symmetric instead of always darkening the figure.
  return Math.min(255, Math.floor(value / step) * step + (step >> 1));
};

const recountAtDepth = (
  histogram: Map<number, number>,
  bits: number,
): Map<number, number> => {
  const coarser = new Map<number, number>();
  for (const [packed, count] of histogram) {
    const key =
      (quantiseChannel((packed >> 16) & 255, bits) << 16) |
      (quantiseChannel((packed >> 8) & 255, bits) << 8) |
      quantiseChannel(packed & 255, bits);
    coarser.set(key, (coarser.get(key) ?? 0) + count);
  }
  return coarser;
};

export type FigureColorSample = {
  // The distinct chromatic colours the figure is drawn in, packed as
  // (red << 16) | (green << 8) | blue, with how many sampled pixels carried
  // each. A typed array rather than objects because this is what crosses from
  // the decode step into React state, and a busy figure has tens of thousands
  // of distinct colours.
  colors: Uint32Array;
  counts: Uint32Array;
  // Pixels the sample was taken from, after downsampling.
  sampledPixelCount: number;
  // Of those, the ones carrying enough colour to belong to a colour map.
  chromaticPixelCount: number;
  // Bits per channel the palette was counted at. Eight unless the figure had
  // more distinct colours than the budget allows, which in practice means a
  // photograph.
  colorDepthBits: number;
};

export type ColormapCoverage = {
  colormap: string;
  // Of the colour map's 256 entries, the fraction some colour in the figure
  // lands on. JetFighter's `pct_cm`, and the number its threshold is on.
  rampCoverage: number;
  // Of the figure's chromatic pixels, the fraction drawn in a colour that
  // matched the ramp. Reported, never decisive.
  pixelCoverage: number;
};

export type FigureColormapScore = {
  distinctColorCount: number;
  chromaticPixelCount: number;
  sampledPixelCount: number;
  // Every rainbow map scored, best coverage first.
  coverages: ColormapCoverage[];
};

const EMPTY_SAMPLE: FigureColorSample = {
  colors: new Uint32Array(0),
  counts: new Uint32Array(0),
  sampledPixelCount: 0,
  chromaticPixelCount: 0,
  colorDepthBits: 8,
};

// Decoded RGBA into the distinct colours the figure is drawn in. Pure, so the
// scoring half is testable with a hand-built array and no canvas anywhere.
//
// Pure white and pure black go first, as they do in JetFighter's `parse_img`:
// they are the page and the ink, they are most of the pixels in a line
// drawing, and no colour map entry is either of them.
export const readFigureColorSample = (
  pixels: Uint8ClampedArray,
): FigureColorSample => {
  if (pixels.length < 4) return EMPTY_SAMPLE;

  let histogram = new Map<number, number>();
  let sampledPixelCount = 0;
  let depthStep = 0;
  let colorDepthBits = COLOR_DEPTH_LADDER[depthStep];

  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    if (pixels[offset + 3] < OPAQUE_ALPHA) continue;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    sampledPixelCount += 1;

    const isWhite = red === 255 && green === 255 && blue === 255;
    const isBlack = red === 0 && green === 0 && blue === 0;
    if (isWhite || isBlack) continue;

    const packed =
      (quantiseChannel(red, colorDepthBits) << 16) |
      (quantiseChannel(green, colorDepthBits) << 8) |
      quantiseChannel(blue, colorDepthBits);
    histogram.set(packed, (histogram.get(packed) ?? 0) + 1);

    // Coarsen mid-walk rather than afterwards, so a photograph never costs a
    // quarter of a million map entries in the first place.
    while (
      histogram.size > DISTINCT_COLOR_BUDGET &&
      depthStep < COLOR_DEPTH_LADDER.length - 1
    ) {
      depthStep += 1;
      colorDepthBits = COLOR_DEPTH_LADDER[depthStep];
      histogram = recountAtDepth(histogram, colorDepthBits);
    }
  }

  // The chroma cut needs CIELAB, so it happens per distinct colour rather than
  // per pixel — a smooth gradient has millions of pixels and hundreds of
  // colours.
  const colors: number[] = [];
  const counts: number[] = [];
  let chromatic = 0;
  for (const [packed, count] of histogram) {
    const lab = srgbToLab(
      (packed >> 16) & 255,
      (packed >> 8) & 255,
      packed & 255,
    );
    if (labChroma(lab) < NEUTRAL_CHROMA) continue;
    colors.push(packed);
    counts.push(count);
    chromatic += count;
  }

  return {
    colors: Uint32Array.from(colors),
    counts: Uint32Array.from(counts),
    sampledPixelCount,
    chromaticPixelCount: chromatic,
    colorDepthBits,
  };
};

type ColorIndex = {
  labs: LabColor[];
  counts: Uint32Array;
  // Colours bucketed into a CIELAB grid whose cell is one match radius wide,
  // so everything within the radius of a point is in the twenty-seven cells
  // around it. This is the same idea as JetFighter's k-d tree and cheaper to
  // read: without it, scoring a busy figure would be every distinct colour
  // against every one of five times 256 ramp entries.
  cells: Map<string, number[]>;
};

const cellKey = (color: LabColor): string =>
  `${Math.floor(color.lightness / COLORMAP_MATCH_RADIUS)}|${Math.floor(
    color.greenRed / COLORMAP_MATCH_RADIUS,
  )}|${Math.floor(color.blueYellow / COLORMAP_MATCH_RADIUS)}`;

const buildColorIndex = (sample: FigureColorSample): ColorIndex => {
  const labs: LabColor[] = [];
  const cells = new Map<string, number[]>();

  for (let index = 0; index < sample.colors.length; index += 1) {
    const packed = sample.colors[index];
    const lab = srgbToLab(
      (packed >> 16) & 255,
      (packed >> 8) & 255,
      packed & 255,
    );
    labs.push(lab);
    const key = cellKey(lab);
    const bucket = cells.get(key);
    if (bucket === undefined) {
      cells.set(key, [index]);
    } else {
      bucket.push(index);
    }
  }

  return { labs, counts: sample.counts, cells };
};

const coverageForColormap = (
  index: ColorIndex,
  entries: LabColor[],
  chromaticPixelCount: number,
): { rampCoverage: number; pixelCoverage: number } => {
  const matchedColors = new Uint8Array(index.labs.length);
  let matchedEntries = 0;

  for (const entry of entries) {
    const lightnessCell = Math.floor(entry.lightness / COLORMAP_MATCH_RADIUS);
    const greenRedCell = Math.floor(entry.greenRed / COLORMAP_MATCH_RADIUS);
    const blueYellowCell = Math.floor(entry.blueYellow / COLORMAP_MATCH_RADIUS);
    let isEntryMatched = false;

    for (let dl = -1; dl <= 1; dl += 1) {
      for (let da = -1; da <= 1; da += 1) {
        for (let db = -1; db <= 1; db += 1) {
          const bucket = index.cells.get(
            `${lightnessCell + dl}|${greenRedCell + da}|${blueYellowCell + db}`,
          );
          if (bucket === undefined) continue;
          for (const colorIndex of bucket) {
            if (
              labDistance(entry, index.labs[colorIndex]) >=
              COLORMAP_MATCH_RADIUS
            )
              continue;
            isEntryMatched = true;
            matchedColors[colorIndex] = 1;
          }
        }
      }
    }

    if (isEntryMatched) matchedEntries += 1;
  }

  let matchedPixels = 0;
  for (let colorIndex = 0; colorIndex < matchedColors.length; colorIndex += 1) {
    if (matchedColors[colorIndex] === 1)
      matchedPixels += index.counts[colorIndex];
  }

  return {
    rampCoverage: matchedEntries / COLORMAP_ENTRY_COUNT,
    pixelCoverage:
      chromaticPixelCount === 0 ? 0 : matchedPixels / chromaticPixelCount,
  };
};

export const scoreFigureColormaps = (
  sample: FigureColorSample,
): FigureColormapScore => {
  const index = buildColorIndex(sample);
  const coverages = rainbowColormapsInLab()
    .map(({ name, entries }) => ({
      colormap: name,
      ...coverageForColormap(index, entries, sample.chromaticPixelCount),
    }))
    .sort((left, right) => right.rampCoverage - left.rampCoverage);

  return {
    distinctColorCount: sample.colors.length,
    chromaticPixelCount: sample.chromaticPixelCount,
    sampledPixelCount: sample.sampledPixelCount,
    coverages,
  };
};

// The one number the check turns on: how much of the closest-matching rainbow
// ramp this figure is drawn in.
export const bestRainbowCoverage = (
  score: FigureColormapScore,
): ColormapCoverage | null => score.coverages[0] ?? null;
