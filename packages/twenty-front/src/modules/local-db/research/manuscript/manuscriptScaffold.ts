// Journal-driven section scaffolding. Given a manuscript type and (optionally) a
// journal template, produce the ordered section skeleton authors expect — IMRaD
// for a paper, a chapter outline for a thesis — with the abstract's word limit
// pre-filled from the template so the limit is enforced from the first keystroke
// rather than discovered at submission.

import {
  normalizeSectionName,
  SINGLETON_SECTION_TYPES,
} from './manuscriptSectionDedupe';
import { type JournalStyle, type SectionLike } from './manuscriptTypes';

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
  // Per-entry limit; the abstract falls back to the template's when unset.
  wordLimit?: number;
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

const SKELETON_SECTION_TYPES = new Set([
  'TITLE_PAGE',
  'ABSTRACT',
  'KEYWORDS',
  'INTRODUCTION',
  'BACKGROUND',
  'METHODS',
  'RESULTS',
  'DISCUSSION',
  'CONCLUSION',
  'ACKNOWLEDGMENTS',
  'AUTHOR_CONTRIBUTIONS',
  'FUNDING',
  'CONFLICTS',
  'DATA_AVAILABILITY',
  'ETHICS',
  'REFERENCES',
  'APPENDIX',
  'SUPPLEMENT',
  'OTHER',
]);

const SKELETON_PLACEMENTS = new Set([
  'FRONT_MATTER',
  'MAIN',
  'BACK_MATTER',
  'SUPPLEMENT',
]);

// A journal template can carry its own section skeleton as JSON on the
// `sectionSkeleton` field: [{ name, sectionType, placement, wordLimit? }].
// That is how house styles that merge or drop IMRaD parts (a combined
// "Results and discussion", no Conclusion) express themselves.
export const parseJournalSectionSkeleton = (
  value: unknown,
): SkeletonEntry[] | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const entries: SkeletonEntry[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.name !== 'string' ||
      candidate.name.trim().length === 0 ||
      typeof candidate.sectionType !== 'string' ||
      !SKELETON_SECTION_TYPES.has(candidate.sectionType) ||
      typeof candidate.placement !== 'string' ||
      !SKELETON_PLACEMENTS.has(candidate.placement) ||
      (candidate.wordLimit !== undefined &&
        (typeof candidate.wordLimit !== 'number' ||
          !Number.isFinite(candidate.wordLimit) ||
          candidate.wordLimit <= 0)) ||
      (candidate.abstractLimit !== undefined &&
        typeof candidate.abstractLimit !== 'boolean')
    ) {
      return null;
    }
    entries.push({
      name: candidate.name.trim(),
      sectionType: candidate.sectionType,
      placement: candidate.placement,
      ...(typeof candidate.wordLimit === 'number'
        ? { wordLimit: Math.trunc(candidate.wordLimit) }
        : {}),
      ...(candidate.abstractLimit === true ? { abstractLimit: true } : {}),
    });
  }
  return entries.length > 0 ? entries : null;
};

export const buildSectionSkeleton = (
  manuscriptType: string | null | undefined,
  style?: JournalStyle | null,
): ScaffoldSectionDraft[] => {
  const journalSkeleton = parseJournalSectionSkeleton(style?.sectionSkeleton);
  const skeleton =
    journalSkeleton ??
    SKELETON_BY_TYPE[manuscriptType ?? 'JOURNAL_PAPER'] ??
    IMRAD;
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
    ...(entry.abstractLimit === true || entry.sectionType === 'ABSTRACT'
      ? { wordLimit: entry.wordLimit ?? abstractLimit }
      : entry.wordLimit !== undefined
        ? { wordLimit: entry.wordLimit }
        : {}),
  }));
};

// Which skeleton sections the manuscript still needs. A section counts as
// present when its singleton type (References, Funding…) already exists, or
// when a same-named section does — re-running scaffold appends only the gaps
// instead of duplicating what the author already has.
export const missingScaffoldSections = (
  skeleton: ScaffoldSectionDraft[],
  existingSections: SectionLike[],
): ScaffoldSectionDraft[] => {
  const presentSingletonTypes = new Set(
    existingSections
      .map((section) => section.sectionType?.trim().toLocaleUpperCase())
      .filter(
        (sectionType): sectionType is string =>
          sectionType !== undefined && SINGLETON_SECTION_TYPES.has(sectionType),
      ),
  );
  const presentNames = new Set(
    existingSections.map((section) => normalizeSectionName(section.name)),
  );
  return skeleton.filter((draft) => {
    if (
      SINGLETON_SECTION_TYPES.has(draft.sectionType) &&
      presentSingletonTypes.has(draft.sectionType)
    ) {
      return false;
    }
    return !presentNames.has(normalizeSectionName(draft.name));
  });
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
