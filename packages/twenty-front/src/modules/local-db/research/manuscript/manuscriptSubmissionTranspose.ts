import { type ImportedSectionDraft } from './manuscriptDocImport';
import {
  parseManuscriptSubmissionExtras,
  serializeManuscriptSubmissionExtras,
  submissionJournalKey,
  type SubmissionRequirementTemplate,
} from './manuscriptSubmissionRequirements';

const REQUIREMENT_KEY_BY_SECTION_TYPE: Record<string, string> = {
  FUNDING: 'FUNDING',
  DATA_AVAILABILITY: 'DATA_AVAILABILITY',
  ETHICS: 'ETHICS_APPROVAL',
  AUTHOR_CONTRIBUTIONS: 'AUTHOR_CONTRIBUTIONS',
};

export type SubmissionTransposeManuscript = {
  competingInterests?: string | null;
  submissionExtras?: string | null;
};

export type SubmissionTransposeUpdate = {
  competingInterests?: string;
  submissionExtras?: string;
};

export const hasTransposableSubmissionDeclarations = (
  sections: ImportedSectionDraft[],
): boolean =>
  sections.some(
    (section) =>
      section.content.trim().length > 0 &&
      (section.sectionType === 'CONFLICTS' ||
        REQUIREMENT_KEY_BY_SECTION_TYPE[section.sectionType] !== undefined),
  );

export const buildSubmissionTransposeUpdate = ({
  sections,
  template,
  manuscript,
}: {
  sections: ImportedSectionDraft[];
  template: SubmissionRequirementTemplate;
  manuscript: SubmissionTransposeManuscript;
}): SubmissionTransposeUpdate => {
  const update: SubmissionTransposeUpdate = {};
  const extras = parseManuscriptSubmissionExtras(manuscript.submissionExtras);
  const journalKey = submissionJournalKey(template);
  const journalValues = { ...(extras[journalKey] ?? {}) };
  let extrasChanged = false;

  for (const section of sections) {
    const content = section.content.trim();
    if (content.length === 0 || section.sectionType === 'ACKNOWLEDGMENTS') {
      continue;
    }
    if (section.sectionType === 'CONFLICTS') {
      if ((manuscript.competingInterests ?? '').trim().length === 0) {
        update.competingInterests = content;
      }
      continue;
    }
    const requirementKey = REQUIREMENT_KEY_BY_SECTION_TYPE[section.sectionType];
    if (
      requirementKey !== undefined &&
      (journalValues[requirementKey] ?? '').trim().length === 0
    ) {
      journalValues[requirementKey] = content;
      extrasChanged = true;
    }
  }

  if (extrasChanged) {
    extras[journalKey] = journalValues;
    update.submissionExtras = serializeManuscriptSubmissionExtras(extras);
  }

  return update;
};
