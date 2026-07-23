import { firstAuthorSurname } from './manuscriptCitations';
import { normalizeDoi } from './manuscriptReferenceStore';
import { type ReferenceUsageByCitationKey } from './manuscriptReferenceUsage';
import { type ReferenceLike } from './manuscriptTypes';

export type DuplicateReferenceGroup = {
  references: ReferenceLike[];
};

const normalizeTitle = (title: string | null | undefined): string =>
  (title ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const normalizeSurname = (authors: string | null | undefined): string =>
  firstAuthorSurname(authors)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

const referencesMatch = (
  first: ReferenceLike,
  second: ReferenceLike,
): boolean => {
  const firstDoi = normalizeDoi(first.doi);
  const secondDoi = normalizeDoi(second.doi);
  if (firstDoi.length > 0 && secondDoi.length > 0 && firstDoi === secondDoi) {
    return true;
  }

  const firstTitle = normalizeTitle(first.name);
  const secondTitle = normalizeTitle(second.name);
  if (
    firstTitle.length > 0 &&
    secondTitle.length > 0 &&
    firstTitle === secondTitle
  ) {
    return true;
  }

  const firstSurname = normalizeSurname(first.authors);
  const secondSurname = normalizeSurname(second.authors);
  return (
    first.year !== null &&
    first.year !== undefined &&
    first.year === second.year &&
    firstSurname.length > 0 &&
    firstSurname === secondSurname
  );
};

export const findDuplicateReferenceGroups = (
  references: ReferenceLike[],
): DuplicateReferenceGroup[] => {
  const parents = references.map((_, index) => index);
  const findRoot = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }
    return root;
  };
  const connect = (firstIndex: number, secondIndex: number) => {
    const firstRoot = findRoot(firstIndex);
    const secondRoot = findRoot(secondIndex);
    if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot;
  };

  for (let firstIndex = 0; firstIndex < references.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < references.length;
      secondIndex += 1
    ) {
      if (referencesMatch(references[firstIndex], references[secondIndex])) {
        connect(firstIndex, secondIndex);
      }
    }
  }

  const referencesByRoot = new Map<number, ReferenceLike[]>();
  references.forEach((reference, index) => {
    const root = findRoot(index);
    referencesByRoot.set(root, [
      ...(referencesByRoot.get(root) ?? []),
      reference,
    ]);
  });

  return [...referencesByRoot.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ references: group }));
};

const REFERENCE_CONTENT_FIELDS: Array<keyof ReferenceLike> = [
  'name',
  'citationKey',
  'cslType',
  'authors',
  'year',
  'containerTitle',
  'volume',
  'issue',
  'pages',
  'doi',
  'url',
  'cslJson',
  'notes',
];

export const referenceFilledFieldCount = (reference: ReferenceLike): number =>
  REFERENCE_CONTENT_FIELDS.filter((field) => {
    const value = reference[field];
    return typeof value === 'number'
      ? Number.isFinite(value)
      : typeof value === 'string' && value.trim().length > 0;
  }).length;

export const suggestDuplicateReferenceKeep = (
  group: DuplicateReferenceGroup,
  usage: ReferenceUsageByCitationKey,
): ReferenceLike =>
  group.references.reduce((suggested, candidate) => {
    const suggestedFields = referenceFilledFieldCount(suggested);
    const candidateFields = referenceFilledFieldCount(candidate);
    if (candidateFields !== suggestedFields) {
      return candidateFields > suggestedFields ? candidate : suggested;
    }
    const suggestedUsage =
      usage.get(suggested.citationKey?.trim() ?? '')?.count ?? 0;
    const candidateUsage =
      usage.get(candidate.citationKey?.trim() ?? '')?.count ?? 0;
    return candidateUsage > suggestedUsage ? candidate : suggested;
  });
