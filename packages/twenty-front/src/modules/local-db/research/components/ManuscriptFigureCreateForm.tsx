import { styled } from '@linaria/react';
import { type ChangeEvent, useRef } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { Select } from '@/ui/input/components/Select';

type ManuscriptFigureCreateFormProps = {
  caption: string;
  assetKind: string;
  placement: string;
  imageUrl: string;
  tableData: string;
  isAdding: boolean;
  onCaptionChange: (value: string) => void;
  onAssetKindChange: (value: string) => void;
  onPlacementChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onTableDataChange: (value: string) => void;
  onAdd: () => void;
  onUpload: (file: File) => void;
};

const ASSET_KIND_OPTIONS: SelectOption<string>[] = [
  { value: 'FIGURE', label: 'Figure' },
  { value: 'TABLE', label: 'Table' },
  { value: 'CHART', label: 'Chart (from table data)' },
  { value: 'SCHEME', label: 'Scheme' },
  { value: 'BOX', label: 'Box' },
];

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

const StyledTableArea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  min-height: 56px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  resize: vertical;
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
  isAdding,
  onCaptionChange,
  onAssetKindChange,
  onPlacementChange,
  onImageUrlChange,
  onTableDataChange,
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
        <StyledTableArea
          placeholder={'| Site | PM2.5 |\n| --- | --- |\n| A | 12 |'}
          value={tableData}
          onChange={(event) => onTableDataChange(event.target.value)}
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
        <Button
          title="Upload image…"
          variant="secondary"
          size="small"
          disabled={isAdding || caption.trim().length === 0}
          onClick={() => fileInputRef.current?.click()}
        />
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
