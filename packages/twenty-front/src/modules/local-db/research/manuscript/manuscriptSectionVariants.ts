import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { countWords } from './manuscriptWordCount';
import { type JournalStyle, type SectionLike } from './manuscriptTypes';

// Alternative versions of a section, and the one a journal receives.
//
// MDPI caps an abstract at 200 words, arXiv at 320, Copernicus not at all. With
// one abstract per paper, submitting to the next journal means destructively
// rewriting the one you have and losing the other. So a section may carry
// alternative versions of itself, and exporting silently stands the right one
// in for its base. Nothing about the paper's shape changes — same order, same
// placement, same section type — only the words. Nothing here is
// abstract-specific either: a lay summary, a significance statement, a
// data-availability statement worded to one funder's policy all want exactly
// this.
//
// A version says what it is for in one of two ways. It can name a journal, and
// that journal then gets it whatever else is true. Or it can declare the rule
// it satisfies — "written to a 200-word cap" — and then any journal whose
// requirement it meets can use it. The second is what keeps five MDPI journals
// that all cap the abstract at 200 words from needing five copies of the same
// paragraph, and it survives a journal being renamed, because it describes the
// requirement rather than the record.

// Which journal a version is written for. `profileKey` is what a shared profile
// file carries and what the MyST registry mints, so it survives the trip
// through a portable package onto another machine; a journal record's id is
// local to one workspace, and keying on it would strand every version a paper
// had the moment it moved. A journal typed in by hand has no key yet, and then
// its name is the only stable thing left to match on.
export const sectionVariantKey = (
  style: Pick<JournalStyle, 'name' | 'profileKey'> | null | undefined,
): string | null => {
  if (!isDefined(style)) return null;
  const profileKey = style.profileKey?.trim();
  if (isNonEmptyString(profileKey)) return profileKey;
  const name = style.name?.trim();
  return isNonEmptyString(name) ? name : null;
};

// What the resolver needs to know about the journal: who it is, for a pinned
// version, and what it caps an abstract at, for a rule-based one.
export type SectionVariantStyle = Pick<
  JournalStyle,
  'name' | 'profileKey' | 'abstractWordLimit'
>;

