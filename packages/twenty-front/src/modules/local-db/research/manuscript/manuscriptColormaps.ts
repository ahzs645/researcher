// ── The colour maps a figure should not be drawn in ────────────────────────
//
// A rainbow colour map is bad for two separate reasons. It is not monotonic in
// lightness, so it invents boundaries where the data is smooth and hides
// boundaries where the data is not — the reader sees structure that is an
// artefact of the palette. And it is unreadable to a colourblind reader, since
// the red-to-green sweep that carries most of its range is exactly the axis a
// deuteranope cannot see. The second reason is why this check exists at all.
//
// These are the maps JetFighter treats as rainbow (`rainbow_maps` in
// `smsaladi/jetfighter`, `detect_cmap.py`): jet, hsv, rainbow, gist_rainbow,
// nipy_spectral, and also prism and gist_ncar, which are left out here because
// they are joke palettes nobody plots data in and each one added is another
// chance to be wrong about a figure.
//
// The control points are matplotlib's own, copied from
// `matplotlib/lib/matplotlib/_cm.py` rather than remembered: `_jet_data`,
// `_hsv_data`, `_nipy_spectral_data`, `_gist_rainbow_data`, and `_rainbow_data`
// with the Gnuplot palette functions `_g33`, `_g13` and `_g10` it refers to.
// The whole check turns on these numbers being right, so they are written here
// in the same form matplotlib writes them.
//
// matplotlib's segment data gives each anchor two values, one for the approach
// from below and one from above, so a map can jump. None of these five jumps —
// every anchor in `_jet_data`, `_hsv_data` and `_nipy_spectral_data` has the
// same value on both sides — so one value per anchor is exact here, and the
// second column is dropped rather than carried unused.

import { srgbToLab, type LabColor } from './manuscriptColorSpace';

// matplotlib's default lookup-table size, and the denominator JetFighter's
// coverage fraction is taken over.
export const COLORMAP_ENTRY_COUNT = 256;

type ChannelAnchors = readonly (readonly [position: number, value: number])[];

type ColormapDefinition = {
  name: string;
  // The ramp as a function of position along it, in the 0–1 channel values
  // matplotlib uses.
  color: (position: number) => readonly [number, number, number];
};

