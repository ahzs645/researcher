// A MyST template, read as a journal profile.
//
// MyST's registry is 25 templates reaching 471 journals: the number people
// quote is not one repository per journal but one per *family*, each with a
// required journal choice — `mdpi` alone offers 355 journals, `egu_copernicus`
// 45, `agu2019` 21. That is the shape worth copying, and the descriptors are
// public JSON.
//
// What crosses over is what a journal *asks for*: `parts` are the sections it
// requires, `doc` is the front matter it requires, and each carries the
// journal's own wording ("this section is mandatory even if you declare that
// no competing interests are present"). That becomes a submission checklist
// and a section skeleton.
//
// What does not cross over is typesetting. A MyST template ships a LaTeX or
// Typst file rendered by jtex, and this app writes its own preamble. Importing
// a template gives you the journal's requirements and structure, not its page
// layout, and the profile says so rather than implying a fidelity it has not
// got.

import { type PortableJournalProfile } from './manuscriptJournalProfile';

export type MystTemplateOption = {
  id: string;
  type?: string;
  title?: string;
  description?: string;
  required?: boolean;
  choices?: string[];
};

export type MystTemplatePart = {
  id: string;
  title?: string;
  description?: string;
  required?: boolean;
  max_chars?: number;
  max_words?: number;
};

export type MystTemplateDescriptor = {
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
  parts?: MystTemplatePart[];
  doc?: MystTemplateOption[];
  options?: MystTemplateOption[];
  links?: { source?: string; self?: string };
};

// MyST's front-matter ids against the submission catalog this app already
// checks. Anything unlisted becomes a requirement in its own right, carrying
// MyST's wording — which is better than dropping it.
const DOC_REQUIREMENT_KEYS: Record<string, string> = {
  title: 'FULL_TITLE',
  description: 'ABSTRACT',
  abstract: 'ABSTRACT',
  authors: 'AUTHOR_ORDER',
  keywords: 'KEYWORDS',
  venue: 'ARTICLE_TYPE',
  funding: 'FUNDING',
};

const PART_REQUIREMENT_KEYS: Record<string, string> = {
  abstract: 'ABSTRACT',
  keywords: 'KEYWORDS',
  acknowledgments: 'ACKNOWLEDGMENTS',
  acknowledgements: 'ACKNOWLEDGMENTS',
  author_contribution: 'AUTHOR_CONTRIBUTIONS',
  author_contributions: 'AUTHOR_CONTRIBUTIONS',
  competing_interests: 'COMPETING_INTERESTS',
  conflicts_of_interest: 'COMPETING_INTERESTS',
  data_availability: 'DATA_AVAILABILITY',
  code_availability: 'DATA_AVAILABILITY',
  code_data_availability: 'DATA_AVAILABILITY',
  availability: 'DATA_AVAILABILITY',
  funding: 'FUNDING',
  funding_information: 'FUNDING_INFORMATION',
  ethics: 'ETHICS_APPROVAL',
  ethics_statement: 'ETHICS_APPROVAL',
  highlights: 'HIGHLIGHTS',
  graphical_abstract: 'GRAPHICAL_ABSTRACT',
  cover_letter: 'COVER_LETTER',
};

// Parts that are prose sections of the manuscript rather than portal fields,
// and the section type each becomes in the composer's outline.
const PART_SECTION_TYPES: Record<string, string> = {
  abstract: 'ABSTRACT',
  keywords: 'KEYWORDS',
  introduction: 'INTRODUCTION',
  methods: 'METHODS',
  results: 'RESULTS',
  discussion: 'DISCUSSION',
  conclusions: 'CONCLUSION',
  conclusion: 'CONCLUSION',
  acknowledgments: 'ACKNOWLEDGMENTS',
  acknowledgements: 'ACKNOWLEDGMENTS',
  author_contribution: 'AUTHOR_CONTRIBUTIONS',
  author_contributions: 'AUTHOR_CONTRIBUTIONS',
  competing_interests: 'CONFLICTS',
  conflicts_of_interest: 'CONFLICTS',
  data_availability: 'DATA_AVAILABILITY',
  code_availability: 'DATA_AVAILABILITY',
  code_data_availability: 'DATA_AVAILABILITY',
  funding: 'FUNDING',
  appendix: 'APPENDIX',
};

