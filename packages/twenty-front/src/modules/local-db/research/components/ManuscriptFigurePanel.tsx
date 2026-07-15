import { styled } from '@linaria/react';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  renderChartSvg,
  tableMarkdownToChartData,
} from '@/local-db/research/manuscript/manuscriptChart';
import { rasterizeSvgToPngDataUrl } from '@/local-db/research/manuscript/manuscriptChartImage';
import { assetPlacementMarker } from '@/local-db/research/manuscript/manuscriptAssetPlacement';
import {
  describeImageSource,
  resolveFigureImage,
} from '@/local-db/research/manuscript/manuscriptImages';
import { numberAssets } from '@/local-db/research/manuscript/manuscriptNumbering';
import {
  type FigureLike,
  type JournalStyle,
  type SectionLike,
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
  { value: 'CHART', label: 'Chart (from table data)' },
  { value: 'SCHEME', label: 'Scheme' },
  { value: 'BOX', label: 'Box' },
];

const CHART_WIDTH = 640;
const CHART_HEIGHT = 400;

// Render a Markdown data table to a PNG data-URL chart, or null when it has no
// numeric columns to plot. Used both by the add form and the per-table action.
const chartPngFromTable = async (
  tableMarkdown: string,
): Promise<string | null> => {
  const data = tableMarkdownToChartData(tableMarkdown);
  if (data === null) return null;
  const svg = renderChartSvg(data, {
    kind: 'bar',
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
  });
  return rasterizeSvgToPngDataUrl(svg, CHART_WIDTH, CHART_HEIGHT);
};

