// ── Figure captions and alternative text (this composer) ───────────────────
//
// The first check on the figure axis, and the cheapest: a figure nobody
// captioned is a figure nobody can read, and a figure with no alt text is one
// a screen reader — and a JATS `<alt-text>` element — has nothing to say
// about. It is here because it proves a screening check can name a figure
// instead of a section, and it stays because it is worth running.
//
// It reads only assets that carry a picture. A table is documented by its
// grid and an equation by its notation; alt text is a claim about an image.

import { absent, figureOutcome, notApplicable } from './screeningOutcomes';
import {
  type ScreeningFigure,
  type ScreeningResult,
  type ScreeningScope,
} from './screeningTypes';

export const screenFigureDocumentation = (
  figures: ScreeningFigure[],
  scope: ScreeningScope,
): ScreeningResult => {
  const images = figures.filter((figure) => figure.hasImage);

  if (images.length === 0) {
    return scope.isJudgeable
      ? notApplicable(
          'This manuscript carries no figure images, so there is no caption or alternative text to check.',
        )
      : absent(
          'No figures were screened. Expected wherever the paper shows an image.',
        );
  }

  const uncaptioned = images.filter((figure) => figure.caption.length === 0);
  if (uncaptioned.length > 0) {
    const [first] = uncaptioned;
    return figureOutcome({
      figure: first,
      verdict: 'ABSENT',
      detail:
        uncaptioned.length === 1
          ? `${first.label} has no caption.`
          : `${uncaptioned.length} figures have no caption, starting with ${first.label}.`,
    });
  }

  const withoutAltText = images.filter((figure) => figure.altText.length === 0);
  if (withoutAltText.length > 0) {
    const [first] = withoutAltText;
    return figureOutcome({
      figure: first,
      verdict: 'WEAK',
      detail:
        withoutAltText.length === 1
          ? `${first.label} is captioned but carries no alternative text. A caption tells the reader what the figure shows; alt text tells a reader who cannot see it.`
          : `${withoutAltText.length} figures are captioned but carry no alternative text, starting with ${first.label}.`,
      evidence: first.caption,
    });
  }

  const [first] = images;
  return figureOutcome({
    figure: first,
    verdict: 'PRESENT',
    detail:
      images.length === 1
        ? 'The figure image carries a caption and alternative text.'
        : `All ${images.length} figure images carry a caption and alternative text.`,
    evidence: first.caption,
  });
};