// The option that names which journal of a family you are submitting to. MyST
// has no flag for it, so it is recognised by id. `journal_name` is the common
// one; the Physical Review template splits its families across
// `aps_journal_type` and `aip_journal_type`, which is why this is a pattern
// and not a list. `paper_size`, `article_type` and `reference_style` are
// choices too and are deliberately none of this.
const JOURNAL_CHOICE_ID = /^(journal(_name|_id)?|[a-z]+_journal_type)$/;

const titleCase = (value: string): string =>
  value
    .split(/[_\s-]+/)
    .filter((word) => word.length > 0)
    .map((word, index) =>
      index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word,
    )
    .join(' ');

// A requirement key is read back by the checklist and stored against the
// manuscript, so it stays in the shape the catalog uses: a template option
// called `from-name` must not become a key with a hyphen in it.
const requirementKeyFor = (id: string, table: Record<string, string>): string =>
  table[id.toLowerCase()] ??
  id
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const collapse = (value: string | undefined): string | undefined => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : undefined;
};

export type MystJournalChoice = { optionId: string; choices: string[] };

export const mystJournalChoices = (
  descriptor: MystTemplateDescriptor,
): MystJournalChoice[] =>
  (descriptor.options ?? [])
    .filter(
      (candidate) =>
        JOURNAL_CHOICE_ID.test(candidate.id.toLowerCase()) &&
        candidate.type === 'choice' &&
        (candidate.choices ?? []).length > 0,
    )
    .map((option) => ({ optionId: option.id, choices: option.choices ?? [] }));

// Every journal this one template can be pointed at, in one list — which is
// what a picker needs and what the registry's headline count is counting.
export const mystJournalNames = (
  descriptor: MystTemplateDescriptor,
): string[] => mystJournalChoices(descriptor).flatMap((one) => one.choices);

type JournalRequirement = {
  key: string;
  required: boolean;
  label?: string;
  notes?: string;
};

const requirementsFrom = (
  descriptor: MystTemplateDescriptor,
): JournalRequirement[] => {
  const seen = new Set<string>();
  const requirements: JournalRequirement[] = [];
  const push = (
    key: string,
    required: boolean,
    label: string,
    notes: string | undefined,
  ): void => {
    if (seen.has(key)) return;
    seen.add(key);
    requirements.push({
      key,
      required,
      label,
      ...(notes !== undefined ? { notes } : {}),
    });
  };

  for (const field of descriptor.doc ?? []) {
    push(
      requirementKeyFor(field.id, DOC_REQUIREMENT_KEYS),
      field.required === true,
      field.title ?? titleCase(field.id),
      collapse(field.description),
    );
  }
  for (const part of descriptor.parts ?? []) {
    push(
      requirementKeyFor(part.id, PART_REQUIREMENT_KEYS),
      part.required === true,
      part.title ?? titleCase(part.id),
      collapse(part.description),
    );
  }
  // A required option is a field the submission will not build without — the
  // running-author string, the article type — so it belongs on the checklist
  // beside the sections. The journal choice itself is answered at import.
  for (const option of descriptor.options ?? []) {
    if (option.required !== true) continue;
    if (JOURNAL_CHOICE_ID.test(option.id.toLowerCase())) continue;
    push(
      requirementKeyFor(option.id, {}),
      true,
      option.title ?? titleCase(option.id),
      collapse(option.description),
    );
  }
  return requirements;
};

type SkeletonEntry = {
  name: string;
  sectionType: string;
  placement: string;
  wordLimit?: number;
};

