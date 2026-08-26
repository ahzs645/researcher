// ── Open data (ODDPub) ─────────────────────────────────────────────────────
//
// Does the paper say where its data are? A repository, an accession number or a
// DOI answers it; an offer to send them on request does not.

import {
  CODE_SUBJECT,
  classifyAvailability,
  isOtherWork,
} from './availabilityCues';
import { absent, passageOutcome, strongestSentence } from './screeningOutcomes';
import { type ScreeningOutcome, type ScreeningSection } from './screeningTypes';

const DATA_REPOSITORY_NAME =
  /\b(zenodo|figshare|dryad|open science framework|osf\.io|dataverse|mendeley data|pangaea|icpsr|gene expression omnibus|arrayexpress|sequence read archive|dbgap|bioproject|european nucleotide archive|proteomexchange|metabolights|physionet|openneuro|uk data service|geo|sra|ena|pride|genbank)\b/i;

const DATA_SUBJECT =
  /\b(data|datasets?|data\s?sets?|datafiles?|raw\s+data|source\s+data|underlying\s+data)\b/i;

const declaresDataAvailability = (section: ScreeningSection): boolean =>
  section.sectionType === 'DATA_AVAILABILITY' || /\bdata\b/i.test(section.name);

export const screenOpenData = (
  sections: ScreeningSection[],
): ScreeningOutcome => {
  const match = strongestSentence(sections, (sentence, section) => {
    if (isOtherWork(sentence, section)) return undefined;
    // Inside a section whose heading already says "data", a sentence that
    // names only code is the code statement, not the data one — which is
    // exactly how a "Code and data availability" section hides a missing half.
    const subjectFromHeading =
      section.isStatement &&
      declaresDataAvailability(section) &&
      !CODE_SUBJECT.test(sentence);
    return classifyAvailability({
      sentence,
      hasSubject: DATA_SUBJECT.test(sentence) || subjectFromHeading,
      repositoryName: DATA_REPOSITORY_NAME,
      subjectLabel: 'data',
    });
  });

  if (match !== undefined) {
    return passageOutcome(match, match.verdict, match.detail);
  }

  const headingOnly = sections.find(
    (section) => section.isStatement && declaresDataAvailability(section),
  );
  if (headingOnly !== undefined) {
    return absent(
      `“${headingOnly.name}” is present but no sentence in it names a repository, accession number, or DOI for the data.`,
    );
  }
  return absent(
    'No sentence says where the data are. A repository, accession number, or DOI is what screening looks for.',
  );
};
