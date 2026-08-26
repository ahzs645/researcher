// ── Mycoplasma contamination check (SciScore) ──────────────────────────────
//
// Were the cultures tested for mycoplasma, and what did the test say? The
// contamination is invisible down a microscope and changes what the cells do,
// so "we tested" without a result is only half a statement.

import {
  absent,
  notApplicable,
  passageOutcome,
  strongestSentence,
} from './screeningOutcomes';
import {
  type ScreeningResult,
  type ScreeningScope,
  type ScreeningSection,
} from './screeningTypes';

const MYCOPLASMA = /\bmycoplasma\b/i;

const TESTED_CLEAN =
  /\bmycoplasma[-\s]?free\b|\bfree\s+of\s+mycoplasma\b|\bnegative\s+for\s+mycoplasma\b|\bmycoplasma[^.]{0,60}\b(?:negative|free|not\s+detected|no\s+contamination|clear)\b|\b(?:tested|screened|checked|assayed)[^.]{0,40}\bmycoplasma\b[^.]{0,60}\b(?:negative|free|not\s+detected)\b/i;

const TESTED_ROUTINELY =
  /\b(?:routinely|regularly|monthly|periodically)\s+(?:tested|screened|checked)[^.]{0,40}\bmycoplasma\b|\bmycoplasma\b[^.]{0,40}\b(?:tested|screened|checked)\s+(?:routinely|regularly|monthly|periodically)\b/i;

export const screenMycoplasmaTesting = (
  sections: ScreeningSection[],
  scope: ScreeningScope,
): ScreeningResult => {
  if (scope.isJudgeable && !scope.hasCellCulture) {
    return notApplicable(
      'No cultured cells are described, so there is nothing to test for mycoplasma.',
    );
  }

  const match = strongestSentence(sections, (sentence) => {
    if (!MYCOPLASMA.test(sentence)) return undefined;
    if (TESTED_CLEAN.test(sentence) || TESTED_ROUTINELY.test(sentence)) {
      return {
        verdict: 'PRESENT',
        detail: 'The cultures are reported as tested for mycoplasma.',
      };
    }
    return {
      verdict: 'WEAK',
      detail:
        'Mentions mycoplasma without saying the cultures were tested or what the test found.',
    };
  });

  return match === undefined
    ? absent(
        'No mycoplasma testing statement. Expected wherever cells are cultured.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};