const skeletonFrom = (
  descriptor: MystTemplateDescriptor,
): SkeletonEntry[] | undefined => {
  const entries: SkeletonEntry[] = [];
  for (const part of descriptor.parts ?? []) {
    const sectionType = PART_SECTION_TYPES[part.id.toLowerCase()];
    if (sectionType === undefined) continue;
    entries.push({
      name: part.title ?? titleCase(part.id),
      sectionType,
      placement: 'MAIN',
      ...(typeof part.max_words === 'number' && part.max_words > 0
        ? { wordLimit: part.max_words }
        : {}),
    });
  }
  // A skeleton of only the back-matter statements would delete the body the
  // author is writing, so it is only worth having when the template actually
  // describes the argument as well.
  const hasBody = entries.some((entry) =>
    ['INTRODUCTION', 'METHODS', 'RESULTS', 'DISCUSSION'].includes(
      entry.sectionType,
    ),
  );
  return hasBody ? entries : undefined;
};

const abstractLimitFrom = (
  descriptor: MystTemplateDescriptor,
): number | undefined => {
  const abstract = (descriptor.parts ?? []).find(
    (part) => part.id.toLowerCase() === 'abstract',
  );
  if (abstract === undefined) return undefined;
  if (typeof abstract.max_words === 'number' && abstract.max_words > 0) {
    return abstract.max_words;
  }
  // Character caps are the other way MyST states it; ~6 characters a word is
  // the usual conversion, and rounding down keeps the limit honest.
  if (typeof abstract.max_chars === 'number' && abstract.max_chars > 0) {
    return Math.floor(abstract.max_chars / 6);
  }
  return undefined;
};

export const mystTemplateProfileKey = (
  templateId: string,
  journal?: string,
): string =>
  journal === undefined || journal.length === 0
    ? `myst:${templateId}`
    : `myst:${templateId}:${journal}`;

// One template, one profile — optionally pinned to the journal of the family
// you are actually submitting to.
export const journalProfileFromMystTemplate = (
  descriptor: MystTemplateDescriptor,
  journal?: string,
): PortableJournalProfile => {
  const requirements = requirementsFrom(descriptor);
  const skeleton = skeletonFrom(descriptor);
  const abstractWordLimit = abstractLimitFrom(descriptor);
  const title = descriptor.title ?? descriptor.id;
  const source = descriptor.links?.source;

  return {
    name:
      journal === undefined || journal.length === 0
        ? title
        : `${title} (${journal})`,
    profileKey: mystTemplateProfileKey(descriptor.id, journal),
    ...(requirements.length > 0
      ? { submissionRequirements: JSON.stringify(requirements) }
      : {}),
    ...(skeleton !== undefined
      ? { sectionSkeleton: JSON.stringify(skeleton) }
      : {}),
    ...(abstractWordLimit !== undefined ? { abstractWordLimit } : {}),
    // Two-column is the one layout fact some of these state outright, in their
    // own name. Everything else about their typesetting stays theirs.
    ...(/two[_\s-]?column/i.test(descriptor.id) || /two[- ]column/i.test(title)
      ? { twoColumn: true }
      : {}),
    notes: [
      collapse(descriptor.description),
      `Imported from the MyST template registry (${descriptor.id}).`,
      'Its submission requirements and section structure travel; its LaTeX or Typst page layout does not — this app writes its own.',
      source === undefined ? undefined : `Source: ${source}`,
    ]
      .filter((line): line is string => line !== undefined)
      .join(' '),
  } as PortableJournalProfile;
};

export const parseMystTemplateDescriptor = (
  json: string,
): MystTemplateDescriptor => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Not a MyST template: the file is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Not a MyST template');
  }
  const descriptor = parsed as Partial<MystTemplateDescriptor>;
  if (typeof descriptor.id !== 'string' || descriptor.id.length === 0) {
    throw new Error('Not a MyST template: no template id');
  }
  return descriptor as MystTemplateDescriptor;
};
