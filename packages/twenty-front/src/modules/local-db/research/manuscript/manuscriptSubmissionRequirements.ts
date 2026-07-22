import { type SectionLike } from './manuscriptTypes';

export type SubmissionRequirementKind =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'LIST'
  | 'STATEMENT';

export type SubmissionRequirementDefinition = {
  key: string;
  label: string;
  kind: SubmissionRequirementKind;
  description: string;
};

export type JournalSubmissionRequirement = {
  key: string;
  required: boolean;
  label?: string;
  notes?: string;
};

export type SubmissionRequirementValues = Record<string, string>;

export type ManuscriptSubmissionExtras = Record<
  string,
  SubmissionRequirementValues
>;

export type SubmissionRequirementTemplate = {
  id: string;
  profileKey?: string | null;
  submissionRequirements?: string | null;
};

type CanonicalRequirementField =
  | 'coverLetter'
  | 'highlights'
  | 'competingInterests'
  | 'suggestedReviewers';

export type SubmissionRequirementManuscript = {
  authorLine?: string | null;
  correspondingAuthor?: string | null;
  coverLetter?: string | null;
  highlights?: string | null;
  competingInterests?: string | null;
  suggestedReviewers?: string | null;
  submissionExtras?: string | null;
  sections?: SectionLike[] | null;
};

export type ResolvedSubmissionRequirementItem = {
  definition: SubmissionRequirementDefinition;
  required: boolean;
  value: string;
  filled: boolean;
  source: 'canonical' | 'extras';
};

export type SubmissionConflict = {
  key: string;
  message: string;
  journalValue: string;
  manuscriptValue: string;
};

