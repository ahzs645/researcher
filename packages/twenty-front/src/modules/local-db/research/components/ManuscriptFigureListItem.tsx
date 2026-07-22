import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptFigureMetadataFields } from '@/local-db/research/components/ManuscriptFigureMetadataFields';
import { ManuscriptTableEditor } from '@/local-db/research/components/ManuscriptTableEditor';
import { assetPlacementMarker } from '@/local-db/research/manuscript/manuscriptAssetPlacement';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import {
  describeImageSource,
  resolveFigureImage,
} from '@/local-db/research/manuscript/manuscriptImages';
import {
  type NumberedFigure,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';

type ManuscriptFigureListItemProps = {
  figure: NumberedFigure;
  sections: SectionLike[];
  peerIndex: number;
  peerCount: number;
  isAdding: boolean;
  tableStyle: ManuscriptTableStyle;
  onPersist: (values: Record<string, unknown>) => void;
  onMove: (direction: -1 | 1) => void;
  onPlotTable: () => void;
  onReplaceImage: (file: File) => void;
};

const PLACEMENT_OPTIONS: SelectOption<string>[] = [
  { value: 'MAIN', label: 'Main' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

const UNASSIGNED_SECTION = '__UNASSIGNED__';

const StyledRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
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

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledThumb = styled.img`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  height: 40px;
  object-fit: cover;
  width: 56px;
`;

const StyledAssetEditor = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr);
  padding: ${themeCssVariables.spacing[1]} 0 ${themeCssVariables.spacing[2]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledCaptionArea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  min-height: 52px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

export const ManuscriptFigureListItem = ({
  figure,
  sections,
  peerIndex,
  peerCount,
  isAdding,
  tableStyle,
  onPersist,
  onMove,
  onPlotTable,
  onReplaceImage,
}: ManuscriptFigureListItemProps) => {
  const { enqueueSuccessSnackBar } = useSnackBar();
  const [tableDraft, setTableDraft] = useState(figure.tableData ?? '');
  const image = resolveFigureImage(figure);
  const sectionOptions: SelectOption<string>[] = [
    { value: UNASSIGNED_SECTION, label: 'End of document' },
    ...sections
      .filter((section) =>
        figure.placement === 'SUPPLEMENT'
          ? section.placement === 'SUPPLEMENT'
          : section.placement !== 'SUPPLEMENT',
      )
      .map((section) => ({
        value: section.id,
        label: section.name ?? section.sectionType ?? 'Section',
      })),
  ];

  const copyText = (value: string, message: string) => {
    void navigator.clipboard.writeText(value);
    enqueueSuccessSnackBar({ message });
  };

  return (
    <div>
      <StyledRow>
        <StyledMain>
          <StyledLabel>
            {figure.label} — {figure.name}
          </StyledLabel>
          <StyledMeta>
            [#{figure.refKey ?? figure.id}] ·{' '}
            {assetPlacementMarker(figure.refKey ?? figure.id)} ·{' '}
            {describeImageSource(figure)}
          </StyledMeta>
        </StyledMain>
        {image.kind !== 'none' ? (
          <StyledThumb src={image.src} alt={figure.altText ?? ''} />
        ) : null}
      </StyledRow>
      <StyledAssetEditor>
        <StyledInput
          aria-label={`${figure.label} name`}
          defaultValue={figure.name ?? ''}
          placeholder="Figure name"
          onBlur={(event) => onPersist({ name: event.target.value.trim() })}
        />
        <StyledCaptionArea
          aria-label={`${figure.label} caption`}
          defaultValue={figure.caption ?? figure.name ?? ''}
          placeholder="Full figure caption"
          onBlur={(event) => onPersist({ caption: event.target.value.trim() })}
        />
        <Select
          dropdownId={`figure-section-${figure.id}`}
          options={sectionOptions}
          value={figure.sectionId ?? UNASSIGNED_SECTION}
          onChange={(value) =>
            onPersist({
              sectionId: value === UNASSIGNED_SECTION ? null : value,
            })
          }
        />
        <Select
          dropdownId={`figure-placement-${figure.id}`}
          options={PLACEMENT_OPTIONS}
          value={figure.placement ?? 'MAIN'}
          onChange={(value) => onPersist({ placement: value, sectionId: null })}
        />
        <StyledActions>
          <Button
            title="Move up"
            variant="secondary"
            size="small"
            disabled={peerIndex === 0}
            onClick={() => onMove(-1)}
          />
          <Button
            title="Move down"
            variant="secondary"
            size="small"
            disabled={peerIndex === peerCount - 1}
            onClick={() => onMove(1)}
          />
          <Button
            title="Copy reference"
            variant="secondary"
            size="small"
            onClick={() =>
              copyText(
                `[#${figure.refKey ?? figure.id}]`,
                `Copied live reference for ${figure.label}`,
              )
            }
          />
          <Button
            title="Copy placement linker"
            variant="secondary"
            size="small"
            onClick={() =>
              copyText(
                assetPlacementMarker(figure.refKey ?? figure.id),
                `Copied placement linker for ${figure.label}`,
              )
            }
          />
        </StyledActions>
        {figure.assetKind !== 'TABLE' ? (
          <ManuscriptFigureMetadataFields
            figure={figure}
            onPersist={onPersist}
            onReplaceImage={onReplaceImage}
          />
        ) : null}
      </StyledAssetEditor>
      {figure.assetKind === 'TABLE' ? (
        <>
          <ManuscriptTableEditor
            markdown={tableDraft}
            tableStyle={tableStyle}
            onChange={setTableDraft}
          />
          <StyledActions>
            <Button
              title="Save table"
              variant="primary"
              accent="blue"
              size="small"
              disabled={tableDraft === (figure.tableData ?? '')}
              onClick={() => onPersist({ tableData: tableDraft })}
            />
            <Button
              title="Plot as chart"
              variant="secondary"
              size="small"
              disabled={isAdding}
              onClick={onPlotTable}
            />
          </StyledActions>
        </>
      ) : null}
    </div>
  );
};
