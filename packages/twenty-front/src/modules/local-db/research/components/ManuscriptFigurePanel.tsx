import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptFigureCreateForm } from '@/local-db/research/components/ManuscriptFigureCreateForm';
import { ManuscriptFigureListItem } from '@/local-db/research/components/ManuscriptFigureListItem';
import {
  renderChartSvg,
  tableMarkdownToChartData,
} from '@/local-db/research/manuscript/manuscriptChart';
import { rasterizeSvgToPngDataUrl } from '@/local-db/research/manuscript/manuscriptChartImage';
import { numberAssets } from '@/local-db/research/manuscript/manuscriptNumbering';
import {
  type FigureLike,
  type JournalStyle,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// The figure manager: every figure/table/scheme with its live, journal-aware
// label (Figure 1 / Table 1 / Figure S1), and an "add figure" row supporting the
// modular image sources — paste a URL or upload a file (stored as a data-URL so
// it works with no backend).

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
  const [caption, setCaption] = useState('');
  const [assetKind, setAssetKind] = useState('FIGURE');
  const [placement, setPlacement] = useState('MAIN');
  const [imageUrl, setImageUrl] = useState('');
  const [tableData, setTableData] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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

  const replaceFigureImage = async (figure: FigureLike, file: File) => {
    const imageDataUrl = await fileToDataUrl(file);
    persistFigure(figure, {
      imageUrl: imageDataUrl,
      imageSource: 'UPLOAD',
    });
  };

  return (
    <StyledPanel>
      {numbered.map((figure) => {
        const peers = orderedPeers(figure);
        const peerIndex = peers.findIndex(
          (candidate) => candidate.id === figure.id,
        );
        return (
          <ManuscriptFigureListItem
            key={figure.id}
            figure={figure}
            sections={sections}
            peerIndex={peerIndex}
            peerCount={peers.length}
            isAdding={isAdding}
            onPersist={(values) => persistFigure(figure, values)}
            onMove={(direction) => moveFigure(figure, direction)}
            onPlotTable={() => {
              void plotExistingTable(figure);
            }}
            onReplaceImage={(file) => {
              void replaceFigureImage(figure, file);
            }}
          />
        );
      })}

      <ManuscriptFigureCreateForm
        caption={caption}
        assetKind={assetKind}
        placement={placement}
        imageUrl={imageUrl}
        tableData={tableData}
        isAdding={isAdding}
        onCaptionChange={setCaption}
        onAssetKindChange={setAssetKind}
        onPlacementChange={setPlacement}
        onImageUrlChange={setImageUrl}
        onTableDataChange={setTableData}
        onAdd={() => {
          void addFigure();
        }}
        onUpload={(file) => {
          void fileToDataUrl(file).then(addFigure);
        }}
      />
    </StyledPanel>
  );
};
