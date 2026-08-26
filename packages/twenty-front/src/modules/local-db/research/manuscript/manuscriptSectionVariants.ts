import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type JournalStyle, type SectionLike } from './manuscriptTypes';

// Per-journal versions of a section.
//
// MDPI caps an abstract at 200 words, arXiv at 320, Copernicus not at all. With
// one abstract per paper, submitting to the next journal means destructively
// rewriting the one you have and losing the other. So a section may carry
// alternative versions of itself, each tied to a journal profile, and exporting
// to that journal silently stands the version in for its base. Nothing about
// the paper's shape changes — same order, same placement, same section type —
// only the words. Nothing here is abstract-specific either: a lay summary, a
// significance statement, a data-availability statement worded to one funder's
// policy all want exactly this.

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

// The sections to export for one journal: the base sections, each speaking with
// its version's words where that journal has one.
export const resolveSectionVariants = (
  sections: SectionLike[],
  variantKey: string | null,
): SectionLike[] => {
  // A version never exports on its own, whether or not the base it names is
  // here — which drops orphans in the same breath. Without this every
  // alternative would surface as an extra section in every journal: a second
  // abstract printed directly under the first.
  const bases = sections.filter((section) => baseIdOf(section) === null);
  const activeKey = trimmedOrNull(variantKey);
  // No journal chosen, or one with nothing to key on: the paper as authored.
  if (activeKey === null) return bases;

  const versionsByBaseId = sectionVariantsByBaseId(sections);
  return bases.map((base) => {
    const version = versionsByBaseId
      .get(base.id)
      ?.find(
        (candidate) => trimmedOrNull(candidate.variantProfileKey) === activeKey,
      );
    if (!isDefined(version)) return base;
    // The base's identity survives the substitution, its id above all:
    // cross-references, asset anchors and placement markers point at the base
    // and have to keep resolving. So does the shape of the paper — where the
    // section sits, what it is, how deep it runs, whether it exports at all.
    // Only the words, and the two numbers that measure them, come from the
    // version.
    return {
      ...base,
      name: version.name,
      content: version.content,
      wordCount: version.wordCount,
      wordLimit: version.wordLimit,
    };
  });
};
