// A journal profile as one shareable file.
//
// The profiles this app ships are seed records, so adding a journal means
// editing the app — which is the wrong shape for the thing that changes most
// often. MyST's answer is a template registry: one repository per journal, 422
// of them, listed through an API and contributable by anyone.
//
// This is the first half of that: a profile leaves as a JSON file and comes
// back as a record, so a lab can keep its own and send it to a collaborator
// without either of them touching the codebase. The registry can sit on top
// later; the file format is what has to exist first.

import {
  BOOLEAN_FIELDS,
  MANUSCRIPT_EXPORT_STYLE_OVERRIDE_KEYS,
  NUMBER_FIELDS,
  STRING_FIELDS,
  type ManuscriptExportStyleOverrideKey,
} from './manuscriptExportStyleOverrides';
import { type JournalStyle } from './manuscriptTypes';

export const JOURNAL_PROFILE_FORMAT = 'researcher-journal-profile' as const;
export const JOURNAL_PROFILE_VERSION = 1 as const;
export const JOURNAL_PROFILE_READABLE_VERSIONS = [1];

// The style keys, plus the fields that describe the journal rather than the
// typography: what it asks for at submission, and how its sections are shaped.
const JOURNAL_PROFILE_KEYS = [
  ...MANUSCRIPT_EXPORT_STYLE_OVERRIDE_KEYS,
  'profileKey',
  'sectionSkeleton',
  'submissionRequirements',
  'requiredArtifacts',
  'abstractWordLimit',
  'abstractWordMinimum',
  'keywordMinimum',
  'keywordMaximum',
] as const satisfies ReadonlyArray<keyof JournalStyle>;

export type JournalProfileKey = (typeof JOURNAL_PROFILE_KEYS)[number];

export type PortableJournalProfile = Partial<
  Pick<JournalStyle, JournalProfileKey>
> & {
  name: string;
};

export type JournalProfileFile = {
  format: typeof JOURNAL_PROFILE_FORMAT;
  schemaVersion: typeof JOURNAL_PROFILE_VERSION;
  exportedAt: string;
  profile: PortableJournalProfile;
};

const STRING_ARRAY_KEYS = new Set<JournalProfileKey>(['requiredArtifacts']);

// The fields this module adds on top of the style keys, which the override
// serializer does not know about.
const PROFILE_NUMBER_KEYS = new Set<JournalProfileKey>([
  'abstractWordLimit',
  'abstractWordMinimum',
  'keywordMinimum',
  'keywordMaximum',
]);

const PROFILE_STRING_KEYS = new Set<JournalProfileKey>([
  'profileKey',
  'sectionSkeleton',
  'submissionRequirements',
]);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

// A value only survives if it is the type its field actually holds. Coercing
// `bodyFontSize: "twelve"` to something would leave the author formatting
// against a setting they never chose.
const isExpectedType = (key: JournalProfileKey, value: unknown): boolean => {
  const styleKey = key as ManuscriptExportStyleOverrideKey;
  if (STRING_ARRAY_KEYS.has(key)) return isStringArray(value);
  if (NUMBER_FIELDS.has(styleKey) || PROFILE_NUMBER_KEYS.has(key)) {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (BOOLEAN_FIELDS.has(styleKey)) return typeof value === 'boolean';
  if (STRING_FIELDS.has(styleKey) || PROFILE_STRING_KEYS.has(key)) {
    return typeof value === 'string';
  }
  return false;
};

// A record's fields come back as `string | number | boolean | null`; null and
// empty string both mean "this journal does not set it", and carrying them
// would make an exported profile assert defaults it never chose.
const isMeaningful = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  !(Array.isArray(value) && value.length === 0);

export const buildJournalProfile = <
  TJournal extends Record<string, unknown> & { name?: string | null },
>(
  journal: TJournal,
): PortableJournalProfile => {
  const profile: Record<string, unknown> = {
    name: journal.name?.trim() || 'Journal profile',
  };
  for (const key of JOURNAL_PROFILE_KEYS) {
    const value = journal[key];
    if (isMeaningful(value)) profile[key] = value;
  }
  return profile as PortableJournalProfile;
};

export const journalProfileFilename = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug.length > 0 ? slug : 'journal'}-profile.json`;
};

export const serializeJournalProfile = (
  profile: PortableJournalProfile,
  exportedAt: string,
): string =>
  JSON.stringify(
    {
      format: JOURNAL_PROFILE_FORMAT,
      schemaVersion: JOURNAL_PROFILE_VERSION,
      exportedAt,
      profile,
    } satisfies JournalProfileFile,
    null,
    2,
  );

// Parse and validate. A profile arriving from someone else is untrusted input:
// an unknown key is dropped rather than written to the record, and a value of
// the wrong type is dropped rather than coerced, because a journal profile
// that silently half-applies is worse than one that refuses.
export const parseJournalProfile = (json: string): PortableJournalProfile => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Not a journal profile: the file is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Not a journal profile');
  }
  const file = parsed as Partial<JournalProfileFile>;
  if (file.format !== JOURNAL_PROFILE_FORMAT) {
    throw new Error('Not a journal profile: unexpected format');
  }
  if (!JOURNAL_PROFILE_READABLE_VERSIONS.includes(file.schemaVersion ?? 0)) {
    throw new Error(
      `Journal profile schema v${String(file.schemaVersion)} cannot be read by this version`,
    );
  }
  const source = file.profile;
  if (typeof source !== 'object' || source === null) {
    throw new Error('Journal profile carries no settings');
  }
  const record = source as Record<string, unknown>;
  const name =
    typeof record.name === 'string' && record.name.trim().length > 0
      ? record.name.trim()
      : undefined;
  if (name === undefined) {
    throw new Error('Journal profile has no name');
  }

  const profile: Record<string, unknown> = { name };
  for (const key of JOURNAL_PROFILE_KEYS) {
    const value = record[key];
    if (!isMeaningful(value)) continue;
    if (isExpectedType(key, value)) profile[key] = value;
  }
  return profile as PortableJournalProfile;
};

// What to write into a new journalTemplate record. An imported profile keeps
// the sender's `profileKey` so a workspace that already has that seeded
// template recognises it as the same one rather than growing a second copy.
export const journalProfileRecordInput = (
  profile: PortableJournalProfile,
): Record<string, unknown> => ({ ...profile });
