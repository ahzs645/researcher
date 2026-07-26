import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptFigureMetadataFields } from '@/local-db/research/components/ManuscriptFigureMetadataFields';
import { ManuscriptTableEditor } from '@/local-db/research/components/ManuscriptTableEditor';
import { ManuscriptEquationEditor } from '@/local-db/research/import-wizard/components/ManuscriptEquationEditor';
import {
  deriveFigureNameFromCaption,
  syncFigureNameFromCaption,
} from '@/local-db/research/components/composer/manuscriptFigurePanelUtils';
import { assetPlacementMarker } from '@/local-db/research/manuscript/manuscriptAssetPlacement';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import {
  type NumberedFigure,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';

type ManuscriptFigureExpandedEditorProps = {
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

const StyledExpanded = styled.div`
  background: ${themeCssVariables.background.primary};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledAssetEditor = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr);

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSelectField = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledWideField = styled(StyledField)`
  grid-column: 1 / -1;
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

const StyledDetails = styled.details`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  grid-column: 1 / -1;

  & > summary {
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    font-size: ${themeCssVariables.font.size.sm};
    font-weight: ${themeCssVariables.font.weight.medium};
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  }
`;

const StyledDetailsContent = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0 ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[3]};

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptFigureExpandedEditor = ({
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
}: ManuscriptFigureExpandedEditorProps) => {
  const { enqueueSuccessSnackBar } = useSnackBar();
  const [tableDraft, setTableDraft] = useState(figure.tableData ?? '');
  const [equationDraft, setEquationDraft] = useState(
    figure.equationLatex ?? '',
  );
  const [captionDraft, setCaptionDraft] = useState(
    figure.caption ?? figure.name ?? '',
  );
  const [nameDraft, setNameDraft] = useState(
    figure.name?.trim() || deriveFigureNameFromCaption(figure.caption ?? ''),
  );
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
  const updateCaptionDraft = (nextCaption: string) => {
    setNameDraft((currentName) =>
      syncFigureNameFromCaption({
        currentName,
        previousCaption: captionDraft,
        nextCaption,
      }),
    );
    setCaptionDraft(nextCaption);
  };
  const persistCaption = () => {
    const caption = captionDraft.trim();
    const name = syncFigureNameFromCaption({
      currentName: nameDraft,
      previousCaption: captionDraft,
      nextCaption: caption,
    });

    setCaptionDraft(caption);
    setNameDraft(name);
    onPersist({ caption, name });
  };
  const persistName = () => {
    const name = nameDraft.trim();
    setNameDraft(name);
    onPersist({ name });
  };

  return (
    <StyledExpanded>
      <StyledAssetEditor>
        <StyledWideField>
          Caption
          <StyledCaptionArea
            aria-label={`${figure.label} caption`}
            value={captionDraft}
            placeholder="Full figure caption"
            onChange={(event) => updateCaptionDraft(event.target.value)}
            onBlur={persistCaption}
          />
        </StyledWideField>
        <StyledSelectField>
          Section
          <Select
            dropdownId={`figure-section-${figure.id}`}
            fullWidth
            options={sectionOptions}
            value={figure.sectionId ?? UNASSIGNED_SECTION}
            onChange={(value) =>
              onPersist({
                sectionId: value === UNASSIGNED_SECTION ? null : value,
              })
            }
          />
        </StyledSelectField>
        <StyledSelectField>
          Placement
          <Select
            dropdownId={`figure-placement-${figure.id}`}
            fullWidth
            options={PLACEMENT_OPTIONS}
            value={figure.placement ?? 'MAIN'}
            onChange={(value) =>
              onPersist({ placement: value, sectionId: null })
            }
          />
        </StyledSelectField>
        <StyledDetails>
          <summary>Details</summary>
          <StyledDetailsContent>
            <StyledField>
              Name
              <StyledHint>
                Short name (defaults to the caption&apos;s first words)
              </StyledHint>
              <StyledInput
                aria-label={`${figure.label} name`}
                value={nameDraft}
                placeholder="Figure name"
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={persistName}
              />
            </StyledField>
            {figure.assetKind !== 'TABLE' ? (
              <ManuscriptFigureMetadataFields
                figure={figure}
                onPersist={onPersist}
                onReplaceImage={onReplaceImage}
              />
            ) : null}
          </StyledDetailsContent>
        </StyledDetails>
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
      {figure.assetKind === 'EQUATION' ? (
        <>
          <ManuscriptEquationEditor
            markdown={`$$${equationDraft}$$`}
            onChange={(markdown) =>
              setEquationDraft(
                markdown
                  .trim()
                  .replace(/^\$\$/, '')
                  .replace(/\$\$$/, '')
                  .trim(),
              )
            }
          />
          <StyledActions>
            <Button
              title="Save equation"
              variant="primary"
              accent="blue"
              size="small"
              disabled={equationDraft === (figure.equationLatex ?? '')}
              onClick={() => onPersist({ equationLatex: equationDraft })}
            />
          </StyledActions>
        </>
      ) : null}
    </StyledExpanded>
  );
};