export const SUBMISSION_REQUIREMENT_CATALOG: SubmissionRequirementDefinition[] =
  [
    {
      key: 'SUBMISSION_ID',
      label: 'Submission/manuscript ID',
      kind: 'SHORT_TEXT',
      description:
        'Journal-system identifier; often assigned after initial submission and therefore may be blank in a package.',
    },
    {
      key: 'DOCUMENT_STATUS',
      label: 'Submission document status',
      kind: 'SHORT_TEXT',
      description: 'Portal wrapper status such as Manuscript Draft.',
    },
    {
      key: 'FULL_TITLE',
      label: 'Full title',
      kind: 'SHORT_TEXT',
      description:
        'Title entered in journal metadata, independently comparable with the manuscript title page.',
    },
    {
      key: 'ARTICLE_TYPE',
      label: 'Article type',
      kind: 'SHORT_TEXT',
      description:
        'Journal-specific category such as Original Research, Research Paper, or Research Article.',
    },
    {
      key: 'ABSTRACT',
      label: 'Abstract',
      kind: 'LONG_TEXT',
      description:
        'Portal abstract; retain separately from the manuscript copy so variants can be reconciled.',
    },
    {
      key: 'KEYWORDS',
      label: 'Keywords',
      kind: 'LIST',
      description:
        'Ordered portal keyword list; retain casing and compare with any manuscript keyword line.',
    },
    {
      key: 'AUTHOR_ORDER',
      label: 'Ordered authors',
      kind: 'LIST',
      description:
        'Author order entered in the portal; must be compared with the title page.',
    },
    {
      key: 'FIRST_AUTHOR',
      label: 'First author',
      kind: 'SHORT_TEXT',
      description: 'Portal first-author designation.',
    },
    {
      key: 'CORRESPONDING_AUTHOR',
      label: 'Corresponding author',
      kind: 'SHORT_TEXT',
      description:
        'Name and active email, reconciled against title-page markers.',
    },
    {
      key: 'CORRESPONDING_AUTHOR_INSTITUTION',
      label: 'Corresponding-author institution',
      kind: 'SHORT_TEXT',
      description: 'Institution stored in the portal author profile.',
    },
    {
      key: 'CORRESPONDING_AUTHOR_COUNTRY',
      label: 'Corresponding-author country/location',
      kind: 'SHORT_TEXT',
      description: 'Country or location string from the portal author profile.',
    },
    {
      key: 'AFFILIATIONS',
      label: 'Author affiliations',
      kind: 'LIST',
      description:
        'Ordered numbered affiliations and author-to-affiliation mapping.',
    },
    {
      key: 'AUTHOR_SECONDARY_INFORMATION',
      label: 'Author secondary information',
      kind: 'LONG_TEXT',
      description:
        'Optional corresponding-, first-, or coauthor secondary profile information exposed by Editorial Manager.',
    },
    {
      key: 'FUNDING_INFORMATION',
      label: 'Portal funding information',
      kind: 'LONG_TEXT',
      description:
        'Structured or free-text funding field in the submission portal, distinct from the manuscript funding declaration.',
    },
    {
      key: 'SUGGESTED_REVIEWERS',
      label: 'Suggested reviewers',
      kind: 'LIST',
      description: 'Reviewer names, institutions, and contact emails.',
    },
    {
      key: 'OPPOSED_REVIEWERS',
      label: 'Opposed reviewers',
      kind: 'LIST',
      description:
        'Reviewers the authors ask the journal not to invite, optionally with reasons.',
    },
    {
      key: 'SPECIAL_ISSUE_RESPONSE',
      label: 'Special-issue submission',
      kind: 'STATEMENT',
      description:
        'Whether the manuscript targets a special issue and, if yes, which one.',
    },
    {
      key: 'MANUSCRIPT_FILE',
      label: 'Manuscript file',
      kind: 'SHORT_TEXT',
      description:
        'URL or data-URL for the primary manuscript file supplied to the journal.',
    },
    {
      key: 'SEPARATE_FIGURES',
      label: 'Separate figure files',
      kind: 'LIST',
      description:
        'URLs or data-URLs for separately supplied figure files, preserving figure number and original filename.',
    },
    {
      key: 'COVER_LETTER',
      label: 'Cover letter',
      kind: 'LONG_TEXT',
      description: 'Journal-addressed cover-letter text.',
    },
    {
      key: 'HIGHLIGHTS',
      label: 'Highlights',
      kind: 'LIST',
      description:
        'Short bullet-point research highlights, preserving line count and per-line length.',
    },
    {
      key: 'GRAPHICAL_ABSTRACT',
      label: 'Graphical abstract',
      kind: 'SHORT_TEXT',
      description:
        'Image data-URL or URL for the graphical abstract; artwork is stored as text for now.',
    },
    {
      key: 'DECLARATION_OF_INTERESTS_FILE',
      label: 'Declaration of interests file',
      kind: 'SHORT_TEXT',
      description:
        'URL or data-URL for a standalone conflict-of-interest form or checkbox document.',
    },
    {
      key: 'ACKNOWLEDGMENTS',
      label: 'Acknowledgments',
      kind: 'LONG_TEXT',
      description: 'Acknowledgment section or statement.',
    },
    {
      key: 'FUNDING',
      label: 'Funding',
      kind: 'STATEMENT',
      description:
        'Publication-facing funding statement, including an explicit no-funding declaration.',
    },
    {
      key: 'FUNDING_DECLARATION',
      label: 'Funding declaration',
      kind: 'STATEMENT',
      description:
        'Publication-facing funding statement, including an explicit no-funding declaration.',
    },
    {
      key: 'COMPETING_INTERESTS',
      label: 'Competing interests',
      kind: 'STATEMENT',
      description:
        'Publication-facing financial and non-financial competing-interests declaration.',
    },
    {
      key: 'AUTHOR_CONTRIBUTIONS',
      label: 'Author contributions',
      kind: 'LONG_TEXT',
      description: 'Narrative or CRediT-style author-contribution statement.',
    },
    {
      key: 'DATA_AVAILABILITY',
      label: 'Data availability',
      kind: 'STATEMENT',
      description:
        'Repository DOI, access conditions, or explicit availability statement.',
    },
    {
      key: 'ETHICS_APPROVAL',
      label: 'Ethics approval',
      kind: 'STATEMENT',
      description: 'Approval identifier or explicit not-applicable statement.',
    },
    {
      key: 'CONSENT_TO_PARTICIPATE',
      label: 'Consent to participate',
      kind: 'STATEMENT',
      description: 'Consent statement or explicit not-applicable response.',
    },
    {
      key: 'CONSENT_FOR_PUBLICATION',
      label: 'Consent for publication',
      kind: 'STATEMENT',
      description:
        'Publication-consent statement or explicit not-applicable response.',
    },
    {
      key: 'ORIGINALITY_STATEMENT',
      label: 'Originality and exclusive-submission statement',
      kind: 'STATEMENT',
      description:
        'Confirmation that the work is unpublished and not simultaneously submitted elsewhere.',
    },
    {
      key: 'PREPRINT_DISCLOSURE',
      label: 'Preprint disclosure',
      kind: 'STATEMENT',
      description: 'Whether and where a preprint has been posted.',
    },
  ];