const PLACEMENT_OPTIONS: SelectOption<string>[] = [
  { value: 'MAIN', label: 'Main' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

type ManuscriptFigurePanelProps = {
  manuscriptId: string;
  figures: FigureLike[];
  sections: SectionLike[];
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

const StyledAssetEditor = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr);
  padding: ${themeCssVariables.spacing[1]} 0 ${themeCssVariables.spacing[2]};
`;

const UNASSIGNED_SECTION = '__UNASSIGNED__';

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
  sections,
  style,
  onChanged,
}: ManuscriptFigurePanelProps) => {
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'figure',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
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

  const persistFigure = (
    figure: FigureLike,
    values: Record<string, unknown>,
  ) => {
    void updateOneRecord({
      objectNameSingular: 'figure',
      idToUpdate: figure.id,
      updateOneRecordInput: values,
    }).then(onChanged);
  };

  const orderedPeers = (figure: FigureLike) =>
    numbered.filter(
      (candidate) =>
        candidate.assetKind === figure.assetKind &&
        candidate.placement === figure.placement,
    );

  const moveFigure = (figure: FigureLike, direction: -1 | 1) => {
    const peers = orderedPeers(figure);
    const index = peers.findIndex((candidate) => candidate.id === figure.id);
    const adjacent = peers[index + direction];
    if (!isDefined(adjacent)) return;
    const figureOrder =
      figure.orderIndex ??
      numbered.findIndex((candidate) => candidate.id === figure.id);
    const adjacentOrder =
      adjacent.orderIndex ??
      numbered.findIndex((candidate) => candidate.id === adjacent.id);
    void Promise.all([
      updateOneRecord({
        objectNameSingular: 'figure',
        idToUpdate: figure.id,
        updateOneRecordInput: { orderIndex: adjacentOrder },
      }),
      updateOneRecord({
        objectNameSingular: 'figure',
        idToUpdate: adjacent.id,
        updateOneRecordInput: { orderIndex: figureOrder },
      }),
    ]).then(onChanged);
  };

  // Create a chart figure from a Markdown data table: store it as a numbered
  // FIGURE (GENERATED source) with the rendered PNG, and keep the source table
  // in `tableData` so it can be re-plotted after edits.
  const createChartFigure = async (
    sourceTable: string,
    captionText: string,
    refKeyBase: string,
    orderIndex: number,
  ): Promise<boolean> => {
    const png = await chartPngFromTable(sourceTable);
    if (png === null) {
      enqueueErrorSnackBar({
        message: 'No numeric columns to plot — add a data table first',
      });
      return false;
    }
    await createOneRecord({
      name: captionText || 'Chart',
      manuscriptId,
      assetKind: 'FIGURE',
      placement,
      refKey: slugify(refKeyBase).slice(0, 24) || `chart-${Date.now()}`,
      caption: captionText,
      imageUrl: png,
      imageSource: 'GENERATED',
      tableData: sourceTable,
      orderIndex,
    });
    return true;
  };

  const addFigure = async (dataUrl?: string) => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      const trimmedCaption = caption.trim();

      if (assetKind === 'CHART') {
        const created = await createChartFigure(
          tableData.trim(),
          trimmedCaption,
          trimmedCaption || 'chart',
          figures.length,
        );
        if (!created) return;
        enqueueSuccessSnackBar({ message: 'Plotted chart from table' });
      } else {
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
      }

      setCaption('');
      setImageUrl('');
      setTableData('');
      onChanged();
    } finally {
      setIsAdding(false);
    }
  };

  // Plot an existing table figure as a new chart figure.
  const plotExistingTable = async (figure: FigureLike) => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      const created = await createChartFigure(
        figure.tableData ?? '',
        `Chart — ${figure.caption || figure.name || 'table'}`,
        `chart-${figure.refKey ?? figure.id}`,
        figures.length,
      );
      if (created) {
        enqueueSuccessSnackBar({ message: 'Plotted chart from table' });
        onChanged();
      }
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
        const peers = orderedPeers(figure);
        const peerIndex = peers.findIndex(
          (candidate) => candidate.id === figure.id,
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
        return (
          <div key={figure.id}>
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
                onBlur={(event) =>
                  persistFigure(figure, { name: event.target.value.trim() })
                }
              />
              <StyledCaptionArea
                aria-label={`${figure.label} caption`}
                defaultValue={figure.caption ?? figure.name ?? ''}
                placeholder="Full figure caption"
                onBlur={(event) =>
                  persistFigure(figure, { caption: event.target.value.trim() })
                }
              />
              <Select
                dropdownId={`figure-section-${figure.id}`}
                options={sectionOptions}
                value={figure.sectionId ?? UNASSIGNED_SECTION}
                onChange={(value) =>
                  persistFigure(figure, {
                    sectionId:
                      value === UNASSIGNED_SECTION ? null : value,
                  })
                }
              />
              <Select
                dropdownId={`figure-placement-${figure.id}`}
                options={PLACEMENT_OPTIONS}
                value={figure.placement ?? 'MAIN'}
                onChange={(value) =>
                  persistFigure(figure, {
                    placement: value,
                    sectionId: null,
                  })
                }
              />
              <StyledActions>
                <Button
                  title="Move up"
                  variant="secondary"
                  size="small"
                  disabled={peerIndex === 0}
                  onClick={() => moveFigure(figure, -1)}
                />
                <Button
                  title="Move down"
                  variant="secondary"
                  size="small"
                  disabled={peerIndex === peers.length - 1}
                  onClick={() => moveFigure(figure, 1)}
                />
                <Button
                  title="Copy reference"
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `[#${figure.refKey ?? figure.id}]`,
                    );
                    enqueueSuccessSnackBar({
                      message: `Copied live reference for ${figure.label}`,
                    });
                  }}
                />
                <Button
                  title="Copy placement linker"
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      assetPlacementMarker(figure.refKey ?? figure.id),
                    );
                    enqueueSuccessSnackBar({
                      message: `Copied placement linker for ${figure.label}`,
                    });
                  }}
                />
              </StyledActions>
            </StyledAssetEditor>
            {figure.assetKind === 'TABLE' ? (
              <>
                <StyledTableArea
                  defaultValue={figure.tableData ?? ''}
                  placeholder={'| Col A | Col B |\n| --- | --- |\n| 1 | 2 |'}
                  onBlur={(event) => persistTable(figure, event.target.value)}
                />
                <StyledActions>
                  <Button
                    title="Plot as chart"
                    variant="secondary"
                    size="small"
                    disabled={isAdding}
                    onClick={() => plotExistingTable(figure)}
                  />
                </StyledActions>
              </>
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
        {assetKind === 'TABLE' || assetKind === 'CHART' ? (
          <StyledTableArea
            placeholder={'| Site | PM2.5 |\n| --- | --- |\n| A | 12 |'}
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
