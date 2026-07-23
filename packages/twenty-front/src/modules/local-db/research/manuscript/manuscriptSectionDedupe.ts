import { type SectionLike } from './manuscriptTypes';

export type SectionContentSimilarity = 'identical' | 'similar' | 'different';

export type SectionDedupeShape = Pick<
  SectionLike,
  'id' | 'name' | 'sectionType' | 'content' | 'orderIndex'
>;

export type DuplicateSectionPair = {
  firstSectionId: string;
  secondSectionId: string;
  similarity: SectionContentSimilarity;
};

export type DuplicateSectionGroup = {
  sections: SectionDedupeShape[];
  pairSimilarities: DuplicateSectionPair[];
  emptySectionIds: string[];
};

export type DuplicateSectionResolution = {
  sectionId: string;
  action: 'keep' | 'remove';
  suggestedKeep: boolean;
  needsReview: boolean;
};

export type ExistingSectionShape = Pick<
  SectionLike,
  'id' | 'name' | 'sectionType' | 'content'
>;

export type IncomingSectionShape = Pick<
  SectionLike,
  'name' | 'sectionType' | 'content'
>;

export type ExistingSectionMatch = {
  existingSection: ExistingSectionShape;
  similarity: SectionContentSimilarity;
};

export const SINGLETON_SECTION_TYPES = new Set([
  'FUNDING',
  'CONFLICTS',
  'AUTHOR_CONTRIBUTIONS',
  'DATA_AVAILABILITY',
  'ETHICS',
  'ACKNOWLEDGMENTS',
  'REFERENCES',
]);

const normalizedWords = (value: string): string[] =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

const singularize = (word: string): string => {
  if (word.endsWith('ies') && word.length > 3) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 1) {
    return word.slice(0, -1);
  }
  return word;
};

export const normalizeSectionName = (name?: string | null): string =>
  normalizedWords(name ?? '')
    .map(singularize)
    .join('');

export const normalizeSectionContentWhitespace = (
  content?: string | null,
): string => (content ?? '').trim().replace(/\s+/g, ' ');

const tokenOverlap = (first: string, second: string): number => {
  const firstTokens = normalizedWords(first);
  const secondTokens = normalizedWords(second);
  if (firstTokens.length === 0 || secondTokens.length === 0) return 0;

  const firstCounts = new Map<string, number>();
  const secondCounts = new Map<string, number>();
  firstTokens.forEach((token) =>
    firstCounts.set(token, (firstCounts.get(token) ?? 0) + 1),
  );
  secondTokens.forEach((token) =>
    secondCounts.set(token, (secondCounts.get(token) ?? 0) + 1),
  );

  let intersection = 0;
  let union = 0;
  const tokens = new Set([...firstCounts.keys(), ...secondCounts.keys()]);
  tokens.forEach((token) => {
    const firstCount = firstCounts.get(token) ?? 0;
    const secondCount = secondCounts.get(token) ?? 0;
    intersection += Math.min(firstCount, secondCount);
    union += Math.max(firstCount, secondCount);
  });
  return union === 0 ? 0 : intersection / union;
};

export const sectionContentSimilarity = (
  firstContent?: string | null,
  secondContent?: string | null,
): SectionContentSimilarity => {
  const first = normalizeSectionContentWhitespace(firstContent);
  const second = normalizeSectionContentWhitespace(secondContent);
  if (first === second) return 'identical';
  return tokenOverlap(first, second) > 0.8 ? 'similar' : 'different';
};

const normalizedSingletonType = (
  sectionType?: string | null,
): string | undefined => {
  const normalized = sectionType?.trim().toLocaleUpperCase();
  return normalized !== undefined && SINGLETON_SECTION_TYPES.has(normalized)
    ? normalized
    : undefined;
};

export const sectionsMatchAsDuplicates = (
  first: IncomingSectionShape,
  second: IncomingSectionShape,
): boolean => {
  const firstName = normalizeSectionName(first.name);
  const secondName = normalizeSectionName(second.name);
  if (firstName.length > 0 && firstName === secondName) return true;

  const firstType = normalizedSingletonType(first.sectionType);
  return (
    firstType !== undefined &&
    firstType === normalizedSingletonType(second.sectionType)
  );
};

