import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportReviewSectionRow } from '@/local-db/research/import-wizard/components/ManuscriptImportReviewSectionRow';
import { type ImportedSectionDraft } from '@/local-db/research/manuscript/manuscriptDocImport';
import { type ExistingSectionMatch } from '@/local-db/research/manuscript/manuscriptSectionDedupe';

type ManuscriptImportReviewSectionListProps = {
  sections: ImportedSectionDraft[];
  existingMatches: (ExistingSectionMatch | undefined)[];
  importAnywaySectionIndexes: ReadonlySet<number>;
  onChangeSection: (
    sectionIndex: number,
    update: Partial<ImportedSectionDraft>,
  ) => void;
  onChangeImportAnyway: (sectionIndex: number, importAnyway: boolean) => void;
};

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

export const ManuscriptImportReviewSectionList = ({
  sections,
  existingMatches,
  importAnywaySectionIndexes,
  onChangeSection,
  onChangeImportAnyway,
}: ManuscriptImportReviewSectionListProps) => (
  <StyledList>
    {sections.map((section, sectionIndex) => (
      <ManuscriptImportReviewSectionRow
        key={`${section.orderIndex}-${sectionIndex}`}
        section={section}
        sectionIndex={sectionIndex}
        existingMatch={existingMatches[sectionIndex]}
        importAnyway={importAnywaySectionIndexes.has(sectionIndex)}
        onChange={(update) => onChangeSection(sectionIndex, update)}
        onChangeImportAnyway={(importAnyway) =>
          onChangeImportAnyway(sectionIndex, importAnyway)
        }
      />
    ))}
  </StyledList>
);
