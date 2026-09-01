// ── Randomisation of subjects (SciScore) ───────────────────────────────────
//
// Were the subjects assigned to their groups at random, and does the paper say
// so? A study that allocated on purpose and says which way it did is reporting
// its allocation; a study that says nothing is not.

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

const RANDOM_MENTION =
  /\brandomi[sz](?:ed|ation|ing)\b|\brandomly\b|\brandom\s+(?:allocation|assignment|sequence|number\s+generator)\b/i;

// Allocation, not sampling: a random field of view and a random seed are both
// "randomly" and neither of them assigns a subject to a group.
const RANDOM_ALLOCATION =
  /\brandomly\s+(?:assigned|allocated|divided|distributed|split|separated)\b|\brandomi[sz]ed\s+(?:to|into|in\s+a|by|using|\d\s*:\s*\d)\b|\ballocation\s+(?:sequence|concealment|ratio)\b|\b(?:block|stratified|permuted|simple|computer-generated|cluster)\s+randomi[sz]ation\b|\brandomi[sz]ation\s+(?:sequence|list|schedule|procedure|was\s+(?:performed|carried|done))\b|\brandom\s+number\s+generator\b|\bsealed\s+(?:opaque\s+)?envelopes?\b/i;

// Saying the allocation was not random is still reporting the allocation, and
// it is the honest thing an observational study writes.
const DECLARED_NON_RANDOM =
  /\b(?:not\s+randomi[sz]ed|non-?randomi[sz]ed|without\s+randomi[sz]ation|no\s+randomi[sz]ation\s+(?:was|were)\b)/i;

export const screenRandomisation = (
  sections: ScreeningSection[],
  scope: ScreeningScope,
): ScreeningResult => {
  if (scope.isJudgeable && !scope.hasLivingSubjects) {
    return notApplicable(
      'No experiments on people or animals are described, so there are no subjects to allocate at random.',
    );
  }

  const match = strongestSentence(sections, (sentence) => {
    if (DECLARED_NON_RANDOM.test(sentence)) {
      return {
        verdict: 'PRESENT',
        detail: 'The paper states that subjects were not randomised.',
      };
    }
    if (RANDOM_ALLOCATION.test(sentence)) {
      return {
        verdict: 'PRESENT',
        detail: 'Subjects are reported as assigned to groups at random.',
      };
    }
    return RANDOM_MENTION.test(sentence)
      ? {
          verdict: 'WEAK',
          detail:
            'Calls the study randomised without saying what was assigned at random, or how.',
        }
      : undefined;
  });

  return match === undefined
    ? absent(
        'No statement about how subjects were assigned to groups. Expected wherever subjects are compared between groups.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};
