import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/display';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptFigureCreateForm } from '@/local-db/research/components/ManuscriptFigureCreateForm';
import { ManuscriptFigureListItem } from '@/local-db/research/components/ManuscriptFigureListItem';
import {
  DATASET_GQL,
  type DatasetRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import {
  chartPngFromTable,
  deriveFigureNameFromCaption,
  fileToDataUrl,
  uniqueFigureKey,
} from '@/local-db/research/components/composer/manuscriptFigurePanelUtils';
import { type ChartKind } from '@/local-db/research/manuscript/manuscriptChart';
import {
  isFigurePanel,
  numberAssets,
} from '@/local-db/research/manuscript/manuscriptNumbering';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import {
  type FigureLike,
  type JournalStyle,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
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
  const { deleteOneRecord } = useDeleteOneRecord({
    objectNameSingular: 'figure',
  });
  const { records: datasetRecords } = useFindManyRecords({
    objectNameSingular: 'dataset',
    recordGqlFields: DATASET_GQL,
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueDialog } = useDialogManager();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [caption, setCaption] = useState('');
  const [assetKind, setAssetKind] = useState('FIGURE');
  const [placement, setPlacement] = useState('MAIN');
  const [imageUrl, setImageUrl] = useState('');
  const [tableData, setTableData] = useState('');
  const [equationLatex, setEquationLatex] = useState('');
  const [diagramSource, setDiagramSource] = useState('');
  const [chartKind, setChartKind] = useState<ChartKind>('bar');
  const [chartDatasetId, setChartDatasetId] = useState<string | null>(null);
  const [tableEditorVersion, setTableEditorVersion] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [expandedFigureId, setExpandedFigureId] = useState<string | null>(null);
  const tableStyle =
    MANUSCRIPT_TABLE_STYLES.find(
      (candidate) => candidate === style.tableStyle,
    ) ?? 'ACADEMIC';

  // Only datasets that actually carry a plottable grid are offered.
  const plottableDatasets = useMemo(
    () =>
      (datasetRecords as unknown as DatasetRecord[]).filter(
        (dataset) =>
          typeof dataset.dataGrid === 'string' &&
          dataset.dataGrid.trim().length > 0,
      ),
    [datasetRecords],
  );

  const numbered = useMemo(
    () => numberAssets(figures, style, sections),
    [figures, style, sections],
  );

  const persistFigure = (
    figure: FigureLike,
    values: Record<string, unknown>,
  ) => {
    void updateOneRecord({
      objectNameSingular: 'figure',
      idToUpdate: figure.id,
      updateOneRecordInput: values,
    })
      .then(onChanged)
      .catch(() =>
        enqueueErrorSnackBar({ message: 'Could not save figure changes' }),
      );
  };

  const changeFigureReferenceKey = (
    figure: FigureLike,
    nextReferenceKey: string,
  ) => {
    const currentReferenceKey = figure.refKey?.trim() || figure.id;
    if (
      figures.some(
        (candidate) =>
          candidate.id !== figure.id &&
          (candidate.refKey?.trim() || candidate.id) === nextReferenceKey,
      )
    ) {
      enqueueErrorSnackBar({ message: 'That reference key is already in use' });
      return;
    }
    const rewriteTokens = (content: string) =>
      content
        .replaceAll(`[#${currentReferenceKey}]`, `[#${nextReferenceKey}]`)
        .replaceAll(
          `[[asset:${currentReferenceKey}]]`,
          `[[asset:${nextReferenceKey}]]`,
        );
    const changedSections = sections.filter((section) =>
      (section.content ?? '').includes(currentReferenceKey),
    );
    void Promise.all([
      updateOneRecord({
        objectNameSingular: 'figure',
        idToUpdate: figure.id,
        updateOneRecordInput: { refKey: nextReferenceKey },
      }),
      ...changedSections.map((section) =>
        updateOneRecord({
          objectNameSingular: 'manuscriptSection',
          idToUpdate: section.id,
          updateOneRecordInput: {
            content: rewriteTokens(section.content ?? ''),
          },
        }),
      ),
    ])
      .then(onChanged)
      .then(() =>
        enqueueSuccessSnackBar({
          message: `Updated reference key to #${nextReferenceKey}`,
        }),
      )
      .catch(() =>
        enqueueErrorSnackBar({ message: 'Could not update reference key' }),
      );
  };

  // A panel moves among its siblings, which is what changes its letter; a
  // figure moves among the figures it shares a counter with.
  const orderedPeers = (figure: FigureLike) =>
    numbered.filter((candidate) =>
      isFigurePanel(figure)
        ? candidate.parentFigureId === figure.parentFigureId
        : !isFigurePanel(candidate) &&
          candidate.assetKind === figure.assetKind &&
          candidate.placement === figure.placement,
    );

  // What a figure can be made a panel of: any other picture figure that is not
  // itself a panel, so a panel of a panel — which nothing downstream would
  // know how to letter — cannot be asked for in the first place.
  const panelParentOptions = (figure: FigureLike): SelectOption<string>[] => {
    // A figure that already holds panels cannot become one.
    const hasPanels = figures.some(
      (candidate) => candidate.parentFigureId === figure.id,
    );
    if (hasPanels) return [];
    return numbered
      .filter(
        (candidate) =>
          candidate.id !== figure.id &&
          !isFigurePanel(candidate) &&
          candidate.assetKind !== 'TABLE' &&
          candidate.assetKind !== 'EQUATION',
      )
      .map((candidate) => ({
        value: candidate.id,
        label: `${candidate.label} · ${candidate.name ?? candidate.refKey ?? candidate.id}`,
      }));
  };

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
    ])
      .then(onChanged)
      .catch(() =>
        enqueueErrorSnackBar({ message: 'Could not reorder asset' }),
      );
  };

  const deleteFigure = (figure: FigureLike) => {
    const assetLabel = figure.assetKind?.toLowerCase() ?? 'asset';
    // A panel whose parent is gone has nothing to take a letter from, so it
    // goes back to being a figure of its own rather than disappearing — worth
    // saying before the delete, not after.
    const panelCount = figures.filter(
      (candidate) => candidate.parentFigureId === figure.id,
    ).length;
    enqueueDialog({
      title: `Delete ${assetLabel}?`,
      message: `Delete ${figure.name ?? `this ${assetLabel}`} permanently? Cross-reference tokens such as [#${figure.refKey ?? figure.id}] will remain as unresolved warnings.${
        panelCount === 0
          ? ''
          : ` Its ${panelCount} panel${panelCount === 1 ? '' : 's'} will become numbered figures of their own.`
      }`,
      buttons: [
        { title: 'Cancel' },
        {
          title: 'Delete',
          accent: 'danger',
          role: 'confirm',
          onClick: () =>
            void deleteOneRecord(figure.id)
              .then(onChanged)
              .then(() =>
                enqueueSuccessSnackBar({ message: 'Deleted figure or table' }),
              )
              .catch(() =>
                enqueueErrorSnackBar({
                  message: 'Could not delete figure or table',
                }),
              ),
        },
      ],
    });
  };

  // Create a chart figure from a Markdown data table: store it as a numbered
  // FIGURE (GENERATED source, or DATASET when plotting a dataset record) with
  // the rendered PNG, and keep the source table in `tableData` so it can be
  // re-plotted after edits.
  const createChartFigure = async (
    sourceTable: string,
    captionText: string,
    refKeyBase: string,
    orderIndex: number,
    options?: { kind?: ChartKind; datasetId?: string | null },
  ): Promise<boolean> => {
    const png = await chartPngFromTable(
      sourceTable,
      options?.kind ?? 'bar',
      captionText,
    );
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
      refKey: uniqueFigureKey(
        refKeyBase,
        figures.map((figure) => figure.refKey),
        `chart-${Date.now()}`,
      ),
      caption: captionText,
      imageUrl: png,
      imageSource: isDefined(options?.datasetId) ? 'DATASET' : 'GENERATED',
      tableData: sourceTable,
      ...(isDefined(options?.datasetId)
        ? { datasetId: options.datasetId }
        : {}),
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
          { kind: chartKind, datasetId: chartDatasetId },
        );
        if (!created) return;
        enqueueSuccessSnackBar({ message: 'Plotted chart from table' });
      } else {
        const refKey = uniqueFigureKey(
          trimmedCaption,
          figures.map((figure) => figure.refKey),
          `asset-${Date.now()}`,
        );
        // A diagram is a figure whose picture is drawn from Mermaid source at
        // export time, so it numbers and cross-references like any other.
        const isDiagram = assetKind === 'DIAGRAM';
        await createOneRecord({
          name:
            deriveFigureNameFromCaption(trimmedCaption) || 'Untitled figure',
          manuscriptId,
          assetKind: isDiagram ? 'FIGURE' : assetKind,
          placement,
          refKey,
          caption: trimmedCaption,
          imageUrl: dataUrl ?? imageUrl.trim(),
          imageSource: isDiagram
            ? 'DIAGRAM'
            : isDefined(dataUrl)
              ? 'UPLOAD'
              : imageUrl.trim().length > 0
                ? 'URL'
                : 'NONE',
          ...(assetKind === 'TABLE' ? { tableData: tableData.trim() } : {}),
          ...(assetKind === 'EQUATION'
            ? { equationLatex: equationLatex.trim() }
            : {}),
          ...(isDiagram ? { diagramSource: diagramSource.trim() } : {}),
          orderIndex: figures.length,
        });
        enqueueSuccessSnackBar({ message: `Added ${assetKind.toLowerCase()}` });
      }

      setCaption('');
      setImageUrl('');
      setTableData('');
      setEquationLatex('');
      setDiagramSource('');
      setChartDatasetId(null);
      setTableEditorVersion((version) => version + 1);
      setIsCreateFormOpen(false);
      onChanged();
    } catch {
      enqueueErrorSnackBar({
        message: `Could not add ${assetKind.toLowerCase()}`,
      });
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
        { kind: chartKind, datasetId: figure.datasetId ?? null },
      );
      if (created) {
        enqueueSuccessSnackBar({ message: 'Plotted chart from table' });
        onChanged();
      }
    } catch {
      enqueueErrorSnackBar({ message: 'Could not plot chart from table' });
    } finally {
      setIsAdding(false);
    }
  };

  const selectChartDataset = (datasetId: string | null) => {
    setChartDatasetId(datasetId);
    if (datasetId === null) return;
    const dataset = plottableDatasets.find(
      (candidate) => candidate.id === datasetId,
    );
    if (dataset === undefined) return;
    setTableData(dataset.dataGrid ?? '');
    setTableEditorVersion((version) => version + 1);
  };

  const replaceFigureImage = async (figure: FigureLike, file: File) => {
    try {
      const imageDataUrl = await fileToDataUrl(file);
      persistFigure(figure, {
        imageUrl: imageDataUrl,
        imageSource: 'UPLOAD',
      });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not replace figure image' });
    }
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
          equationLatex={equationLatex}
          diagramSource={diagramSource}
          tableStyle={tableStyle}
          tableEditorVersion={tableEditorVersion}
          chartKind={chartKind}
          chartDatasets={plottableDatasets}
          chartDatasetId={chartDatasetId}
          isAdding={isAdding}
          onCaptionChange={setCaption}
          onAssetKindChange={setAssetKind}
          onPlacementChange={setPlacement}
          onImageUrlChange={setImageUrl}
          onTableDataChange={setTableData}
          onEquationLatexChange={setEquationLatex}
          onDiagramSourceChange={setDiagramSource}
          onChartKindChange={setChartKind}
          onChartDatasetChange={selectChartDataset}
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
            panelParentOptions={panelParentOptions(figure)}
            onToggle={() =>
              setExpandedFigureId((currentId) =>
                currentId === figure.id ? null : figure.id,
              )
            }
            onSelectSection={onSelectSection}
            onPersist={(values) => persistFigure(figure, values)}
            onDelete={() => deleteFigure(figure)}
            onMove={(direction) => moveFigure(figure, direction)}
            onPlotTable={() => {
              void plotExistingTable(figure);
            }}
            onReplaceImage={(file) => {
              void replaceFigureImage(figure, file);
            }}
            onChangeReferenceKey={(refKey) =>
              changeFigureReferenceKey(figure, refKey)
            }
          />
        );
      })}
    </StyledPanel>
  );
};