const sectionOrder = (
  first: SectionDedupeShape,
  second: SectionDedupeShape,
): number =>
  (first.orderIndex ?? Number.MAX_SAFE_INTEGER) -
    (second.orderIndex ?? Number.MAX_SAFE_INTEGER) ||
  first.id.localeCompare(second.id);

export const findDuplicateSectionGroups = (
  sections: SectionDedupeShape[],
): DuplicateSectionGroup[] => {
  const parents = sections.map((_, index) => index);
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

  for (let firstIndex = 0; firstIndex < sections.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < sections.length;
      secondIndex += 1
    ) {
      if (
        sectionsMatchAsDuplicates(sections[firstIndex], sections[secondIndex])
      ) {
        connect(firstIndex, secondIndex);
      }
    }
  }

  const sectionsByRoot = new Map<number, SectionDedupeShape[]>();
  sections.forEach((section, index) => {
    const root = findRoot(index);
    sectionsByRoot.set(root, [...(sectionsByRoot.get(root) ?? []), section]);
  });

  return [...sectionsByRoot.values()]
    .filter((groupSections) => groupSections.length > 1)
    .map((groupSections) => {
      const sortedSections = [...groupSections].sort(sectionOrder);
      const pairSimilarities: DuplicateSectionPair[] = [];
      sortedSections.forEach((first, firstIndex) => {
        sortedSections.slice(firstIndex + 1).forEach((second) =>
          pairSimilarities.push({
            firstSectionId: first.id,
            secondSectionId: second.id,
            similarity: sectionContentSimilarity(first.content, second.content),
          }),
        );
      });
      return {
        sections: sortedSections,
        pairSimilarities,
        emptySectionIds: sortedSections
          .filter(
            (section) =>
              normalizeSectionContentWhitespace(section.content).length === 0,
          )
          .map(({ id }) => id),
      };
    })
    .sort((first, second) =>
      sectionOrder(first.sections[0], second.sections[0]),
    );
};

const similarityForPair = (
  group: DuplicateSectionGroup,
  firstSectionId: string,
  secondSectionId: string,
): SectionContentSimilarity =>
  group.pairSimilarities.find(
    (pair) =>
      (pair.firstSectionId === firstSectionId &&
        pair.secondSectionId === secondSectionId) ||
      (pair.firstSectionId === secondSectionId &&
        pair.secondSectionId === firstSectionId),
  )?.similarity ?? 'different';

export const defaultDuplicateResolution = (
  group: DuplicateSectionGroup,
): DuplicateSectionResolution[] => {
  const nonEmptySections = group.sections.filter(
    ({ id }) => !group.emptySectionIds.includes(id),
  );
  const suggestedKeep = (
    nonEmptySections.length > 0 ? nonEmptySections : group.sections
  ).reduce((longest, section) =>
    normalizeSectionContentWhitespace(section.content).length >
    normalizeSectionContentWhitespace(longest.content).length
      ? section
      : longest,
  );

  return group.sections.map((section) => {
    const isSuggestedKeep = section.id === suggestedKeep.id;
    const isEmpty = group.emptySectionIds.includes(section.id);
    const similarity = similarityForPair(group, suggestedKeep.id, section.id);
    const removable =
      !isSuggestedKeep && (isEmpty || similarity === 'identical');
    return {
      sectionId: section.id,
      action: removable ? 'remove' : 'keep',
      suggestedKeep: isSuggestedKeep,
      needsReview: !isSuggestedKeep && !isEmpty && similarity !== 'identical',
    };
  });
};

export const findExistingSectionMatch = (
  incomingSection: IncomingSectionShape,
  existingSections: ExistingSectionShape[],
): ExistingSectionMatch | undefined => {
  const matches = existingSections
    .filter((existingSection) =>
      sectionsMatchAsDuplicates(incomingSection, existingSection),
    )
    .map((existingSection) => ({
      existingSection,
      similarity: sectionContentSimilarity(
        incomingSection.content,
        existingSection.content,
      ),
    }));
  const similarityRank: Record<SectionContentSimilarity, number> = {
    identical: 0,
    similar: 1,
    different: 2,
  };
  return matches.sort(
    (first, second) =>
      similarityRank[first.similarity] - similarityRank[second.similarity],
  )[0];
};