const interpolateChannel = (
  anchors: ChannelAnchors,
  position: number,
): number => {
  if (position <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (position >= last[0]) return last[1];

  for (let index = 1; index < anchors.length; index += 1) {
    const [rightPosition, rightValue] = anchors[index];
    if (position > rightPosition) continue;
    const [leftPosition, leftValue] = anchors[index - 1];
    const span = rightPosition - leftPosition;
    // Two anchors at the same position would be a jump, which none of these
    // maps has; taking the right-hand value is what matplotlib does anyway.
    if (span === 0) return rightValue;
    return (
      leftValue + ((position - leftPosition) / span) * (rightValue - leftValue)
    );
  }

  return last[1];
};

const segmentedColormap = (
  name: string,
  red: ChannelAnchors,
  green: ChannelAnchors,
  blue: ChannelAnchors,
): ColormapDefinition => ({
  name,
  color: (position) => [
    interpolateChannel(red, position),
    interpolateChannel(green, position),
    interpolateChannel(blue, position),
  ],
});

// `_jet_data`.
const JET = segmentedColormap(
  'jet',
  [
    [0.0, 0],
    [0.35, 0],
    [0.66, 1],
    [0.89, 1],
    [1.0, 0.5],
  ],
  [
    [0.0, 0],
    [0.125, 0],
    [0.375, 1],
    [0.64, 1],
    [0.91, 0],
    [1.0, 0],
  ],
  [
    [0.0, 0.5],
    [0.11, 1],
    [0.34, 1],
    [0.65, 0],
    [1.0, 0],
  ],
);

// `_hsv_data`.
const HSV = segmentedColormap(
  'hsv',
  [
    [0.0, 1.0],
    [0.15873, 1.0],
    [0.174603, 0.96875],
    [0.333333, 0.03125],
    [0.349206, 0.0],
    [0.666667, 0.0],
    [0.68254, 0.03125],
    [0.84127, 0.96875],
    [0.857143, 1.0],
    [1.0, 1.0],
  ],
  [
    [0.0, 0.0],
    [0.15873, 0.9375],
    [0.174603, 1.0],
    [0.507937, 1.0],
    [0.666667, 0.0625],
    [0.68254, 0.0],
    [1.0, 0.0],
  ],
  [
    [0.0, 0.0],
    [0.333333, 0.0],
    [0.349206, 0.0625],
    [0.507937, 1.0],
    [0.84127, 1.0],
    [0.857143, 0.9375],
    [1.0, 0.09375],
  ],
);

// `_nipy_spectral_data`.
const NIPY_SPECTRAL = segmentedColormap(
  'nipy_spectral',
  [
    [0.0, 0.0],
    [0.05, 0.4667],
    [0.1, 0.5333],
    [0.15, 0.0],
    [0.6, 0.0],
    [0.65, 0.7333],
    [0.7, 0.9333],
    [0.75, 1.0],
    [0.85, 1.0],
    [0.9, 0.8667],
    [0.95, 0.8],
    [1.0, 0.8],
  ],
  [
    [0.0, 0.0],
    [0.2, 0.0],
    [0.25, 0.4667],
    [0.3, 0.6],
    [0.35, 0.6667],
    [0.4, 0.6667],
    [0.45, 0.6],
    [0.5, 0.7333],
    [0.55, 0.8667],
    [0.6, 1.0],
    [0.65, 1.0],
    [0.7, 0.9333],
    [0.75, 0.8],
    [0.8, 0.6],
    [0.85, 0.0],
    [0.95, 0.0],
    [1.0, 0.8],
  ],
  [
    [0.0, 0.0],
    [0.05, 0.5333],
    [0.1, 0.6],
    [0.15, 0.6667],
    [0.2, 0.8667],
    [0.3, 0.8667],
    [0.35, 0.6667],
    [0.4, 0.5333],
    [0.45, 0.0],
    [0.95, 0.0],
    [1.0, 0.8],
  ],
);

// `_gist_rainbow_data`, which matplotlib states as whole colours at positions
// rather than per channel and builds with `LinearSegmentedColormap.from_list`
// — the same piecewise-linear interpolation, written the other way round.
const GIST_RAINBOW = segmentedColormap(
  'gist_rainbow',
  [
    [0.0, 1.0],
    [0.03, 1.0],
    [0.215, 1.0],
    [0.4, 0.0],
    [0.586, 0.0],
    [0.77, 0.0],
    [0.954, 1.0],
    [1.0, 1.0],
  ],
  [
    [0.0, 0.0],
    [0.03, 0.0],
    [0.215, 1.0],
    [0.4, 1.0],
    [0.586, 1.0],
    [0.77, 0.0],
    [0.954, 0.0],
    [1.0, 0.0],
  ],
  [
    [0.0, 0.16],
    [0.03, 0.0],
    [0.215, 0.0],
    [0.4, 0.0],
    [0.586, 1.0],
    [0.77, 1.0],
    [0.954, 1.0],
    [1.0, 0.75],
  ],
);

const clampChannel = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

// `_rainbow_data`, which is given as Gnuplot palette functions rather than
// anchors: red `_g33` = |2x − ½|, green `_g13` = sin(πx), blue `_g10` =
// cos(πx/2). matplotlib clips the result into 0–1, which is why red is flat at
// the top of the ramp.
const RAINBOW: ColormapDefinition = {
  name: 'rainbow',
  color: (position) => [
    clampChannel(Math.abs(2 * position - 0.5)),
    clampChannel(Math.sin(position * Math.PI)),
    clampChannel(Math.cos((position * Math.PI) / 2)),
  ],
};

export const RAINBOW_COLORMAPS: readonly ColormapDefinition[] = [
  JET,
  HSV,
  RAINBOW,
  GIST_RAINBOW,
  NIPY_SPECTRAL,
];

export type SampledColormap = {
  name: string;
  entries: LabColor[];
};

// matplotlib builds its lookup table by evaluating the ramp at 256 evenly
// spaced positions from 0 to 1 inclusive, so that is where these are read.
const sampleColormap = (definition: ColormapDefinition): SampledColormap => ({
  name: definition.name,
  entries: Array.from({ length: COLORMAP_ENTRY_COUNT }, (_unused, index) => {
    const [red, green, blue] = definition.color(
      index / (COLORMAP_ENTRY_COUNT - 1),
    );
    return srgbToLab(red * 255, green * 255, blue * 255);
  }),
});

let sampledRainbowColormaps: SampledColormap[] | null = null;

// Built once and kept: five 256-entry ramps is five thousand-odd conversions,
// and a manuscript with a dozen figures would otherwise pay for them a dozen
// times.
export const rainbowColormapsInLab = (): SampledColormap[] => {
  if (sampledRainbowColormaps === null) {
    sampledRainbowColormaps = RAINBOW_COLORMAPS.map(sampleColormap);
  }
  return sampledRainbowColormaps;
};

// Exposed for tests and for anything that wants to draw a ramp: the sRGB bytes
// of one colour map at a position along it.
export const colormapColorAt = (
  name: string,
  position: number,
): readonly [number, number, number] => {
  const definition = RAINBOW_COLORMAPS.find(
    (candidate) => candidate.name === name,
  );
  if (definition === undefined) {
    throw new Error(`Unknown colour map: ${name}`);
  }
  const [red, green, blue] = definition.color(position);
  return [
    Math.round(red * 255),
    Math.round(green * 255),
    Math.round(blue * 255),
  ];
};
