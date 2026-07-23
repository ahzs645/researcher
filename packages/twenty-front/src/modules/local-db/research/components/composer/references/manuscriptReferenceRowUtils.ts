import {
  countCitationKeyOccurrences,
  type ReferenceUsage,
} from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import {
  type FigureLike,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

const isMissing = (value: string | null | undefined): boolean =>
  value === null || value === undefined || value.trim().length === 0;

export const missingReferenceFields = (reference: ReferenceLike): string[] => [
  ...(reference.year === null || reference.year === undefined ? ['year'] : []),
  ...(isMissing(reference.authors) ? ['authors'] : []),
  ...(isMissing(reference.doi) && isMissing(reference.url)
    ? ['DOI or URL']
    : []),
];

export const referenceSectionUsages = ({
  citationKey,
  figures,
  sections,
  usage,
}: {
  citationKey: string;
  figures: FigureLike[];
  sections: SectionLike[];
  usage: ReferenceUsage;
}) =>
  usage.sectionIds.map((sectionId) => {
    const section = sections.find(({ id }) => id === sectionId);
    const count =
      section === undefined
        ? 0
        : countCitationKeyOccurrences(section.content, citationKey) +
          figures
            .filter((figure) => figure.sectionId === section.id)
            .reduce(
              (total, figure) =>
                total +
                countCitationKeyOccurrences(figure.caption, citationKey) +
                countCitationKeyOccurrences(figure.tableData, citationKey),
              0,
            );
    return {
      count,
      id: sectionId,
      name: section?.name?.trim() || 'Untitled section',
    };
  });
