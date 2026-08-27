import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptDiagramEditor } from '@/local-db/research/components/ManuscriptDiagramEditor';
import { ManuscriptFigureMetadataFields } from '@/local-db/research/components/ManuscriptFigureMetadataFields';
import { ManuscriptTableEditor } from '@/local-db/research/components/ManuscriptTableEditor';
import {
  equationValidationError,
  ManuscriptEquationEditor,
} from '@/local-db/research/import-wizard/components/ManuscriptEquationEditor';
import {
  chartPngFromTable,
  deriveFigureNameFromCaption,
  syncFigureNameFromCaption,
} from '@/local-db/research/components/composer/manuscriptFigurePanelUtils';
import { assetPlacementMarker } from '@/local-db/research/manuscript/manuscriptAssetPlacement';
import { type ChartKind } from '@/local-db/research/manuscript/manuscriptChart';
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
  // The figures this one could be a panel of.
  panelParentOptions: SelectOption<string>[];
  onDelete: () => void;
  onPersist: (values: Record<string, unknown>) => void;
  onMove: (direction: -1 | 1) => void;
  onPlotTable: () => void;
  onReplaceImage: (file: File) => void;
  onChangeReferenceKey: (refKey: string) => void;
};

const PLACEMENT_OPTIONS: SelectOption<string>[] = [
  { value: 'MAIN', label: 'Main' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

const CHART_KIND_OPTIONS: SelectOption<ChartKind>[] = [
  { value: 'bar', label: 'Bar chart' },
  { value: 'line', label: 'Line chart' },
];

const UNASSIGNED_SECTION = '__UNASSIGNED__';
const NOT_A_PANEL = '__NOT_A_PANEL__';

// A chart figure is a FIGURE-kind record whose pixels we rendered from a data
// grid — those stay re-plottable instead of becoming a dead PNG.
// A diagram figure draws its picture from Mermaid source rather than pixels,
// so it stays editable as text instead of freezing into an image.
const isDiagramFigure = (figure: NumberedFigure): boolean =>
  figure.imageSource === 'DIAGRAM' ||
  (typeof figure.diagramSource === 'string' &&
    figure.diagramSource.trim().length > 0);

const isChartFigure = (figure: NumberedFigure): boolean =>
  figure.assetKind === 'FIGURE' &&
  (figure.imageSource === 'GENERATED' || figure.imageSource === 'DATASET') &&
  typeof figure.tableData === 'string' &&
  figure.tableData.trim().length > 0;

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
  panelParentOptions,
  onDelete,
  onPersist,
  onMove,
  onPlotTable,
  onReplaceImage,
  onChangeReferenceKey,
}: ManuscriptFigureExpandedEditorProps) => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [tableDraft, setTableDraft] = useState(figure.tableData ?? '');
  const [chartKindDraft, setChartKindDraft] = useState<ChartKind>('bar');
  const [isReplotting, setIsReplotting] = useState(false);
  const [diagramDraft, setDiagramDraft] = useState(figure.diagramSource ?? '');
  const [equationDraft, setEquationDraft] = useState(
    figure.equationLatex ?? '',
  );
  const [captionDraft, setCaptionDraft] = useState(
    figure.caption ?? figure.name ?? '',
  );
  const [nameDraft, setNameDraft] = useState(
    figure.name?.trim() || deriveFigureNameFromCaption(figure.caption ?? ''),
  );
  const [refKeyDraft, setRefKeyDraft] = useState(
    figure.refKey?.trim() || figure.id,
  );
  const refKeyIsValid = /^[A-Za-z0-9:._-]+$/.test(refKeyDraft.trim());
  const panelCount = (figure.panels ?? []).length;
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
  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      enqueueSuccessSnackBar({ message });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not copy to clipboard' });
    }
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
          Panel of
          <Select
            dropdownId={`figure-panel-parent-${figure.id}`}
            fullWidth
            options={[
              { value: NOT_A_PANEL, label: 'Not a panel' },
              ...panelParentOptions,
            ]}
            value={figure.parentFigureId ?? NOT_A_PANEL}
            onChange={(value) =>
              onPersist({
                parentFigureId: value === NOT_A_PANEL ? null : value,
              })
            }
          />
          <StyledHint>
            A panel takes a letter off the figure it belongs to — Figure 3 with
            panels 3a and 3b — and the figure sequence skips it.
          </StyledHint>
        </StyledSelectField>
        {panelCount > 0 ? (
          <StyledField>
            Panels per row
            <StyledHint>
              {panelCount} panel{panelCount === 1 ? '' : 's'}; blank puts them
              all in one row.
            </StyledHint>
            <StyledInput
              aria-label={`${figure.label} panels per row`}
              type="number"
              min={1}
              max={panelCount}
              defaultValue={figure.panelColumns ?? ''}
              onBlur={(event) => {
                const value = Number(event.target.value);
                onPersist({
                  panelColumns:
                    Number.isFinite(value) && value >= 1
                      ? Math.min(panelCount, Math.round(value))
                      : null,
                });
              }}
            />
          </StyledField>
        ) : null}
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
            <StyledField>
              Reference key
              <StyledHint>
                Updates matching cross-references and placement markers.
              </StyledHint>
              <StyledInput
                aria-label={`${figure.label} reference key`}
                aria-invalid={!refKeyIsValid}
                value={refKeyDraft}
                onChange={(event) => setRefKeyDraft(event.target.value)}
                onBlur={() => {
                  const nextKey = refKeyDraft.trim();
                  if (
                    refKeyIsValid &&
                    nextKey !== (figure.refKey?.trim() || figure.id)
                  ) {
                    onChangeReferenceKey(nextKey);
                  }
                }}
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
              void copyText(
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
              void copyText(
                assetPlacementMarker(figure.refKey ?? figure.id),
                `Copied placement linker for ${figure.label}`,
              )
            }
          />
          <Button
            title="Delete"
            variant="secondary"
            accent="danger"
            size="small"
            onClick={onDelete}
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
      {isChartFigure(figure) ? (
        <>
          <ManuscriptTableEditor
            markdown={tableDraft}
            tableStyle={tableStyle}
            onChange={setTableDraft}
          />
          <StyledActions>
            <Select
              dropdownId={`chart-kind-${figure.id}`}
              options={CHART_KIND_OPTIONS}
              value={chartKindDraft}
              onChange={(value) => setChartKindDraft(value as ChartKind)}
            />
            <Button
              title="Save data & re-plot"
              variant="primary"
              accent="blue"
              size="small"
              disabled={isReplotting}
              onClick={() => {
                setIsReplotting(true);
                void chartPngFromTable(
                  tableDraft,
                  chartKindDraft,
                  figure.caption ?? figure.name ?? undefined,
                )
                  .then((png) => {
                    if (png === null) {
                      enqueueErrorSnackBar({
                        message:
                          'No numeric columns to plot — keep at least one numeric column',
                      });
                      return;
                    }
                    onPersist({ tableData: tableDraft, imageUrl: png });
                    enqueueSuccessSnackBar({ message: 'Chart re-plotted' });
                  })
                  .finally(() => setIsReplotting(false));
              }}
            />
          </StyledActions>
        </>
      ) : null}
      {isDiagramFigure(figure) ? (
        <>
          <ManuscriptDiagramEditor
            source={diagramDraft}
            onChange={setDiagramDraft}
          />
          <StyledActions>
            <Button
              title="Save diagram"
              variant="primary"
              accent="blue"
              size="small"
              disabled={
                diagramDraft.trim() === (figure.diagramSource ?? '').trim()
              }
              onClick={() =>
                onPersist({
                  diagramSource: diagramDraft.trim(),
                  imageSource: 'DIAGRAM',
                  // A stale raster would win over the new source at export.
                  imageUrl: '',
                })
              }
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
              disabled={
                equationDraft === (figure.equationLatex ?? '') ||
                equationValidationError(equationDraft) !== null
              }
              onClick={() => onPersist({ equationLatex: equationDraft })}
            />
          </StyledActions>
        </>
      ) : null}
    </StyledExpanded>
  );
};
