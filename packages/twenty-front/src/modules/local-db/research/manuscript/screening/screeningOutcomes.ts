// How a matched sentence becomes a reportable outcome, and which of several
// matches a screener reports. Every screener ends in one of these, so they live
// beside the vocabulary rather than in any one screener.

import {
  type ScreeningOutcome,
  type ScreeningPassage,
  type ScreeningSection,
  type ScreeningVerdict,
  type SentenceClassification,
} from './screeningTypes';

const EVIDENCE_LIMIT = 240;

export const truncateEvidence = (sentence: string): string => {
  const trimmed = sentence.replace(/\s+/g, ' ').trim();
  return trimmed.length <= EVIDENCE_LIMIT
    ? trimmed
    : `${trimmed.slice(0, EVIDENCE_LIMIT).trimEnd()}…`;
};

export const passageOutcome = (
  passage: ScreeningPassage,
  verdict: ScreeningVerdict,
  detail: string,
  identifiers?: string[],
): ScreeningOutcome => ({
  verdict,
  detail,
  evidence: truncateEvidence(passage.sentence),
  sectionId: passage.section.id,
  sectionName: passage.section.name,
  ...(identifiers === undefined ? {} : { identifiers }),
});

export const absent = (detail: string): ScreeningOutcome => ({
  verdict: 'ABSENT',
  detail,
  evidence: '',
});

// A present statement anywhere outranks a weak one anywhere: an author who
// deposited the data and also offered them on request has a data statement.
export const strongestSentence = (
  sections: ScreeningSection[],
  classify: (
    sentence: string,
    section: ScreeningSection,
  ) => SentenceClassification | undefined,
): (ScreeningPassage & SentenceClassification) | undefined => {
  let weakest: (ScreeningPassage & SentenceClassification) | undefined;

  for (const section of sections) {
    for (const sentence of section.sentences) {
      const classification = classify(sentence, section);
      if (classification === undefined) continue;
      if (classification.verdict === 'PRESENT') {
        return { section, sentence, ...classification };
      }
      if (weakest === undefined)
        weakest = { section, sentence, ...classification };
    }
  }

  return weakest;
};
