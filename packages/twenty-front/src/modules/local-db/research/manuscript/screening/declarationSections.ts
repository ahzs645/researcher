// ── Declarations: the shared half (rtransparent) ───────────────────────────
//
// Competing interests and funding are both read the same way: find the section
// the journal expects, then decide whether anything was actually written in it.
// Only the wording of the verdict differs, so the reading lives here once.

import { passageOutcome, truncateEvidence } from './screeningOutcomes';
import { type ScreeningOutcome, type ScreeningSection } from './screeningTypes';

// "TBD" in a heading is the same absence as an empty section, and worse:
// it survives to submission looking filled in.
export const PLACEHOLDER_STATEMENT =
  /^(?:tbd|tba|todo|n\/?a|xx+|\.{2,}|to\s+be\s+(?:added|written|completed|determined|confirmed)|\[[^\]]*\]|<[^>]*>)\.?$/i;

export const declarationOutcome = ({
  section,
  detail,
  emptyDetail,
}: {
  section: ScreeningSection;
  detail: string;
  emptyDetail: string;
}): ScreeningOutcome => {
  const firstSentence = section.sentences[0];
  if (firstSentence === undefined || PLACEHOLDER_STATEMENT.test(section.text)) {
    return {
      verdict: 'WEAK',
      detail: emptyDetail,
      evidence: truncateEvidence(section.text),
      sectionId: section.id,
      sectionName: section.name,
    };
  }
  return passageOutcome(
    { section, sentence: firstSentence },
    'PRESENT',
    detail,
  );
};
