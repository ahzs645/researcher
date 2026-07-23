import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { H2Title, IconPlus } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportPanel } from '@/local-db/research/components/ManuscriptImportPanel';
import { ManuscriptSectionEditor } from '@/local-db/research/components/ManuscriptSectionEditor';
import { ManuscriptSectionMetadataPanel } from '@/local-db/research/components/ManuscriptSectionMetadataPanel';
import { ManuscriptDuplicateSectionReview } from '@/local-db/research/components/composer/ManuscriptDuplicateSectionReview';
import { ManuscriptSectionOutline } from '@/local-db/research/components/composer/ManuscriptSectionOutline';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { extractCitationKeys } from '@/local-db/research/manuscript/manuscriptCrossReference';
import { findDuplicateSectionGroups } from '@/local-db/research/manuscript/manuscriptSectionDedupe';
import { type SubmissionRequirementTemplate } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';
import { wordLimitStatus } from '@/local-db/research/manuscript/manuscriptScaffold';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
  type SectionPlacement,
} from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptWriteTabProps = {
  manuscriptId: string;
  manuscriptName?: string | null;
  sections: SectionLike[];
  figures: FigureLike[];
  references: ReferenceLike[];
  selectedSection?: SectionLike;
  style: JournalStyle;
  exportTableStyle: ManuscriptTableStyle;
  targetJournal?: SubmissionRequirementTemplate & { name?: string | null };
  submissionExtras?: string | null;
  competingInterests?: string | null;
  onSelectSection: (sectionId: string) => void;
  onChangeSectionPlacement: (
    sectionId: string,
    placement: SectionPlacement,
  ) => void;
  onPersistSection: (markdown: string) => void;
  onAddSection: () => void;
  onScaffoldSections: () => void;
  onSectionMetadataChanged: () => void;
  onImported: () => void;
  onDeleteDuplicateSections: (sectionIds: string[]) => Promise<void>;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;

  & h2 {
    margin-bottom: 0;
  }
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledWorkspace = styled.div`
  align-items: start;
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledEditorColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
`;

const StyledOutlineColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledDetails = styled.details`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};

  & > summary {
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    font-size: ${themeCssVariables.font.size.sm};
    font-weight: ${themeCssVariables.font.weight.medium};
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  }
`;

const StyledLimit = styled.span<{ over: boolean }>`
  color: ${({ over }) =>
    over
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${({ over }) =>
    over ? themeCssVariables.font.weight.medium : 'normal'};
`;

const StyledEmpty = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

export const ManuscriptWriteTab = ({
  manuscriptId,
  manuscriptName,
  sections,
  figures,
  references,
  selectedSection,
  style,
  exportTableStyle,
  targetJournal,
  submissionExtras,
  competingInterests,
  onSelectSection,
  onChangeSectionPlacement,
  onPersistSection,
  onAddSection,
  onScaffoldSections,
  onSectionMetadataChanged,
  onImported,
  onDeleteDuplicateSections,
}: ManuscriptWriteTabProps) => {
  const duplicateSectionGroups = findDuplicateSectionGroups(sections);
  const citationKeys = sections.reduce<string[]>((keys, section) => {
    for (const key of extractCitationKeys(section.content ?? '')) {
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }, []);
  const wordStatus = isDefined(selectedSection)
    ? wordLimitStatus(selectedSection.wordCount, selectedSection.wordLimit)
    : undefined;

  return (
    <StyledTab>
      <StyledHeader>
        <H2Title title="Write" />
        <StyledActions>
          <ManuscriptImportPanel
            compact
            manuscriptId={manuscriptId}
            manuscriptName={manuscriptName}
            existingSectionCount={sections.length}
            existingSections={sections}
            existingReferences={references}
            existingFigureRefKeys={figures
              .map(({ refKey }) => refKey)
              .filter(
                (refKey): refKey is string =>
                  typeof refKey === 'string' && refKey.length > 0,
              )}
            exportTableStyle={exportTableStyle}
            targetJournal={targetJournal}
            submissionExtras={submissionExtras}
            competingInterests={competingInterests}
            onChanged={onImported}
          />
          <Button
            title="Add section"
            Icon={IconPlus}
            variant="secondary"
            size="small"
            onClick={onAddSection}
          />
          <Button
            title="Scaffold sections"
            variant="secondary"
            size="small"
            disabled={sections.length > 0}
            onClick={onScaffoldSections}
          />
        </StyledActions>
      </StyledHeader>

      <StyledWorkspace>
        <StyledOutlineColumn>
          <ManuscriptDuplicateSectionReview
            groups={duplicateSectionGroups}
            onDeleteSections={onDeleteDuplicateSections}
          />
          <ManuscriptSectionOutline
            sections={sections}
            selectedSectionId={selectedSection?.id}
            onChangePlacement={onChangeSectionPlacement}
            onSelectSection={onSelectSection}
          />
        </StyledOutlineColumn>

        <StyledEditorColumn>
          {isDefined(selectedSection) ? (
            <>
              <StyledDetails>
                <summary>
                  Details · {selectedSection.name ?? 'Untitled section'}
                </summary>
                <ManuscriptSectionMetadataPanel
                  key={`section-metadata-${selectedSection.id}`}
                  section={selectedSection}
                  sections={sections}
                  figures={figures}
                  onChanged={onSectionMetadataChanged}
                />
              </StyledDetails>
              <ManuscriptSectionEditor
                key={selectedSection.id}
                citationKeys={citationKeys}
                figures={figures}
                initialMarkdown={selectedSection.content ?? ''}
                onPersist={onPersistSection}
                references={references}
                style={style}
              />
              {isDefined(wordStatus) ? (
                <StyledLimit over={wordStatus.over}>
                  {wordStatus.wordLimit === null
                    ? `${wordStatus.wordCount} words`
                    : wordStatus.over
                      ? `${wordStatus.wordCount} / ${wordStatus.wordLimit} words · ${Math.abs(wordStatus.remaining ?? 0)} over limit`
                      : `${wordStatus.wordCount} / ${wordStatus.wordLimit} words · ${wordStatus.remaining} left`}
                </StyledLimit>
              ) : null}
            </>
          ) : (
            <StyledEmpty>Add a section to start writing.</StyledEmpty>
          )}
        </StyledEditorColumn>
      </StyledWorkspace>
    </StyledTab>
  );
};
