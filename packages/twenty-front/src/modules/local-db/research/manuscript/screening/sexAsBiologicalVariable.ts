// ── Sex as a biological variable (SciScore) ────────────────────────────────
//
// Is the sex of the subjects reported, and is it treated as a variable rather
// than a footnote? A single-sex study is not wrong — it is under-reported when
// it never says why only one sex was used.

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

const SEX_MENTION =
  /\bsexe?s?\b|\bgenders?\b|\bmales?\b|\bfemales?\b|\b(?:wo)?men\b|\bboys?\b|\bgirls?\b/i;

const BOTH_SEXES =
  /\b(?:males?\s+and\s+females?|females?\s+and\s+males?|men\s+and\s+women|women\s+and\s+men|boys\s+and\s+girls|both\s+sexes|(?:either|both)\s+sex(?:es)?)\b/i;

const SEX_AS_VARIABLE =
  /\bsex\s+(?:was|were)\s+(?:included|considered|used|treated|analy[sz]ed)\b|\b(?:adjusted|controlled|stratified|matched|balanced|disaggregated)\s+(?:for|by)\s+(?:age\s+and\s+)?(?:sex|gender)\b|\bsex[-\s]?(?:specific|stratified|difference|differences|as\s+a\s+biological\s+variable)\b|\bsex\s+and\s+gender\b/i;

// A count or a proportion is the composition reported plainly.
const SEX_COMPOSITION =
  /\b\d+\s+(?:males?|females?|men|women|boys|girls)\b|\b(?:males?|females?|men|women)\s*[:(]\s*\d|\b\d+(?:\.\d+)?\s*%\s*(?:males?|females?|women|men)\b|\b(?:males?|females?)\s*[,;]?\s*n\s*=\s*\d+/i;

// A strain name usually sits between the sex and the animal — "male C57BL/6
// mice", "female Sprague-Dawley rats" — so a couple of words are allowed to
// come between them.
const SINGLE_SEX =
  /\b(?:only\s+)?(?:male|female)\s+(?:[A-Za-z0-9/-]+\s+){0,2}(?:mice|rats?|rodents?|animals?|participants?|patients?|subjects?|volunteers?|donors?|pups?)\b|\b(?:mice|rats?|animals?|participants?|patients?)\s+of\s+(?:one|a\s+single)\s+sex\b/i;

export const screenSexAsBiologicalVariable = (
  sections: ScreeningSection[],
  scope: ScreeningScope,
): ScreeningResult => {
  if (scope.isJudgeable && !scope.hasLivingSubjects) {
    return notApplicable(
      'No experiments on people or animals are described, so no subject has a sex to report.',
    );
  }

  const match = strongestSentence(sections, (sentence) => {
    if (BOTH_SEXES.test(sentence) || SEX_COMPOSITION.test(sentence)) {
      return {
        verdict: 'PRESENT',
        detail: 'The sex composition of the subjects is reported.',
      };
    }
    if (SEX_AS_VARIABLE.test(sentence)) {
      return {
        verdict: 'PRESENT',
        detail: 'Sex is carried into the analysis as a variable.',
      };
    }
    if (SINGLE_SEX.test(sentence)) {
      return {
        verdict: 'WEAK',
        detail:
          'Only one sex was studied, and the paper does not say why. Sex as a biological variable asks for the reason, not just the fact.',
      };
    }
    return SEX_MENTION.test(sentence)
      ? {
          verdict: 'WEAK',
          detail:
            'Mentions sex or gender without reporting the composition of the sample.',
        }
      : undefined;
  });

  return match === undefined
    ? absent(
        'The sex of the subjects is never reported. Expected wherever people or animals are studied.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};
