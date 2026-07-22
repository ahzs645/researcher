import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { H2Title, IconPlus } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportPanel } from '@/local-db/research/components/ManuscriptImportPanel';
import { ManuscriptSectionEditor } from '@/local-db/research/components/ManuscriptSectionEditor';
import { ManuscriptSectionMetadataPanel } from '@/local-db/research/components/ManuscriptSectionMetadataPanel';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { wordLimitStatus } from '@/local-db/research/manuscript/manuscriptScaffold';
import {
  type FigureLike,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptWriteTabProps = {
  manuscriptId: string;
  manuscriptName?: string | null;
  sections: SectionLike[];
  figures: FigureLike[];
  references: ReferenceLike[];
  selectedSection?: SectionLike;
  exportTableStyle: ManuscriptTableStyle;
  onSelectSection: (sectionId: string) => void;
  onPersistSection: (markdown: string) => void;
  onAddSection: () => void;
  onScaffoldSections: () => void;
  onSectionMetadataChanged: () => void;
  onImported: () => void;
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

const StyledOutline = styled.nav`
  align-self: start;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[1]};
  position: sticky;
  top: ${themeCssVariables.spacing[3]};

  @media (max-width: 720px) {
    max-height: 220px;
    position: static;
  }
`;

const StyledOutlineRow = styled.button<{
  active: boolean;
  excludedFromExport: boolean;
}>`
  background: ${({ active }) =>
    active ? themeCssVariables.background.transparent.blue : 'transparent'};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  opacity: ${({ excludedFromExport }) => (excludedFromExport ? 0.55 : 1)};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
  transition: opacity 100ms ease;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    opacity: ${({ excludedFromExport }) => (excludedFromExport ? 0.75 : 1)};
  }
`;

const StyledOutlineTitle = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const StyledOutlineMeta = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledBadge = styled.span`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  max-width: 130px;
  overflow: hidden;
  padding: 1px ${themeCssVariables.spacing[1]};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEditorColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
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

const sectionTypeLabel = (sectionType?: string | null) =>
  (sectionType ?? 'OTHER').toLowerCase().replaceAll('_', ' ');

export const ManuscriptWriteTab = ({
  manuscriptId,
  manuscriptName,
  sections,
  figures,
  references,
  selectedSection,
  exportTableStyle,
  onSelectSection,
  onPersistSection,
  onAddSection,
  onScaffoldSections,
  onSectionMetadataChanged,
  onImported,
}: ManuscriptWriteTabProps) => {
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
            existingReferences={references}
            existingFigureRefKeys={figures
              .map(({ refKey }) => refKey)
              .filter(
                (refKey): refKey is string =>
                  typeof refKey === 'string' && refKey.length > 0,
              )}
            exportTableStyle={exportTableStyle}
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
        <StyledOutline aria-label="Section outline">
          {sections.length === 0 ? (
            <StyledEmpty>No sections yet.</StyledEmpty>
          ) : (
            sections.map((section) => (
              <StyledOutlineRow
                key={section.id}
                type="button"
                active={section.id === selectedSection?.id}
                excludedFromExport={section.includeInExport === false}
                onClick={() => onSelectSection(section.id)}
              >
                <StyledOutlineTitle>
                  {section.name ?? 'Untitled section'}
                </StyledOutlineTitle>
                <StyledOutlineMeta>
                  <StyledBadge>
                    {sectionTypeLabel(section.sectionType)}
                  </StyledBadge>
                  <span>{section.wordCount ?? 0} words</span>
                </StyledOutlineMeta>
              </StyledOutlineRow>
            ))
          )}
        </StyledOutline>

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
                initialMarkdown={selectedSection.content ?? ''}
                onPersist={onPersistSection}
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
