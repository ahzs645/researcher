// ── Limitations (limitation-recognizer) ────────────────────────────────────
//
// Does any section state the study's own limitations?

import { absent, passageOutcome, strongestSentence } from './screeningOutcomes';
import { type ScreeningOutcome, type ScreeningSection } from './screeningTypes';

const LIMITATIONS_HEADING = /\blimitations?\b/i;

// Ownership is the whole test: "this study has several limitations" is a
// limitations statement, "a known limitation of thermal-optical protocols" is
// a remark about a method the field already knows about.
const OWNED_LIMITATION =
  /\b(?:this|our|the\s+(?:present|current))\s+(?:study|work|analysis|paper|approach|framework|method|case\s+study|investigation)\s+(?:has|had|have|is\s+not\s+without|suffers)\b[^.]{0,80}\blimitation/i;

const LIMITATION_STATEMENT =
  /\b(?:several|some|a\s+number\s+of|important|key|potential|main|principal|two|three|four)\s+limitations?\b|\blimitations?\s+of\s+(?:this|our|the\s+(?:present|current))\s+(?:study|work|analysis|paper)\b|\b(?:this|our|the\s+(?:present|current))\s+(?:study|work|analysis|case\s+study|approach)\s+(?:is|was|are|were)\s+limited\s+by\b|\bwe\s+acknowledge\s+(?:that|several|some)?[^.]{0,40}\blimitation/i;

export const screenLimitations = (
  sections: ScreeningSection[],
): ScreeningOutcome => {
  const headingSection = sections.find((section) =>
    LIMITATIONS_HEADING.test(section.name),
  );
  if (headingSection !== undefined) {
    const firstSentence = headingSection.sentences[0];
    if (firstSentence === undefined) {
      return {
        verdict: 'WEAK',
        detail: `“${headingSection.name}” has a heading but no text under it.`,
        evidence: '',
        sectionId: headingSection.id,
        sectionName: headingSection.name,
      };
    }
    return passageOutcome(
      { section: headingSection, sentence: firstSentence },
      'PRESENT',
      'A dedicated limitations section states them.',
    );
  }

  const match = strongestSentence(sections, (sentence) =>
    OWNED_LIMITATION.test(sentence) || LIMITATION_STATEMENT.test(sentence)
      ? {
          verdict: 'PRESENT',
          detail:
            'An explicit limitations sentence, outside a dedicated section.',
        }
      : undefined,
  );

  return match === undefined
    ? absent(
        'No limitations section and no sentence claiming the study’s own limitations. A passing mention of a method’s limitation does not count.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};
