// ── Blinding (SciScore) ────────────────────────────────────────────────────
//
// Was anyone kept from knowing which group a subject was in — and does the
// paper say who? "Double-blind" names two parties; "blinded" names none.

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

const BLINDING_MENTION =
  /\bblind(?:ed|ing)\b|\bdouble-?blind\b|\bsingle-?blind\b|\btriple-?blind\b|\bmasked\s+(?:to|from|assessment|investigators?)\b|\bmasking\b|\bopen-?label\b|\bunblinded\b/i;

const BLINDED_PARTY =
  /\b(?:investigators?|assessors?|outcome\s+assessors?|analysts?|statisticians?|experimenters?|observers?|raters?|researchers?|technicians?|pathologists?|radiologists?|participants?|patients?|subjects?|care\s?givers?|clinicians?)\b/i;

// Two or three blinded parties are named by the term itself, so the sentence
// does not have to list them.
const NAMES_ITS_PARTIES = /\b(?:double|triple)-?blind\w*\b/i;

// An open-label trial that says it is open-label has reported its blinding —
// the answer is "none", and the reader can act on it.
const DECLARED_UNBLINDED =
  /\bopen-?label\b|\bunblinded\b|\b(?:not|were\s+not|was\s+not)\s+blind(?:ed)?\b|\bno\s+blinding\b|\bwithout\s+blinding\b/i;

export const screenBlinding = (
  sections: ScreeningSection[],
  scope: ScreeningScope,
): ScreeningResult => {
  if (scope.isJudgeable && !scope.hasLivingSubjects) {
    return notApplicable(
      'No experiments on people or animals are described, so there is no group allocation anyone could be blinded to.',
    );
  }

  const match = strongestSentence(sections, (sentence) => {
    if (!BLINDING_MENTION.test(sentence)) return undefined;
    if (DECLARED_UNBLINDED.test(sentence)) {
      return {
        verdict: 'PRESENT',
        detail: 'The paper states that the study was not blinded.',
      };
    }
    if (NAMES_ITS_PARTIES.test(sentence) || BLINDED_PARTY.test(sentence)) {
      return {
        verdict: 'PRESENT',
        detail: 'Blinding is reported and the blinded party is named.',
      };
    }
    return {
      verdict: 'WEAK',
      detail:
        'Mentions blinding without saying who was blinded — the investigator, the assessor or whoever analysed the data.',
    };
  });

  return match === undefined
    ? absent(
        'No statement about blinding. Expected wherever an outcome is measured or judged by someone who knows the group allocation.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};
