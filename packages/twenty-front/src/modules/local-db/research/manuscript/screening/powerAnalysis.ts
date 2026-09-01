// ── Power analysis (SciScore) ──────────────────────────────────────────────
//
// Is the group size justified, or merely stated? A number without a
// calculation behind it is the commonest way an underpowered study looks
// finished.

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

const POWER_MENTION =
  /\bpower\s+(?:analysis|calculation|computation)\b|\bsample\s+size\s+(?:calculation|determination|estimation|justification|was\s+(?:calculated|determined|estimated|chosen|based|selected))\b|\bpowered\s+to\s+detect\b|\bstatistical(?:ly)?\s+power(?:ed)?\b|\bG\s?\*?\s?Power\b|\ba\s+priori\s+power\b|\bno\s+(?:formal\s+)?(?:power|sample\s+size)\s+(?:analysis|calculation)\b/i;

// The numbers that make a power statement checkable: the power itself, the
// significance level, or a named effect size.
const POWER_QUANTIFIED =
  /\b(?:[5-9]\d)\s*%\s*power\b|\bpower\s*(?:of|=|:)\s*(?:0?\.\d+|\d{2}\s*%)|\b(?:alpha|α)\s*(?:=|of)\s*0?\.\d+|\beffect\s+size\b|\bCohen'?s\s+d\b|\bbeta\s*=\s*0?\.\d+|\bdetect\s+a\s+(?:\d|difference\s+of)/i;

const SIZE_WITHOUT_CALCULATION =
  /\bsample\s+size\s+(?:was|were)\s+(?:based\s+on|informed\s+by|chosen\s+(?:from|following)|similar\s+to)\b|\bbased\s+on\s+(?:previous|prior|earlier|pilot)\s+(?:studies|work|experiments?|data)\b|\bno\s+(?:formal\s+)?(?:power|sample\s+size)\s+(?:analysis|calculation)\b/i;

export const screenPowerAnalysis = (
  sections: ScreeningSection[],
  scope: ScreeningScope,
): ScreeningResult => {
  if (scope.isJudgeable && !scope.hasLivingSubjects) {
    return notApplicable(
      'No experiments on people or animals are described, so there is no group size to justify.',
    );
  }

  const match = strongestSentence(sections, (sentence) => {
    if (!POWER_MENTION.test(sentence)) return undefined;
    if (SIZE_WITHOUT_CALCULATION.test(sentence)) {
      return {
        verdict: 'WEAK',
        detail:
          'The group size is explained but not calculated — no power, significance level or effect size is given.',
      };
    }
    return POWER_QUANTIFIED.test(sentence)
      ? {
          verdict: 'PRESENT',
          detail:
            'A power calculation is reported with the numbers that make it checkable.',
        }
      : {
          verdict: 'WEAK',
          detail:
            'Mentions statistical power without the target power, significance level or effect size it was computed from.',
        };
  });

  return match === undefined
    ? absent(
        'No power analysis and no other justification of the group size. Expected wherever groups of subjects are compared.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};
