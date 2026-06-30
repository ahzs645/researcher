// Journal-driven section scaffolding. Given a manuscript type and (optionally) a
// journal template, produce the ordered section skeleton authors expect — IMRaD
// for a paper, a chapter outline for a thesis — with the abstract's word limit
// pre-filled from the template so the limit is enforced from the first keystroke
// rather than discovered at submission.

import { type JournalStyle } from './manuscriptTypes';

export type ScaffoldSectionDraft = {
  name: string;
  sectionType: string;
  placement: string;
  orderIndex: number;
  wordLimit?: number;
  includeInExport: boolean;
};

type SkeletonEntry = {
  name: string;
  sectionType: string;
  placement: string;
  // When true, the journal template's abstractWordLimit is applied.
  abstractLimit?: boolean;
};

// Shared back matter appended to every paper-shaped skeleton, in journal order.
const PAPER_BACK_MATTER: SkeletonEntry[] = [
  { name: 'Acknowledgements', sectionType: 'ACKNOWLEDGMENTS', placement: 'BACK_MATTER' },
  { name: 'Author contributions', sectionType: 'AUTHOR_CONTRIBUTIONS', placement: 'BACK_MATTER' },
  { name: 'Funding', sectionType: 'FUNDING', placement: 'BACK_MATTER' },
  { name: 'Conflicts of interest', sectionType: 'CONFLICTS', placement: 'BACK_MATTER' },
  { name: 'Data availability', sectionType: 'DATA_AVAILABILITY', placement: 'BACK_MATTER' },
  { name: 'References', sectionType: 'REFERENCES', placement: 'BACK_MATTER' },
];

const IMRAD: SkeletonEntry[] = [
  { name: 'Title page', sectionType: 'TITLE_PAGE', placement: 'FRONT_MATTER' },
  { name: 'Abstract', sectionType: 'ABSTRACT', placement: 'FRONT_MATTER', abstractLimit: true },
  { name: 'Keywords', sectionType: 'KEYWORDS', placement: 'FRONT_MATTER' },
  { name: 'Introduction', sectionType: 'INTRODUCTION', placement: 'MAIN' },
  { name: 'Methods', sectionType: 'METHODS', placement: 'MAIN' },
  { name: 'Results', sectionType: 'RESULTS', placement: 'MAIN' },
  { name: 'Discussion', sectionType: 'DISCUSSION', placement: 'MAIN' },
  { name: 'Conclusion', sectionType: 'CONCLUSION', placement: 'MAIN' },
  ...PAPER_BACK_MATTER,
];

const THESIS: SkeletonEntry[] = [
  { name: 'Abstract', sectionType: 'ABSTRACT', placement: 'FRONT_MATTER', abstractLimit: true },
  { name: 'Acknowledgements', sectionType: 'ACKNOWLEDGMENTS', placement: 'FRONT_MATTER' },
  { name: 'Introduction', sectionType: 'INTRODUCTION', placement: 'MAIN' },
  { name: 'Literature review', sectionType: 'BACKGROUND', placement: 'MAIN' },
  { name: 'Methods', sectionType: 'METHODS', placement: 'MAIN' },
  { name: 'Results', sectionType: 'RESULTS', placement: 'MAIN' },
  { name: 'Discussion', sectionType: 'DISCUSSION', placement: 'MAIN' },
  { name: 'Conclusion', sectionType: 'CONCLUSION', placement: 'MAIN' },
  { name: 'References', sectionType: 'REFERENCES', placement: 'BACK_MATTER' },
  { name: 'Appendices', sectionType: 'APPENDIX', placement: 'SUPPLEMENT' },
];

const CHAPTER: SkeletonEntry[] = [
  { name: 'Abstract', sectionType: 'ABSTRACT', placement: 'FRONT_MATTER', abstractLimit: true },
  { name: 'Introduction', sectionType: 'INTRODUCTION', placement: 'MAIN' },
  { name: 'Body', sectionType: 'OTHER', placement: 'MAIN' },
  { name: 'Conclusion', sectionType: 'CONCLUSION', placement: 'MAIN' },
  { name: 'References', sectionType: 'REFERENCES', placement: 'BACK_MATTER' },
];

const SKELETON_BY_TYPE: Record<string, SkeletonEntry[]> = {
  JOURNAL_PAPER: IMRAD,
  CONFERENCE_PAPER: IMRAD,
  PREPRINT: IMRAD,
  THESIS,
  CHAPTER,
};

// Default abstract limits per citation/house style when the template omits one.
const DEFAULT_ABSTRACT_LIMIT = 250;

export const buildSectionSkeleton = (
  manuscriptType: string | null | undefined,
  style?: JournalStyle | null,
): ScaffoldSectionDraft[] => {
  const skeleton = SKELETON_BY_TYPE[manuscriptType ?? 'JOURNAL_PAPER'] ?? IMRAD;
  const abstractLimit =
    style?.abstractWordLimit && style.abstractWordLimit > 0
      ? style.abstractWordLimit
      : DEFAULT_ABSTRACT_LIMIT;

  return skeleton.map((entry, index) => ({
    name: entry.name,
    sectionType: entry.sectionType,
    placement: entry.placement,
    orderIndex: index,
    includeInExport: true,
    ...(entry.abstractLimit ? { wordLimit: abstractLimit } : {}),
  }));
};

export type WordLimitStatus = {
  wordCount: number;
  wordLimit: number | null;
  over: boolean;
  remaining: number | null;
};

// Word-limit accounting for the editor: how a section stands against its limit,
// so the composer can warn the moment the abstract runs long.
export const wordLimitStatus = (
  wordCount: number | null | undefined,
  wordLimit: number | null | undefined,
): WordLimitStatus => {
  const count = wordCount ?? 0;
  const limit = wordLimit && wordLimit > 0 ? wordLimit : null;
  return {
    wordCount: count,
    wordLimit: limit,
    over: limit !== null && count > limit,
    remaining: limit === null ? null : limit - count,
  };
};
