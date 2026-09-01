// ── Rainbow colour maps in figures (JetFighter) ────────────────────────────
//
// The only accessibility check in the whole screening set, and the reason it
// is worth more than the reproducibility ones: a rainbow colour map is not
// merely a poor choice, it is unreadable to a colourblind reader. Its
// red-to-green sweep carries most of its range along exactly the axis a
// deuteranope cannot see, so about one man in twelve gets a picture with the
// data taken out of it. The reproducibility argument — that a non-monotonic
// ramp invents boundaries in smooth data and hides real ones — is true as
// well, and secondary.
//
// This was written off on this branch as needing "pixels and a model",
// together with Barzooka. Half of that was right. Barzooka is a trained
// convolutional network; JetFighter is a heuristic that converts an image to a
// perceptually uniform colour space and asks how much of a known-bad colour
// map the image's colours cover. No model, no weights, nothing to download.
// `manuscriptFigureColor.ts` carries the statistic and the argument for it.
//
// Thresholds, and where each came from:
//
// * **Half the ramp** is JetFighter's own `cm_thresh = 0.5` in
//   `smsaladi/jetfighter`, `detect_cmap.py`, the setting its published
//   under-1% strict false positive rate was measured at. It is not a number
//   invented here.
// * **A tenth of the coloured figure** is the one addition. JetFighter
//   computes this second statistic and does not threshold on it; running the
//   check against synthetic figures showed why it is worth doing. A
//   full-gamut photograph has some colour near almost every ramp entry and
//   covers 0.87 of a rainbow ramp — but only 0.03 of the figure is actually
//   drawn in ramp colours, where a real Jet heat map scores 0.99 and a Jet
//   colour bar on an otherwise fine figure scores 0.997. Thirty times the
//   margin either side of a tenth. Without it every colour photograph in a
//   biology paper would be reported as a rainbow colour map, which is exactly
//   the noise that teaches an author to stop reading the panel.
// * **A quarter of the ramp** is half of JetFighter's threshold, and marks
//   weak rather than absent. A figure lands here when only part of a ramp is
//   present — a short colour bar, a heavily downsampled one, a plot using a
//   slice of Jet — which is a reason to look, not a verdict.
//
// What a figure with a small rainbow colour bar and an otherwise fine image
// reports: **absent**, the same as a full Jet heat map, and that is the point.
// The statistic is coverage of the colour map, not area of the figure, so a
// colour bar sweeping the whole ramp scores near 1.0 however few pixels it
// occupies. That is the right answer, because if the colour bar is Jet then
// the data it maps is Jet — the bar is the legend for a picture drawn in the
// same colours. A check that measured area would let exactly the figures worth
// fixing through.
//
// Near-greyscale figures and figures with too few colours to be a colour map
// are reported as found rather than declined: a greyscale micrograph and a
// six-colour line plot were both looked at and both genuinely carry no rainbow.
// Declining is for having nothing to look at.

import { isDefined } from 'twenty-shared/utils';

import {
  bestRainbowCoverage,
  scoreFigureColormaps,
  type ColormapCoverage,
} from '@/local-db/research/manuscript/manuscriptFigureColor';

import { absent, figureOutcome, notApplicable } from './screeningOutcomes';
import {
  type ScreeningFigure,
  type ScreeningResult,
  type ScreeningScope,
  type ScreeningVerdict,
} from './screeningTypes';

export const RAINBOW_RAMP_COVERAGE = 0.5;
export const PARTIAL_RAMP_COVERAGE = 0.25;
export const RAINBOW_PIXEL_COVERAGE = 0.1;

// Fewer distinct colours than this is a palette, not a ramp. A colour map has
// to clear half of 256 entries to be reported at all, and that needs at least
// 128 distinct colours, so this floor never changes a verdict; it is here so
// the finding can say *why* a figure is clean rather than only that it is.
const MINIMUM_DISTINCT_COLORS = 16;

type FigureJudgement = {
  figure: ScreeningFigure;
  verdict: ScreeningVerdict;
  detail: string;
  coverage: ColormapCoverage | null;
};

const asPercent = (fraction: number): string =>
  `${Math.round(fraction * 100)}%`;

