import { styled } from '@linaria/react';
import { type KeyboardEvent } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptFigureExpandedEditor } from '@/local-db/research/components/ManuscriptFigureExpandedEditor';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import {
  describeImageSource,
  resolveFigureImage,
} from '@/local-db/research/manuscript/manuscriptImages';
import {
  type NumberedFigure,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptFigureListItemProps = {
  figure: NumberedFigure;
  sections: SectionLike[];
  peerIndex: number;
  peerCount: number;
  isAdding: boolean;
  isExpanded: boolean;
  tableStyle: ManuscriptTableStyle;
  onDelete: () => void;
  onToggle: () => void;
  onSelectSection: (sectionId: string) => void;
  onPersist: (values: Record<string, unknown>) => void;
  onMove: (direction: -1 | 1) => void;
  onPlotTable: () => void;
  onReplaceImage: (file: File) => void;
  onChangeReferenceKey: (refKey: string) => void;
};

const StyledItem = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  overflow: hidden;
`;

const StyledRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledSummary = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StyledLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledCaption = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSectionLink = styled.button`
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-decoration: underline;
`;

const StyledThumb = styled.img`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  height: 40px;
  object-fit: cover;
  width: 56px;
`;

const StyledKindBadge = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  height: 40px;
  justify-content: center;
  text-transform: capitalize;
  width: 56px;
`;

const StyledExpandHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const firstLine = (value?: string | null): string =>
  value?.split(/\r?\n/, 1)[0]?.trim() || 'No caption';

export const ManuscriptFigureListItem = ({
  figure,
  sections,
  peerIndex,
  peerCount,
  isAdding,
  isExpanded,
  tableStyle,
  onDelete,
  onToggle,
  onSelectSection,
  onPersist,
  onMove,
  onPlotTable,
  onReplaceImage,
  onChangeReferenceKey,
}: ManuscriptFigureListItemProps) => {
  const image = resolveFigureImage(figure);
  const linkedSection = sections.find(({ id }) => id === figure.sectionId);
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <StyledItem>
      <StyledRow
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={handleRowKeyDown}
      >
        <StyledSummary>
          {figure.assetKind === 'TABLE' || image.kind === 'none' ? (
            <StyledKindBadge>
              {figure.assetKind?.toLowerCase() ?? 'asset'}
            </StyledKindBadge>
          ) : (
            <StyledThumb src={image.src} alt={figure.altText ?? ''} />
          )}
          <StyledMain>
            <StyledLabel>
              {figure.label} · #{figure.refKey ?? figure.id}
            </StyledLabel>
            <StyledCaption>
              {firstLine(figure.caption ?? figure.name)}
            </StyledCaption>
            <StyledMeta>
              {linkedSection !== undefined ? (
                <StyledSectionLink
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectSection(linkedSection.id);
                  }}
                >
                  {linkedSection.name ?? 'Untitled section'}
                </StyledSectionLink>
              ) : (
                <span>End of document</span>
              )}
              <span>· {describeImageSource(figure)}</span>
              {typeof figure.sourceLabel === 'string' &&
              figure.sourceLabel.trim().length > 0 &&
              figure.sourceLabel.trim() !== figure.number ? (
                <span>· source: {figure.sourceLabel.trim()}</span>
              ) : null}
            </StyledMeta>
          </StyledMain>
        </StyledSummary>
        <StyledExpandHint>{isExpanded ? 'Collapse' : 'Edit'}</StyledExpandHint>
      </StyledRow>

      {isExpanded ? (
        <ManuscriptFigureExpandedEditor
          figure={figure}
          sections={sections}
          peerIndex={peerIndex}
          peerCount={peerCount}
          isAdding={isAdding}
          tableStyle={tableStyle}
          onPersist={onPersist}
          onDelete={onDelete}
          onMove={onMove}
          onPlotTable={onPlotTable}
          onReplaceImage={onReplaceImage}
          onChangeReferenceKey={onChangeReferenceKey}
        />
      ) : null}
    </StyledItem>
  );
};
