import { styled } from '@linaria/react';
import { useEffect, useRef, useState } from 'react';
import { H2Title } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportPanel } from '@/local-db/research/components/ManuscriptImportPanel';
import { ManuscriptDuplicateSectionReview } from '@/local-db/research/components/composer/ManuscriptDuplicateSectionReview';
import { ManuscriptSectionOutline } from '@/local-db/research/components/composer/ManuscriptSectionOutline';
import { ManuscriptWriteEditor } from '@/local-db/research/components/composer/ManuscriptWriteEditor';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { extractCitationKeys } from '@/local-db/research/manuscript/manuscriptCrossReference';
import { type ScaffoldSectionDraft } from '@/local-db/research/manuscript/manuscriptScaffold';
import { findDuplicateSectionGroups } from '@/local-db/research/manuscript/manuscriptSectionDedupe';
import { type SubmissionRequirementTemplate } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';
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
  onEditFrontMatter: () => void;
  onSelectSection: (sectionId: string) => void;
  onChangeSectionPlacement: (
    sectionId: string,
    placement: SectionPlacement,
  ) => void;
  onPersistSection: (markdown: string) => void;
  onAddSection: (draft?: ScaffoldSectionDraft) => void;
  onScaffoldSections: () => void;
  missingScaffold: ScaffoldSectionDraft[];
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

const StyledOutlineColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledAddSectionSelect = styled.select`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
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
  onEditFrontMatter,
  onSelectSection,
  onChangeSectionPlacement,
  onPersistSection,
  onAddSection,
  onScaffoldSections,
  missingScaffold,
  onSectionMetadataChanged,
  onImported,
  onDeleteDuplicateSections,
}: ManuscriptWriteTabProps) => {
  const editorShellRef = useRef<HTMLDivElement>(null);
  const [minimumEditorHeight, setMinimumEditorHeight] = useState<
    number | undefined
  >();
  const duplicateSectionGroups = findDuplicateSectionGroups(sections);
  const firstWritingSectionId = sections.find(
    (section) => section.placement !== 'FRONT_MATTER',
  )?.id;
  const selectedWritingSection =
    selectedSection?.placement === 'FRONT_MATTER' ? undefined : selectedSection;
  const citationKeys = sections.reduce<string[]>((keys, section) => {
    for (const key of extractCitationKeys(section.content ?? '')) {
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }, []);

  useEffect(() => {
    if (
      selectedSection?.placement === 'FRONT_MATTER' &&
      firstWritingSectionId !== undefined
    ) {
      onSelectSection(firstWritingSectionId);
    }
  }, [firstWritingSectionId, onSelectSection, selectedSection?.placement]);

  const selectSection = (sectionId: string) => {
    if (sectionId === selectedWritingSection?.id) return;
    const currentHeight =
      editorShellRef.current?.getBoundingClientRect().height;
    if (currentHeight !== undefined) setMinimumEditorHeight(currentHeight);
    onSelectSection(sectionId);
  };

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
          <StyledAddSectionSelect
            aria-label="Add section"
            value=""
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') return;
              onAddSection(
                value === 'blank'
                  ? undefined
                  : missingScaffold[Number(value)],
              );
            }}
          >
            <option value="" disabled>
              Add section…
            </option>
            {missingScaffold.map((draft, index) => (
              <option key={`${draft.sectionType}-${draft.name}`} value={index}>
                {draft.name}
              </option>
            ))}
            <option value="blank">Blank section</option>
          </StyledAddSectionSelect>
          <Button
            title={
              sections.length === 0
                ? 'Scaffold sections'
                : `Add missing sections (${missingScaffold.length})`
            }
            variant="secondary"
            size="small"
            disabled={missingScaffold.length === 0}
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
            selectedSectionId={selectedWritingSection?.id}
            onChangePlacement={onChangeSectionPlacement}
            onEditFrontMatter={onEditFrontMatter}
            onSelectSection={selectSection}
          />
        </StyledOutlineColumn>

        <ManuscriptWriteEditor
          citationKeys={citationKeys}
          editorShellRef={editorShellRef}
          figures={figures}
          minimumEditorHeight={minimumEditorHeight}
          onEditorReady={() => setMinimumEditorHeight(undefined)}
          onPersistSection={onPersistSection}
          onSectionMetadataChanged={onSectionMetadataChanged}
          references={references}
          section={selectedWritingSection}
          sections={sections}
          style={style}
        />
      </StyledWorkspace>
    </StyledTab>
  );
};