const judgeFigure = (figure: ScreeningFigure): FigureJudgement | null => {
  const sample = figure.pixels;
  if (!isDefined(sample)) return null;

  // An image that decoded to nothing was not read, whatever the decoder
  // returned. Treated as unread rather than as clean.
  if (sample.sampledPixelCount === 0) return null;

  const score = scoreFigureColormaps(sample);

  if (score.distinctColorCount === 0) {
    return {
      figure,
      verdict: 'PRESENT',
      detail: `${figure.label} is greyscale, so no colour map can make it unreadable.`,
      coverage: null,
    };
  }

  if (score.distinctColorCount < MINIMUM_DISTINCT_COLORS) {
    return {
      figure,
      verdict: 'PRESENT',
      detail: `${figure.label} is drawn in ${score.distinctColorCount} colours — a palette, not a colour map.`,
      coverage: null,
    };
  }

  const best = bestRainbowCoverage(score);
  if (best === null || best.rampCoverage <= PARTIAL_RAMP_COVERAGE) {
    return {
      figure,
      verdict: 'PRESENT',
      detail: `${figure.label} uses no rainbow colour map.`,
      coverage: best,
    };
  }

  if (best.rampCoverage <= RAINBOW_RAMP_COVERAGE) {
    return {
      figure,
      verdict: 'WEAK',
      detail: `${figure.label} carries part of the ${best.colormap} colour map — ${asPercent(best.rampCoverage)} of its range. Worth checking whether a colour bar or a panel was drawn in it.`,
      coverage: best,
    };
  }

  // The whole ramp is present and almost none of the figure is drawn in it,
  // which is what a photograph looks like — and also what a small rainbow
  // colour bar beside a photographic panel looks like. Neither can be asserted
  // from the colours alone, so the author is asked to look.
  if (best.pixelCoverage < RAINBOW_PIXEL_COVERAGE) {
    return {
      figure,
      verdict: 'WEAK',
      detail: `${figure.label} contains colours spanning the ${best.colormap} colour map, but only ${asPercent(best.pixelCoverage)} of its colour is drawn in them — usually a photograph rather than a colour map, so worth a look rather than a change.`,
      coverage: best,
    };
  }

  return {
    figure,
    verdict: 'ABSENT',
    detail: `${figure.label} is drawn in the ${best.colormap} rainbow colour map — ${asPercent(best.rampCoverage)} of its range, over ${asPercent(best.pixelCoverage)} of the figure's colour. A rainbow map is unreadable to a colourblind reader and invents boundaries in smooth data; viridis, cividis or magma carry the same information.`,
    coverage: best,
  };
};

const VERDICT_ORDER: Record<ScreeningVerdict, number> = {
  ABSENT: 0,
  WEAK: 1,
  PRESENT: 2,
};

export const screenFigureColormaps = (
  figures: ScreeningFigure[],
  scope: ScreeningScope,
): ScreeningResult => {
  // Only rasters. A table has no image, and a Mermaid diagram has no pixels
  // until export draws it — declining on those is honest where reporting them
  // clean would be a verdict on something never looked at.
  const rasters = figures.filter(
    (figure) => figure.hasImage && figure.imageUrl !== null,
  );

  if (rasters.length === 0) {
    return scope.isJudgeable
      ? notApplicable(
          'This manuscript carries no figure images with pixels to read — a table, an equation or a diagram has no colour map.',
        )
      : absent(
          'No figure colours were read. Expected wherever the paper shows an image.',
        );
  }

  const judgements = rasters
    .map(judgeFigure)
    .filter((judgement): judgement is FigureJudgement => judgement !== null);

  // Nothing was decoded. Either the caller does not decode figures at all — in
  // which case reporting every figure clean would be an all-clear this check
  // never earned — or every image failed to read. Both decline.
  if (judgements.length === 0) {
    return notApplicable(
      rasters.length === 1
        ? 'The figure image was not decoded, so its colours were not read.'
        : 'The figure images were not decoded, so their colours were not read.',
    );
  }

  const [worst] = [...judgements].sort(
    (left, right) => VERDICT_ORDER[left.verdict] - VERDICT_ORDER[right.verdict],
  );
  const sameVerdict = judgements.filter(
    (judgement) => judgement.verdict === worst.verdict,
  );

  // Some figures were read and some were not, which changes what a clean
  // verdict is worth. Said out loud rather than rounded up.
  const unread = rasters.length - judgements.length;
  const unreadNote =
    unread === 0
      ? ''
      : ` ${unread} further figure image${unread === 1 ? '' : 's'} could not be read.`;

  if (worst.verdict === 'PRESENT') {
    return figureOutcome({
      figure: worst.figure,
      verdict: 'PRESENT',
      detail:
        judgements.length === 1
          ? `${worst.detail}${unreadNote}`
          : `None of the ${judgements.length} figure images use a rainbow colour map.${unreadNote}`,
      evidence: worst.figure.caption,
    });
  }

  if (sameVerdict.length === 1) {
    return figureOutcome({
      figure: worst.figure,
      verdict: worst.verdict,
      detail: `${worst.detail}${unreadNote}`,
      evidence: worst.figure.caption,
    });
  }

  // Counted first, then the worst one described in full. A weak verdict is not
  // an accusation, so the two counts are not worded the same way.
  const lead =
    worst.verdict === 'ABSENT'
      ? `${sameVerdict.length} figures are drawn in a rainbow colour map.`
      : `${sameVerdict.length} figures are worth checking for a rainbow colour map.`;

  return figureOutcome({
    figure: worst.figure,
    verdict: worst.verdict,
    detail: `${lead} ${worst.detail}${unreadNote}`,
    evidence: worst.figure.caption,
  });
};
