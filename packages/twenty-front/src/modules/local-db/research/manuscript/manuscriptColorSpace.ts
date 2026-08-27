// ── sRGB to CIELAB, and the distance between two colours ───────────────────
//
// Why a colour space at all: "is this figure drawn in Jet" is a question about
// what a reader sees, and distance in RGB does not answer it. Two pairs of RGB
// values the same distance apart can be indistinguishable in one part of the
// cube and obviously different in another, so a single matching radius in RGB
// would mean a different thing for every colour it was applied to. CIELAB is
// approximately perceptually uniform, which is what makes one radius
// defensible everywhere.
//
// The chain is the standard one. sRGB is gamma-encoded, so it is linearised
// first, then multiplied into CIE XYZ by the sRGB primaries matrix, then
// folded into CIELAB against the D65 white point sRGB is defined for.
//
// Where the numbers came from: the W3C CSS Color 4 sample conversion code
// (`w3c/csswg-drafts`, `css-color-4/conversions.js`), which gives the sRGB→XYZ
// matrix as exact rationals and CIELAB's ε = 216/24389 and κ = 24389/27. The
// white point is D65 derived from its chromaticity the way that same file
// derives it, rather than the rounded 0.95047/1/1.08883 tristimulus values, so
// the whole chain comes from one source and not from three.
//
// Pure and dependency-free on purpose: the jest environment has no canvas, and
// this half of the check has to be testable without one.

export type LabColor = {
  lightness: number;
  greenRed: number;
  blueYellow: number;
};

// sRGB is gamma-encoded and there are only 256 possible channel values, so the
// inverse companding is a table rather than a `Math.pow` per channel per pixel
// — a 512×512 sample is a quarter of a million pixels and three pows each is
// the difference between a check that runs while the panel opens and one that
// does not.
const SRGB_TO_LINEAR = new Float64Array(256);
for (let value = 0; value < 256; value += 1) {
  const channel = value / 255;
  SRGB_TO_LINEAR[value] =
    channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export const srgbChannelToLinear = (value: number): number =>
  SRGB_TO_LINEAR[Math.min(255, Math.max(0, Math.round(value)))];

// The sRGB primaries against D65, as the exact rationals CSS Color 4 states
// them. Written out rather than reduced to decimals so the source is legible
// in the file that uses them.
const LINEAR_RGB_TO_XYZ = [
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
] as const;

// D65 from its chromaticity (x = 0.3127, y = 0.3290), normalised to Y = 1.
const D65_WHITE_X = 0.3127 / 0.329;
const D65_WHITE_Y = 1;
const D65_WHITE_Z = (1 - 0.3127 - 0.329) / 0.329;

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

// The cube-root leg of CIELAB, with the linear segment near black that keeps
// the function from having an infinite slope at zero.
const labTransfer = (ratio: number): number =>
  ratio > LAB_EPSILON ? Math.cbrt(ratio) : (LAB_KAPPA * ratio + 16) / 116;

export const srgbToLab = (
  red: number,
  green: number,
  blue: number,
): LabColor => {
  const linearRed = srgbChannelToLinear(red);
  const linearGreen = srgbChannelToLinear(green);
  const linearBlue = srgbChannelToLinear(blue);

  const x =
    LINEAR_RGB_TO_XYZ[0][0] * linearRed +
    LINEAR_RGB_TO_XYZ[0][1] * linearGreen +
    LINEAR_RGB_TO_XYZ[0][2] * linearBlue;
  const y =
    LINEAR_RGB_TO_XYZ[1][0] * linearRed +
    LINEAR_RGB_TO_XYZ[1][1] * linearGreen +
    LINEAR_RGB_TO_XYZ[1][2] * linearBlue;
  const z =
    LINEAR_RGB_TO_XYZ[2][0] * linearRed +
    LINEAR_RGB_TO_XYZ[2][1] * linearGreen +
    LINEAR_RGB_TO_XYZ[2][2] * linearBlue;

  const fx = labTransfer(x / D65_WHITE_X);
  const fy = labTransfer(y / D65_WHITE_Y);
  const fz = labTransfer(z / D65_WHITE_Z);

  return {
    lightness: 116 * fy - 16,
    greenRed: 500 * (fx - fy),
    blueYellow: 200 * (fy - fz),
  };
};

// CIE76: the plain Euclidean distance in CIELAB, which is the metric CIELAB
// was designed to make meaningful. The later ΔE2000 corrections would buy
// accuracy in exactly the regions this check does not turn on — near-neutral
// greys, which are excluded before scoring begins — at the cost of a formula
// nobody reading this file could check by eye.
export const labDistance = (left: LabColor, right: LabColor): number =>
  Math.sqrt(
    (left.lightness - right.lightness) ** 2 +
      (left.greenRed - right.greenRed) ** 2 +
      (left.blueYellow - right.blueYellow) ** 2,
  );

// How much colour a pixel carries, independent of how light it is. The gate on
// "is this greyscale": black text, grey axes, a white background and every
// anti-aliased blend between them sit near zero here, and no colour map does.
export const labChroma = (color: LabColor): number =>
  Math.sqrt(color.greenRed ** 2 + color.blueYellow ** 2);