// The requirement a version declares it satisfies. One rule ships — the word
// cap — because it is the one every journal states and the only one the
// selection below can actually check. The container is a record rather than a
// bare number so that a structured-abstract flag or a no-citations rule can
// join it later without moving the field, but nothing is declared here that
// the app does not honour: a rule the export ignores would be a promise to an
// author that their text was checked when it never was.
export type SectionVariantRules = {
  maxWords?: number;
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

// Read the rules off a section. This is untrusted JSON — hand-edited in a
// record cell, or written by a build that knows rules this one does not — so an
// unknown key is dropped rather than carried, and a value of the wrong type is
// dropped rather than coerced: a `maxWords` of "200" turned into 200 would let
// a version pass a cap the author never actually declared. Anything
// unreadable degrades to "this version declares no rule", never to an
// exception, because the one moment this runs is halfway through an export.
export const parseSectionVariantRules = (
  json: string | null | undefined,
): SectionVariantRules => {
  const source = json?.trim();
  if (!isNonEmptyString(source)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const record = parsed as Record<string, unknown>;
  const rules: SectionVariantRules = {};
  if (isPositiveNumber(record.maxWords)) rules.maxWords = record.maxWords;
  return rules;
};

// What to write back into the field. Nothing declared writes nothing at all
// rather than `{}`, so a version the author cleared reads as undeclared
// instead of as a rule that happens to be empty.
export const serializeSectionVariantRules = (
  rules: SectionVariantRules,
): string | null => {
  const declared: SectionVariantRules = {};
  if (isPositiveNumber(rules.maxWords)) declared.maxWords = rules.maxWords;
  return Object.keys(declared).length === 0 ? null : JSON.stringify(declared);
};

// The cap a version says it was written to. This is the author's target — what
// the editor counts against and what the UI labels the version with — and it
// deliberately decides nothing below: a version that claims 200 and runs to 210
// is 210 words long, whatever it claims.
export const sectionVariantMaxWords = (section: SectionLike): number | null =>
  parseSectionVariantRules(section.variantRules).maxWords ?? null;

// How long a section actually is. `wordCount` on the record is a cache the
// editor refreshes as it saves, so a paste that never round-tripped or a record
// written before the counter existed can leave it behind — and a stale number
// here would send a journal a version that busts its cap. The content is the
// one thing that cannot be out of date, counted by the same helper the composer
// and every word-limit warning use, so all three agree on what a word is.
export const sectionVariantWordCount = (section: SectionLike): number =>
  countWords(section.content ?? '');

// The cap this journal puts on this base. An abstract answers to the journal's
// own abstract limit — that is the number the journal publishes and the one the
// readiness check reads back off the bundle. Every other section answers to the
// limit written on it, which is where a journal's section skeleton puts one.
export const sectionVariantWordLimit = (
  base: SectionLike,
  style: SectionVariantStyle | null | undefined,
): number | null => {
  const limit =
    base.sectionType === 'ABSTRACT' ? style?.abstractWordLimit : base.wordLimit;
  return isDefined(limit) && limit > 0 ? limit : null;
};

const trimmedOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return isNonEmptyString(trimmed) ? trimmed : null;
};

// A version is any section that names a base. That field is the whole test —
// nothing else tells a version record apart from an ordinary section.
const baseIdOf = (section: SectionLike): string | null =>
  trimmedOrNull(section.variantOfId);

// Two versions claiming the same base and the same journal is a data error we
// cannot resolve, so the least we can do is resolve it the same way every time
// rather than let record fetch order decide which abstract gets submitted.
// Ids are opaque tokens, so they compare by code point and not by locale.
const compareVariants = (a: SectionLike, b: SectionLike): number => {
  const orderDelta = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  if (orderDelta !== 0) return orderDelta;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};

// Every version grouped under the id it names, each group in the tie-break
// order above. Grouping is by the id written on the version, present base or
// not: a caller holding the base looks its group up, and an orphan's group is
// simply never asked for.
export const sectionVariantsByBaseId = (
  sections: SectionLike[],
): Map<string, SectionLike[]> => {
  const versionsByBaseId = new Map<string, SectionLike[]>();
  for (const section of sections) {
    const baseId = baseIdOf(section);
    if (baseId === null) continue;
    const versions = versionsByBaseId.get(baseId) ?? [];
    versions.push(section);
    versionsByBaseId.set(baseId, versions);
  }
  for (const versions of versionsByBaseId.values()) {
    versions.sort(compareVariants);
  }
  return versionsByBaseId;
};

// Why one section rather than another is going out. The UI has to be able to
// say this in a sentence — an author looking at three versions of an abstract
// needs to know which one this journal receives and what made it the one.
export type SectionVariantReason =
  // A version names this journal, so this journal gets it.
  | 'PINNED'
  // The journal caps nothing here, so the fullest text goes.
  | 'NO_WORD_LIMIT'
  // The base is within the cap, so there is nothing to stand in for.
  | 'BASE_FITS'
  // The base overruns; this version declares a rule and fits.
  | 'RULE_FITS'
  // The base overruns and no version fits either, so the base goes and the
  // readiness check says it is over.
  | 'NOTHING_FITS';

export type SectionVariantChoice = {
  // The section that will export: the base itself, or the base wearing a
  // version's words.
  section: SectionLike;
  // The version standing in, or null when the base speaks for itself.
  version: SectionLike | null;
  reason: SectionVariantReason;
  // The cap that applied, null when this journal sets none for this base.
  wordLimit: number | null;
  // How long the section that ships actually is, so a UI can put it next to
  // the cap without counting a second time.
  wordCount: number;
};

// The base's identity survives a substitution, its id above all:
// cross-references, asset anchors and placement markers point at the base and
// have to keep resolving. So does the shape of the paper — where the section
// sits, what it is, how deep it runs, whether it exports at all. Only the
// words, and the two numbers that measure them, come from the version.
const withVersionWords = (
  base: SectionLike,
  version: SectionLike,
): SectionLike => ({
  ...base,
  name: version.name,
  content: version.content,
  wordCount: version.wordCount,
  wordLimit: version.wordLimit,
});

// Which version a journal receives for one base, and what decided it.
//
// The order of the tests is the whole design. A pinned version wins outright,
// because explicit beats inferred and a journal that wants particular wording
// has to be able to say so regardless of length. Failing that the base ships
// whenever it fits: a shorter version exists to be used when the full text will
// not fit, not to replace the full text whenever it happens to exist. Only when
// the base overruns does a rule-declaring version stand in, and then the
// longest one that fits — so a 200-word version is not sent to a journal that
// would have taken 320. If nothing fits, the base still ships: sending a
// version that also busts the cap would swap a problem the readiness check
// reports for one nobody sees.
export const chooseSectionVariant = (
  base: SectionLike,
  versions: readonly SectionLike[],
  style: SectionVariantStyle | null | undefined,
): SectionVariantChoice => {
  // Sorted here rather than trusted from the caller, so two versions that tie
  // resolve the same way whoever asks — the export and the UI explaining it.
  const candidates = [...versions].sort(compareVariants);
  const wordLimit = sectionVariantWordLimit(base, style);
  const activeKey = sectionVariantKey(style);
  const pinned =
    activeKey === null
      ? undefined
      : candidates.find(
          (candidate) =>
            trimmedOrNull(candidate.variantProfileKey) === activeKey,
        );
  if (isDefined(pinned)) {
    return {
      section: withVersionWords(base, pinned),
      version: pinned,
      reason: 'PINNED',
      wordLimit,
      wordCount: sectionVariantWordCount(pinned),
    };
  }

  const baseWordCount = sectionVariantWordCount(base);
  const baseChoice = (reason: SectionVariantReason): SectionVariantChoice => ({
    section: base,
    version: null,
    reason,
    wordLimit,
    wordCount: baseWordCount,
  });
  if (wordLimit === null) return baseChoice('NO_WORD_LIMIT');
  if (baseWordCount <= wordLimit) return baseChoice('BASE_FITS');

  // Eligibility is by the words a version actually holds, never by the cap it
  // declares: the declaration is the author's target and the text is the truth,
  // so a version claiming 200 while running to 210 is refused by a journal that
  // caps at 200. The declaration is still what makes a version reusable at all
  // — a version that names neither a journal nor a rule has not said it may
  // stand in anywhere.
  let chosen: SectionLike | null = null;
  let chosenWordCount = -1;
  for (const candidate of candidates) {
    if (sectionVariantMaxWords(candidate) === null) continue;
    const wordCount = sectionVariantWordCount(candidate);
    if (wordCount > wordLimit || wordCount <= chosenWordCount) continue;
    chosen = candidate;
    chosenWordCount = wordCount;
  }
  if (chosen === null) return baseChoice('NOTHING_FITS');
  return {
    section: withVersionWords(base, chosen),
    version: chosen,
    reason: 'RULE_FITS',
    wordLimit,
    wordCount: chosenWordCount,
  };
};

// Every base with its choice made, in the order the bases arrived. The UI wants
// the reasons; the export wants only the sections, which is what
// `resolveSectionVariants` hands back.
export const resolveSectionVariantChoices = (
  sections: SectionLike[],
  style: SectionVariantStyle | null | undefined,
): SectionVariantChoice[] => {
  // A version never exports on its own, whether or not the base it names is
  // here — which drops orphans in the same breath. Without this every
  // alternative would surface as an extra section in every journal: a second
  // abstract printed directly under the first.
  const bases = sections.filter((section) => baseIdOf(section) === null);
  const versionsByBaseId = sectionVariantsByBaseId(sections);
  return bases.map((base) =>
    chooseSectionVariant(base, versionsByBaseId.get(base.id) ?? [], style),
  );
};

// The sections to export for one journal: the base sections, each speaking with
// whichever version this journal has earned.
export const resolveSectionVariants = (
  sections: SectionLike[],
  style: SectionVariantStyle | null | undefined,
): SectionLike[] =>
  resolveSectionVariantChoices(sections, style).map((choice) => choice.section);
