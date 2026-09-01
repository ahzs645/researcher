// ── Cell line authentication (SciScore) ────────────────────────────────────
//
// Was the line the experiment used shown to be the line it is named after?
// Naming the vendor is provenance, not authentication: a misidentified line
// can be bought from a repository and passaged for years.

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

const AUTHENTICATED =
  /\bauthenticat\w+\b|\bSTR\s+(?:profil\w+|analysis|typing|fingerprint\w*)\b|\bshort\s+tandem\s+repeat\b|\b(?:cell\s+lines?|cell\s+identity|identity\s+of\s+the\s+(?:cell\s+)?lines?)\s+(?:was|were)\s+(?:verified|confirmed|validated|checked)\b|\bkaryotyp\w+\b|\bDNA\s+fingerprint\w*\b/i;

const SOURCED =
  /\b(?:obtained|purchased|acquired|received|sourced|gifted|provided)\s+from\b|\bATCC\b|\bDSMZ\b|\bECACC\b|\bJCRB\b|\bcatalog(?:ue)?\s*(?:no\.?|number|#)|\bcat\.?\s*(?:no\.?|#)/i;

export const screenCellLineAuthentication = (
  sections: ScreeningSection[],
  scope: ScreeningScope,
): ScreeningResult => {
  if (scope.isJudgeable && !scope.hasCellCulture) {
    return notApplicable(
      'No cultured cells are described, so there is no cell line to authenticate.',
    );
  }

  const match = strongestSentence(sections, (sentence) => {
    if (AUTHENTICATED.test(sentence)) {
      return {
        verdict: 'PRESENT',
        detail: 'The cell line is reported as authenticated.',
      };
    }
    return SOURCED.test(sentence)
      ? {
          verdict: 'WEAK',
          detail:
            'Names where the line came from but never says it was authenticated — provenance is not identity.',
        }
      : undefined;
  });

  return match === undefined
    ? absent(
        'No cell line authentication statement. Expected wherever a named cell line is used.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};
