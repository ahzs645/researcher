// ── Competing interests (rtransparent) ─────────────────────────────────────
//
// Is there a competing-interests declaration that says something?

import {
  declarationOutcome,
  PLACEHOLDER_STATEMENT,
} from './declarationSections';
import { absent, truncateEvidence } from './screeningOutcomes';
import {
  type ScreeningManuscript,
  type ScreeningOutcome,
  type ScreeningSection,
} from './screeningTypes';

const COMPETING_INTERESTS_SECTION =
  /competing\s+interests?|conflicts?\s+of\s+interest|declaration\s+of\s+(?:competing|interest)|disclosures?/i;

export const screenCompetingInterests = (
  sections: ScreeningSection[],
  manuscript: ScreeningManuscript,
): ScreeningOutcome => {
  const section = sections.find(
    (candidate) =>
      candidate.sectionType === 'CONFLICTS' ||
      COMPETING_INTERESTS_SECTION.test(candidate.name),
  );
  if (section !== undefined) {
    return declarationOutcome({
      section,
      detail: 'A competing-interests declaration is present.',
      emptyDetail:
        'The competing-interests section carries no declaration. “The authors declare no competing interests.” is a statement; an empty heading is not.',
    });
  }

  // The declaration often lives only in the submission checklist, never having
  // been written into a section. It still counts as declared.
  const submissionValue = (manuscript.competingInterests ?? '').trim();
  if (
    submissionValue.length > 0 &&
    !PLACEHOLDER_STATEMENT.test(submissionValue)
  ) {
    return {
      verdict: 'PRESENT',
      detail:
        'Declared on the submission form. It is not in the manuscript text, so a reader of the paper will not see it.',
      evidence: truncateEvidence(submissionValue),
      sectionName: 'Submission checklist',
    };
  }

  return absent(
    'No competing-interests declaration. Journals treat silence as undeclared, not as none.',
  );
};
