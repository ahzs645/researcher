// ── Open code (ODDPub) ─────────────────────────────────────────────────────
//
// Does the paper say where its analysis code is? Plain regexes beat the working
// group's machine-learning detector at exactly this question.

import {
  CODE_SUBJECT,
  classifyAvailability,
  isOtherWork,
} from './availabilityCues';
import { absent, passageOutcome, strongestSentence } from './screeningOutcomes';
import { type ScreeningOutcome, type ScreeningSection } from './screeningTypes';

const CODE_REPOSITORY_NAME =
  /\b(github|gitlab|bitbucket|zenodo|code ?ocean|software ?heritage|open science framework|osf\.io|cran|bioconductor|pypi|sourceforge|codeberg)\b/i;

const PROGRAMMING_LANGUAGE =
  /\b(R|Python|MATLAB|Julia|Stata|SAS|SPSS|Fortran|C\+\+|Perl|Jupyter)\b/;

export const screenOpenCode = (
  sections: ScreeningSection[],
): ScreeningOutcome => {
  const match = strongestSentence(sections, (sentence, section) => {
    if (isOtherWork(sentence, section)) return undefined;
    return classifyAvailability({
      sentence,
      // A language or package name plus a location is the other shape an open
      // code statement takes ("all Python analyses are archived at …").
      hasSubject:
        CODE_SUBJECT.test(sentence) || PROGRAMMING_LANGUAGE.test(sentence),
      repositoryName: CODE_REPOSITORY_NAME,
      subjectLabel: 'code',
    });
  });

  if (match !== undefined) {
    return passageOutcome(match, match.verdict, match.detail);
  }
  return absent(
    'No sentence says where the analysis code is. A GitHub, GitLab, Zenodo, OSF, or Software Heritage location is what screening looks for.',
  );
};
