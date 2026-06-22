import { styled } from '@linaria/react';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { describeImageSource } from '@/local-db/research/manuscript/manuscriptImages';
import { numberAssets } from '@/local-db/research/manuscript/manuscriptNumbering';
import {
  type FigureLike,
  type JournalStyle,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// The figure manager: every figure/table/scheme with its live, journal-aware
// label (Figure 1 / Table 1 / Figure S1), and an "add figure" row supporting the
// modular image sources — paste a URL or upload a file (stored as a data-URL so
// it works with no backend).

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
  const { enqueueSuccessSnackBar } = useSnackBar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState('');
  const [assetKind, setAssetKind] = useState('FIGURE');
  const [placement, setPlacement] = useState('MAIN');
  const [imageUrl, setImageUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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
        orderIndex: figures.length,
      });
      enqueueSuccessSnackBar({ message: `Added ${assetKind.toLowerCase()}` });
      setCaption('');
      setImageUrl('');
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
      {numbered.map((figure) => (
        <StyledRow key={figure.id}>
          <StyledMain>
            <StyledLabel>
              {figure.label} — {figure.name}
            </StyledLabel>
            <StyledMeta>
              [#{figure.refKey ?? figure.id}] · {describeImageSource(figure)}
            </StyledMeta>
          </StyledMain>
        </StyledRow>
      ))}

      <StyledForm>
        <StyledInput
          placeholder="Caption / title"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
        />
        <StyledActions>
          <select
            value={assetKind}
            onChange={(event) => setAssetKind(event.target.value)}
          >
            <option value="FIGURE">Figure</option>
            <option value="TABLE">Table</option>
            <option value="SCHEME">Scheme</option>
            <option value="BOX">Box</option>
          </select>
          <select
            value={placement}
            onChange={(event) => setPlacement(event.target.value)}
          >
            <option value="MAIN">Main</option>
            <option value="SUPPLEMENT">Supplement</option>
          </select>
        </StyledActions>
        <StyledInput
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
        />
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
