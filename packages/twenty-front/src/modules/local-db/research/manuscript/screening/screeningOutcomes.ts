// How a matched sentence becomes a reportable outcome, and which of several
// matches a screener reports. Every screener ends in one of these, so they live
// beside the vocabulary rather than in any one screener.

import {
  type ScreeningDeclined,
  type ScreeningFigure,
  type ScreeningOutcome,
  type ScreeningPassage,
  type ScreeningResult,
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

// A finding that points at a figure instead of a section. The evidence is the
// caption where there is one, for the same reason a section finding quotes its
// sentence: the author judges the verdict rather than trusting it.
export const figureOutcome = ({
  figure,
  verdict,
  detail,
  evidence,
}: {
  figure: ScreeningFigure;
  verdict: ScreeningVerdict;
  detail: string;
  evidence?: string;
}): ScreeningOutcome => ({
  verdict,
  detail,
  evidence: evidence === undefined ? '' : truncateEvidence(evidence),
  figureId: figure.id,
  figureLabel: figure.label,
});

// The check has nothing to judge, because the manuscript is not about the
// material it scores. The reason is written for the author, not for a log.
export const notApplicable = (reason: string): ScreeningDeclined => ({
  applies: false,
  reason,
});

export const isDeclined = (
  result: ScreeningResult,
): result is ScreeningDeclined => 'applies' in result;

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
