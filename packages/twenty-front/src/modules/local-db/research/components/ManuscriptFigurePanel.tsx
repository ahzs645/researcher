import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptFigureCreateForm } from '@/local-db/research/components/ManuscriptFigureCreateForm';
import { ManuscriptFigureListItem } from '@/local-db/research/components/ManuscriptFigureListItem';
import {
  chartPngFromTable,
  deriveFigureNameFromCaption,
  fileToDataUrl,
  slugifyFigureKey,
} from '@/local-db/research/components/composer/manuscriptFigurePanelUtils';
import { numberAssets } from '@/local-db/research/manuscript/manuscriptNumbering';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import {
  type FigureLike,
  type JournalStyle,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

const MANUSCRIPT_TABLE_STYLES: ManuscriptTableStyle[] = [
  'ACADEMIC',
  'GRID',
  'SHADED_HEADER',
  'BORDERLESS',
];

type ManuscriptFigurePanelProps = {
  manuscriptId: string;
  figures: FigureLike[];
  sections: SectionLike[];
  style: JournalStyle;
  onChanged: () => void;
  onSelectSection: (sectionId: string) => void;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

export const ManuscriptFigurePanel = ({
  manuscriptId,
  figures,
  sections,
  style,
  onChanged,
  onSelectSection,
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
  const [tableEditorVersion, setTableEditorVersion] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [expandedFigureId, setExpandedFigureId] = useState<string | null>(null);
  const tableStyle =
    MANUSCRIPT_TABLE_STYLES.find(
      (candidate) => candidate === style.tableStyle,
    ) ?? 'ACADEMIC';

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
      name: deriveFigureNameFromCaption(captionText) || 'Chart',
      manuscriptId,
      assetKind: 'FIGURE',
      placement,
      refKey:
        slugifyFigureKey(refKeyBase).slice(0, 24) || `chart-${Date.now()}`,
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
          slugifyFigureKey(trimmedCaption).slice(0, 24) ||
          `asset-${Date.now()}`;
        await createOneRecord({
          name:
            deriveFigureNameFromCaption(trimmedCaption) || 'Untitled figure',
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
      setTableEditorVersion((version) => version + 1);
      setIsCreateFormOpen(false);
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
      <Button
        title={isCreateFormOpen ? 'Cancel' : 'Add figure or table'}
        Icon={isCreateFormOpen ? undefined : IconPlus}
        variant="secondary"
        size="small"
        onClick={() => setIsCreateFormOpen((isOpen) => !isOpen)}
      />

      {isCreateFormOpen ? (
        <ManuscriptFigureCreateForm
          caption={caption}
          assetKind={assetKind}
          placement={placement}
          imageUrl={imageUrl}
          tableData={tableData}
          tableStyle={tableStyle}
          tableEditorVersion={tableEditorVersion}
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
      ) : null}

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
            isExpanded={expandedFigureId === figure.id}
            tableStyle={tableStyle}
            onToggle={() =>
              setExpandedFigureId((currentId) =>
                currentId === figure.id ? null : figure.id,
              )
            }
            onSelectSection={onSelectSection}
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
    </StyledPanel>
  );
};
