import { styled } from '@linaria/react';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  describeImageSource,
  resolveFigureImage,
} from '@/local-db/research/manuscript/manuscriptImages';
import { numberAssets } from '@/local-db/research/manuscript/manuscriptNumbering';
import {
  type FigureLike,
  type JournalStyle,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';

// The figure manager: every figure/table/scheme with its live, journal-aware
// label (Figure 1 / Table 1 / Figure S1), and an "add figure" row supporting the
// modular image sources — paste a URL or upload a file (stored as a data-URL so
// it works with no backend).

const ASSET_KIND_OPTIONS: SelectOption<string>[] = [
  { value: 'FIGURE', label: 'Figure' },
  { value: 'TABLE', label: 'Table' },
  { value: 'SCHEME', label: 'Scheme' },
  { value: 'BOX', label: 'Box' },
];

const PLACEMENT_OPTIONS: SelectOption<string>[] = [
  { value: 'MAIN', label: 'Main' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

type ManuscriptFigurePanelProps = {
  manuscriptId: string;
  figures: FigureLike[];
  style: JournalStyle;
  onChanged: () => void;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

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

const StyledTableArea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  margin-top: ${themeCssVariables.spacing[1]};
  min-height: 56px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  resize: vertical;
  width: 100%;
`;

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
  gap: ${themeCssVariables.spacing[2]};
`;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const ManuscriptFigurePanel = ({
  manuscriptId,
  figures,
  style,
  onChanged,
}: ManuscriptFigurePanelProps) => {
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'figure',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar } = useSnackBar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState('');
  const [assetKind, setAssetKind] = useState('FIGURE');
  const [placement, setPlacement] = useState('MAIN');
  const [imageUrl, setImageUrl] = useState('');
  const [tableData, setTableData] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Persist an edited table grid (Markdown table) for an existing figure.
  const persistTable = (figure: FigureLike, value: string) => {
    if ((figure.tableData ?? '') === value) return;
    void updateOneRecord({
      objectNameSingular: 'figure',
      idToUpdate: figure.id,
      updateOneRecordInput: { tableData: value },
    });
    onChanged();
  };

  // Live numbering — the same pure function the exporter uses, so the panel
  // shows exactly the labels the paper will carry.
  const numbered = useMemo(
    () => numberAssets(figures, style),
    [figures, style],
  );

  const addFigure = async (dataUrl?: string) => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      const trimmedCaption = caption.trim();
      const refKey =
        slugify(trimmedCaption).slice(0, 24) || `asset-${Date.now()}`;
      await createOneRecord({
        name: trimmedCaption || 'Untitled figure',
        manuscriptId,
        assetKind,
        placement,
        refKey,
        caption: trimmedCaption,
        imageUrl: dataUrl ?? imageUrl.trim(),
        imageSource: isDefined(dataUrl)
          ? 'UPLOAD'
          : imageUrl.trim().length > 0
            ? 'URL'
            : 'NONE',
        ...(assetKind === 'TABLE' ? { tableData: tableData.trim() } : {}),
        orderIndex: figures.length,
      });
      enqueueSuccessSnackBar({ message: `Added ${assetKind.toLowerCase()}` });
      setCaption('');
      setImageUrl('');
      setTableData('');
      onChanged();
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isDefined(file)) return;
    const dataUrl = await fileToDataUrl(file);
    await addFigure(dataUrl);
    if (isDefined(fileInputRef.current)) fileInputRef.current.value = '';
  };

  return (
    <StyledPanel>
      {numbered.map((figure) => {
        const image = resolveFigureImage(figure);
        return (
          <div key={figure.id}>
            <StyledRow>
              <StyledMain>
                <StyledLabel>
                  {figure.label} — {figure.name}
                </StyledLabel>
                <StyledMeta>
                  [#{figure.refKey ?? figure.id}] ·{' '}
                  {describeImageSource(figure)}
                </StyledMeta>
              </StyledMain>
              {image.kind !== 'none' ? (
                <StyledThumb src={image.src} alt={figure.altText ?? ''} />
              ) : null}
            </StyledRow>
            {figure.assetKind === 'TABLE' ? (
              <StyledTableArea
                defaultValue={figure.tableData ?? ''}
                placeholder={'| Col A | Col B |\n| --- | --- |\n| 1 | 2 |'}
                onBlur={(event) => persistTable(figure, event.target.value)}
              />
            ) : null}
          </div>
        );
      })}

      <StyledForm>
        <StyledInput
          placeholder="Caption / title"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
        />
        <StyledActions>
          <Select
            dropdownId="figure-asset-kind-select"
            options={ASSET_KIND_OPTIONS}
            value={assetKind}
            onChange={setAssetKind}
          />
          <Select
            dropdownId="figure-placement-select"
            options={PLACEMENT_OPTIONS}
            value={placement}
            onChange={setPlacement}
          />
        </StyledActions>
        {assetKind === 'TABLE' ? (
          <StyledTableArea
            placeholder={'| Col A | Col B |\n| --- | --- |\n| 1 | 2 |'}
            value={tableData}
            onChange={(event) => setTableData(event.target.value)}
          />
        ) : (
          <StyledInput
            placeholder="Image URL (optional)"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
          />
        )}
        <StyledActions>
          <Button
            title="Add"
            variant="primary"
            accent="blue"
            size="small"
            disabled={isAdding || caption.trim().length === 0}
            onClick={() => addFigure()}
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
    </StyledPanel>
  );
};
