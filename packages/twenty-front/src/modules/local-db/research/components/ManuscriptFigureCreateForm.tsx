import { styled } from '@linaria/react';
import { type ChangeEvent, useRef } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptTableEditor } from '@/local-db/research/components/ManuscriptTableEditor';
import { ManuscriptEquationEditor } from '@/local-db/research/import-wizard/components/ManuscriptEquationEditor';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { Select } from '@/ui/input/components/Select';

type ManuscriptFigureCreateFormProps = {
  caption: string;
  assetKind: string;
  placement: string;
  imageUrl: string;
  tableData: string;
  equationLatex: string;
  tableStyle: ManuscriptTableStyle;
  tableEditorVersion: number;
  isAdding: boolean;
  onCaptionChange: (value: string) => void;
  onAssetKindChange: (value: string) => void;
  onPlacementChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onTableDataChange: (value: string) => void;
  onEquationLatexChange: (value: string) => void;
  onAdd: () => void;
  onUpload: (file: File) => void;
};

const ASSET_KIND_OPTIONS: SelectOption<string>[] = [
  { value: 'FIGURE', label: 'Figure' },
  { value: 'TABLE', label: 'Table' },
  { value: 'CHART', label: 'Chart (from table data)' },
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
  tableStyle,
  tableEditorVersion,
  isAdding,
  onCaptionChange,
  onAssetKindChange,
  onPlacementChange,
  onImageUrlChange,
  onTableDataChange,
  onEquationLatexChange,
  onAdd,
  onUpload,
}: ManuscriptFigureCreateFormProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) onUpload(file);
    event.target.value = '';
  };

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
          disabled={isAdding || caption.trim().length === 0}
          onClick={onAdd}
        />
        {assetKind === 'EQUATION' ? null : (
          <Button
            title="Upload image…"
            variant="secondary"
            size="small"
            disabled={isAdding || caption.trim().length === 0}
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
