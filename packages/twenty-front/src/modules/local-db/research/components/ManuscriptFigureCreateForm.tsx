import { styled } from '@linaria/react';
import { type ChangeEvent, useRef } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptDiagramEditor } from '@/local-db/research/components/ManuscriptDiagramEditor';
import { ManuscriptTableEditor } from '@/local-db/research/components/ManuscriptTableEditor';
import { type DatasetRecord } from '@/local-db/research/components/composer/manuscriptComposerData';
import {
  equationValidationError,
  ManuscriptEquationEditor,
} from '@/local-db/research/import-wizard/components/ManuscriptEquationEditor';
import { type ChartKind } from '@/local-db/research/manuscript/manuscriptChart';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { Select } from '@/ui/input/components/Select';

type ManuscriptFigureCreateFormProps = {
  caption: string;
  assetKind: string;
  placement: string;
  imageUrl: string;
  tableData: string;
  equationLatex: string;
  diagramSource: string;
  tableStyle: ManuscriptTableStyle;
  tableEditorVersion: number;
  chartKind: ChartKind;
  chartDatasets: DatasetRecord[];
  chartDatasetId: string | null;
  isAdding: boolean;
  onCaptionChange: (value: string) => void;
  onAssetKindChange: (value: string) => void;
  onPlacementChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onTableDataChange: (value: string) => void;
  onEquationLatexChange: (value: string) => void;
  onDiagramSourceChange: (value: string) => void;
  onChartKindChange: (value: ChartKind) => void;
  onChartDatasetChange: (value: string | null) => void;
  onAdd: () => void;
  onUpload: (file: File) => void;
};

const ASSET_KIND_OPTIONS: SelectOption<string>[] = [
  { value: 'FIGURE', label: 'Figure' },
  { value: 'TABLE', label: 'Table' },
  { value: 'CHART', label: 'Chart (from table data)' },
  { value: 'DIAGRAM', label: 'Diagram (Mermaid)' },
  { value: 'EQUATION', label: 'Equation' },
  { value: 'SCHEME', label: 'Scheme' },
  { value: 'BOX', label: 'Box' },
];

// The shared editor round-trips `$$…$$`; assets store the bare LaTeX body.
const stripEquationDelimiters = (markdown: string): string =>
  markdown.trim().replace(/^\$\$/, '').replace(/\$\$$/, '').trim();

const PLACEMENT_OPTIONS: SelectOption<string>[] = [
  { value: 'MAIN', label: 'Main' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

const CHART_KIND_OPTIONS: SelectOption<ChartKind>[] = [
  { value: 'bar', label: 'Bar chart' },
  { value: 'line', label: 'Line chart' },
];

const NO_DATASET = '__NONE__';

const StyledForm = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

export const ManuscriptFigureCreateForm = ({
  caption,
  assetKind,
  placement,
  imageUrl,
  tableData,
  equationLatex,
  diagramSource,
  tableStyle,
  tableEditorVersion,
  chartKind,
  chartDatasets,
  chartDatasetId,
  isAdding,
  onCaptionChange,
  onAssetKindChange,
  onPlacementChange,
  onImageUrlChange,
  onTableDataChange,
  onEquationLatexChange,
  onDiagramSourceChange,
  onChartKindChange,
  onChartDatasetChange,
  onAdd,
  onUpload,
}: ManuscriptFigureCreateFormProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) onUpload(file);
    event.target.value = '';
  };
  const datasetOptions: SelectOption<string>[] = [
    { value: NO_DATASET, label: 'Table below (no dataset link)' },
    ...chartDatasets.map((dataset) => ({
      value: dataset.id,
      label: dataset.name ?? 'Untitled dataset',
    })),
  ];
  const equationError = equationValidationError(equationLatex);
  const canAdd =
    caption.trim().length > 0 &&
    (assetKind !== 'EQUATION' || equationError === null) &&
    (assetKind !== 'DIAGRAM' || diagramSource.trim().length > 0);

  return (
    <StyledForm>
      <StyledInput
        placeholder="Caption / title"
        value={caption}
        onChange={(event) => onCaptionChange(event.target.value)}
      />
      <StyledActions>
        <Select
          dropdownId="figure-asset-kind-select"
          options={ASSET_KIND_OPTIONS}
          value={assetKind}
          onChange={onAssetKindChange}
        />
        <Select
          dropdownId="figure-placement-select"
          options={PLACEMENT_OPTIONS}
          value={placement}
          onChange={onPlacementChange}
        />
      </StyledActions>
      {assetKind === 'CHART' ? (
        <StyledActions>
          <Select
            dropdownId="chart-kind-select"
            options={CHART_KIND_OPTIONS}
            value={chartKind}
            onChange={(value) => onChartKindChange(value as ChartKind)}
          />
          <Select
            dropdownId="chart-dataset-select"
            options={datasetOptions}
            value={chartDatasetId ?? NO_DATASET}
            onChange={(value) =>
              onChartDatasetChange(value === NO_DATASET ? null : value)
            }
          />
        </StyledActions>
      ) : null}
      {assetKind === 'TABLE' || assetKind === 'CHART' ? (
        <ManuscriptTableEditor
          key={tableEditorVersion}
          markdown={tableData}
          tableStyle={tableStyle}
          onChange={onTableDataChange}
        />
      ) : assetKind === 'EQUATION' ? (
        <ManuscriptEquationEditor
          markdown={`$$${equationLatex}$$`}
          onChange={(markdown) =>
            onEquationLatexChange(stripEquationDelimiters(markdown))
          }
        />
      ) : assetKind === 'DIAGRAM' ? (
        <ManuscriptDiagramEditor
          source={diagramSource}
          onChange={onDiagramSourceChange}
        />
      ) : (
        <StyledInput
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={(event) => onImageUrlChange(event.target.value)}
        />
      )}
      <StyledActions>
        <Button
          title="Add"
          variant="primary"
          accent="blue"
          size="small"
          disabled={isAdding || !canAdd}
          onClick={onAdd}
        />
        {assetKind === 'EQUATION' || assetKind === 'DIAGRAM' ? null : (
          <Button
            title="Upload image…"
            variant="secondary"
            size="small"
            disabled={isAdding || !canAdd}
            onClick={() => fileInputRef.current?.click()}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleUpload}
        />
      </StyledActions>
    </StyledForm>
  );
};