export const CANONICAL_REQUIREMENT_FIELDS: Record<
  string,
  CanonicalRequirementField
> = {
  COVER_LETTER: 'coverLetter',
  HIGHLIGHTS: 'highlights',
  COMPETING_INTERESTS: 'competingInterests',
  SUGGESTED_REVIEWERS: 'suggestedReviewers',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (value: string | null | undefined): unknown => {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

export const parseJournalSubmissionRequirements = (
  value: string | null | undefined,
): JournalSubmissionRequirement[] => {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.key !== 'string' ||
      item.key.trim().length === 0 ||
      typeof item.required !== 'boolean'
    ) {
      return [];
    }

    return [
      {
        key: item.key.trim(),
        required: item.required,
        ...(typeof item.label === 'string' && item.label.trim().length > 0
          ? { label: item.label.trim() }
          : {}),
        ...(typeof item.notes === 'string' && item.notes.trim().length > 0
          ? { notes: item.notes.trim() }
          : {}),
      },
    ];
  });
};

export const serializeJournalSubmissionRequirements = (
  requirements: JournalSubmissionRequirement[],
): string => JSON.stringify(requirements);

export const parseManuscriptSubmissionExtras = (
  value: string | null | undefined,
): ManuscriptSubmissionExtras => {
  const parsed = parseJson(value);
  if (!isRecord(parsed)) return {};

  return Object.entries(parsed).reduce<ManuscriptSubmissionExtras>(
    (extras, [journalKey, journalValues]) => {
      if (!isRecord(journalValues)) return extras;

      const values = Object.entries(
        journalValues,
      ).reduce<SubmissionRequirementValues>(
        (result, [requirementKey, requirementValue]) => {
          if (typeof requirementValue === 'string') {
            result[requirementKey] = requirementValue;
          }
          return result;
        },
        {},
      );

      extras[journalKey] = values;
      return extras;
    },
    {},
  );
};

export const serializeManuscriptSubmissionExtras = (
  extras: ManuscriptSubmissionExtras,
): string => JSON.stringify(extras);

export const submissionJournalKey = (
  template: Pick<SubmissionRequirementTemplate, 'id' | 'profileKey'>,
): string => {
  const profileKey = template.profileKey?.trim();
  return profileKey !== undefined && profileKey.length > 0
    ? profileKey
    : template.id;
};

const catalogByKey = new Map(
  SUBMISSION_REQUIREMENT_CATALOG.map((definition) => [
    definition.key,
    definition,
  ]),
);

const labelFromKey = (key: string): string =>
  key
    .toLowerCase()
    .split('_')
    .filter((part) => part.length > 0)
    .map((part, index) =>
      index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part,
    )
    .join(' ');

const customDefinition = (
  requirement: JournalSubmissionRequirement,
): SubmissionRequirementDefinition => ({
  key: requirement.key,
  label: requirement.label ?? labelFromKey(requirement.key),
  kind: 'LONG_TEXT',
  description:
    requirement.notes ?? 'Custom submission requirement for this journal.',
});

export const resolveSubmissionRequirementItems = (
  template: SubmissionRequirementTemplate,
  manuscript: SubmissionRequirementManuscript,
): ResolvedSubmissionRequirementItem[] => {
  const requirements = parseJournalSubmissionRequirements(
    template.submissionRequirements,
  );
  const extras = parseManuscriptSubmissionExtras(manuscript.submissionExtras);
  const journalValues = extras[submissionJournalKey(template)] ?? {};

  return requirements.map((requirement) => {
    const canonicalField = CANONICAL_REQUIREMENT_FIELDS[requirement.key];
    const value =
      canonicalField === undefined
        ? (journalValues[requirement.key] ?? '')
        : (manuscript[canonicalField] ?? '');

    return {
      definition:
        catalogByKey.get(requirement.key) ?? customDefinition(requirement),
      required: requirement.required,
      value,
      filled: value.trim().length > 0,
      source: canonicalField === undefined ? 'extras' : 'canonical',
    };
  });
};

const splitList = (value: string): string[] =>
  value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const normalizeName = (value: string): string =>
  value
    .replace(/\*/g, '')
    .replace(/[\d⁰¹²³⁴⁵⁶⁷⁸⁹]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

const normalizeNameSequence = (value: string): string[] =>
  splitList(value).map(normalizeName);

const sequencesMatch = (first: string[], second: string[]): boolean =>
  first.length === second.length &&
  first.every((item, index) => item === second[index]);

const normalizeKeywordSet = (value: string): Set<string> =>
  new Set(
    splitList(value).map((keyword) =>
      keyword.replace(/\s+/g, ' ').trim().toLocaleLowerCase(),
    ),
  );

const setsMatch = (first: Set<string>, second: Set<string>): boolean =>
  first.size === second.size && [...first].every((item) => second.has(item));

export const collectSubmissionConflicts = ({
  manuscript,
  values,
}: {
  manuscript: SubmissionRequirementManuscript;
  values: SubmissionRequirementValues;
}): SubmissionConflict[] => {
  const conflicts: SubmissionConflict[] = [];
  const authorOrder = values.AUTHOR_ORDER?.trim();
  const manuscriptAuthorLine = manuscript.authorLine?.trim();

  if (
    authorOrder !== undefined &&
    authorOrder.length > 0 &&
    manuscriptAuthorLine !== undefined &&
    manuscriptAuthorLine.length > 0 &&
    !sequencesMatch(
      normalizeNameSequence(authorOrder),
      normalizeNameSequence(manuscriptAuthorLine),
    )
  ) {
    conflicts.push({
      key: 'AUTHOR_ORDER',
      message:
        'Author order for this journal differs from the manuscript author line',
      journalValue: authorOrder,
      manuscriptValue: manuscriptAuthorLine,
    });
  }

  const markedAuthor = splitList(manuscriptAuthorLine ?? '').find((author) =>
    author.includes('*'),
  );
  const correspondingAuthorName = splitList(
    manuscript.correspondingAuthor ?? '',
  )[0];

  if (
    markedAuthor !== undefined &&
    correspondingAuthorName !== undefined &&
    normalizeName(markedAuthor) !== normalizeName(correspondingAuthorName)
  ) {
    conflicts.push({
      key: 'CORRESPONDING_AUTHOR',
      message:
        'Corresponding-author marker differs from the manuscript corresponding author',
      journalValue: values.CORRESPONDING_AUTHOR?.trim() || markedAuthor,
      manuscriptValue: manuscript.correspondingAuthor?.trim() ?? '',
    });
  }

  const journalKeywords = values.KEYWORDS?.trim();
  const manuscriptKeywords = manuscript.sections?.find(
    (section) => section.sectionType?.toLocaleUpperCase() === 'KEYWORDS',
  )?.content;

  if (
    journalKeywords !== undefined &&
    journalKeywords.length > 0 &&
    typeof manuscriptKeywords === 'string' &&
    !setsMatch(
      normalizeKeywordSet(journalKeywords),
      normalizeKeywordSet(manuscriptKeywords),
    )
  ) {
    conflicts.push({
      key: 'KEYWORDS',
      message:
        'Keywords for this journal differ from the manuscript keywords section',
      journalValue: journalKeywords,
      manuscriptValue: manuscriptKeywords,
    });
  }

  return conflicts;
};
