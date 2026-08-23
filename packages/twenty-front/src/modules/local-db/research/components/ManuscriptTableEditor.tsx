import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptTableView } from '@/local-db/research/components/ManuscriptTableView';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import {
  manuscriptTableHeaderRows,
  TABLE_SPAN_LEFT_MARKER,
  TABLE_SPAN_UP_MARKER,
} from '@/local-db/research/manuscript/manuscriptTableGrid';
import {
  gridToMarkdownTable,
  parseMarkdownTable,
} from '@/local-db/research/manuscript/manuscriptTables';

type ManuscriptTableEditorProps = {
  markdown: string;
  tableStyle: ManuscriptTableStyle;
  onChange: (markdown: string) => void;
};

const TABLE_STYLES: ManuscriptTableStyle[] = [
  'ACADEMIC',
  'GRID',
  'SHADED_HEADER',
  'BORDERLESS',
];

const StyledEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
`;

const StyledToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledModeToggle = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: inline-flex;
  padding: 2px;
  width: fit-content;
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  overflow-x: auto;
`;

const StyledRow = styled.div<{ columnCount: number }>`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  grid-template-columns: repeat(
    ${({ columnCount }) => columnCount},
    minmax(120px, 1fr)
  );
`;

const StyledCellInput = styled.input<{ isHeader: boolean; isMerged: boolean }>`
  background: ${({ isHeader, isMerged }) =>
    isMerged
      ? themeCssVariables.background.tertiary
      : isHeader
        ? themeCssVariables.background.secondary
        : themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${({ isHeader }) =>
    isHeader ? themeCssVariables.font.weight.semiBold : 'normal'};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledSource = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  min-height: 120px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledPreviewLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const displayStyleName = (tableStyle: ManuscriptTableStyle): string =>
  tableStyle
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

const editableGrid = (markdown: string): string[][] => {
  const parsedRows = parseMarkdownTable(markdown);
  if (parsedRows.length > 0) return parsedRows;
  return [
    ['', ''],
    ['', ''],
  ];
};

export const ManuscriptTableEditor = ({
  markdown,
  tableStyle,
  onChange,
}: ManuscriptTableEditorProps) => {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [isSourceVisible, setIsSourceVisible] = useState(false);
  const [previewStyle, setPreviewStyle] = useState(tableStyle);
  const [rows, setRows] = useState(() => editableGrid(markdown));
  const [headerRows, setHeaderRows] = useState(() =>
    manuscriptTableHeaderRows(markdown),
  );
  const [activeCell, setActiveCell] = useState<{
    row: number;
    column: number;
  } | null>(null);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));

  const updateGrid = (nextRows: string[][], nextHeaderRows = headerRows) => {
    const boundedHeaderRows = Math.min(
      Math.max(1, nextHeaderRows),
      Math.max(1, nextRows.length),
    );
    setRows(nextRows);
    setHeaderRows(boundedHeaderRows);
    onChange(gridToMarkdownTable(nextRows, boundedHeaderRows));
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    updateGrid(
      rows.map((row, currentRowIndex) =>
        Array.from({ length: columnCount }, (_, currentColumnIndex) =>
          currentRowIndex === rowIndex && currentColumnIndex === columnIndex
            ? value
            : (row[currentColumnIndex] ?? ''),
        ),
      ),
    );
  };

  const cellValue = (rowIndex: number, columnIndex: number): string =>
    rows[rowIndex]?.[columnIndex] ?? '';
  const isMergeMarker = (value: string): boolean =>
    value.trim() === TABLE_SPAN_LEFT_MARKER ||
    value.trim() === TABLE_SPAN_UP_MARKER;
  const activeValue =
    activeCell === null ? '' : cellValue(activeCell.row, activeCell.column);
  const canMergeLeft = activeCell !== null && activeCell.column > 0;
  const canMergeUp = activeCell !== null && activeCell.row > 0;

  return (
    <StyledEditor>
      <StyledModeToggle aria-label="Table view mode">
        <Button
          title="Edit"
          variant={mode === 'edit' ? 'secondary' : 'tertiary'}
          size="small"
          onClick={() => setMode('edit')}
        />
        <Button
          title="Preview"
          variant={mode === 'preview' ? 'secondary' : 'tertiary'}
          size="small"
          onClick={() => setMode('preview')}
        />
      </StyledModeToggle>

      {mode === 'edit' ? (
        <>
          <StyledToolbar>
            <Button
              title={isSourceVisible ? 'Grid editor' : 'Source'}
              variant="secondary"
              size="small"
              onClick={() => setIsSourceVisible((visible) => !visible)}
            />
            {!isSourceVisible ? (
              <>
                <Button
                  title="Add row"
                  variant="tertiary"
                  size="small"
                  onClick={() =>
                    updateGrid([
                      ...rows,
                      Array.from({ length: columnCount }, () => ''),
                    ])
                  }
                />
                <Button
                  title="Remove row"
                  variant="tertiary"
                  size="small"
                  disabled={rows.length <= 1}
                  onClick={() => updateGrid(rows.slice(0, -1))}
                />
                <Button
                  title="Add column"
                  variant="tertiary"
                  size="small"
                  onClick={() => updateGrid(rows.map((row) => [...row, '']))}
                />
                <Button
                  title="Remove column"
                  variant="tertiary"
                  size="small"
                  disabled={columnCount <= 1}
                  onClick={() =>
                    updateGrid(rows.map((row) => row.slice(0, columnCount - 1)))
                  }
                />
                <StyledPreviewLabel>Header rows</StyledPreviewLabel>
                <StyledSelect
                  aria-label="Header rows"
                  value={String(headerRows)}
                  onChange={(event) =>
                    updateGrid(rows, Number(event.target.value))
                  }
                >
                  {Array.from(
                    { length: Math.min(3, rows.length) },
                    (_, index) => (
                      <option key={index + 1} value={String(index + 1)}>
                        {index + 1}
                      </option>
                    ),
                  )}
                </StyledSelect>
                <Button
                  title="Merge left"
                  variant="tertiary"
                  size="small"
                  disabled={!canMergeLeft}
                  onClick={() =>
                    activeCell !== null &&
                    updateCell(
                      activeCell.row,
                      activeCell.column,
                      TABLE_SPAN_LEFT_MARKER,
                    )
                  }
                />
                <Button
                  title="Merge up"
                  variant="tertiary"
                  size="small"
                  disabled={!canMergeUp}
                  onClick={() =>
                    activeCell !== null &&
                    updateCell(
                      activeCell.row,
                      activeCell.column,
                      TABLE_SPAN_UP_MARKER,
                    )
                  }
                />
                <Button
                  title="Split"
                  variant="tertiary"
                  size="small"
                  disabled={activeCell === null || !isMergeMarker(activeValue)}
                  onClick={() =>
                    activeCell !== null &&
                    updateCell(activeCell.row, activeCell.column, '')
                  }
                />
              </>
            ) : null}
          </StyledToolbar>
          {!isSourceVisible ? (
            <StyledHint>
              Select a cell, then merge it into its neighbour — a merged cell
              shows {TABLE_SPAN_LEFT_MARKER} (continues left) or{' '}
              {TABLE_SPAN_UP_MARKER} (continues up), and exports as one spanning
              cell in Word, HTML, and JATS.
            </StyledHint>
          ) : null}
          {isSourceVisible ? (
            <StyledSource
              aria-label="Markdown table source"
              placeholder={'| Column A | Column B |\n| --- | --- |\n| 1 | 2 |'}
              value={markdown}
              onChange={(event) => {
                setRows(editableGrid(event.target.value));
                setHeaderRows(manuscriptTableHeaderRows(event.target.value));
                onChange(event.target.value);
              }}
            />
          ) : (
            <StyledGrid>
              {rows.map((row, rowIndex) => (
                <StyledRow key={`row-${rowIndex}`} columnCount={columnCount}>
                  {Array.from({ length: columnCount }, (_, columnIndex) => (
                    <StyledCellInput
                      key={`cell-${rowIndex}-${columnIndex}`}
                      aria-label={`${rowIndex < headerRows ? 'Header' : `Row ${rowIndex}`} column ${columnIndex + 1}`}
                      isHeader={rowIndex < headerRows}
                      isMerged={isMergeMarker(row[columnIndex] ?? '')}
                      value={row[columnIndex] ?? ''}
                      onFocus={() =>
                        setActiveCell({ row: rowIndex, column: columnIndex })
                      }
                      onChange={(event) =>
                        updateCell(rowIndex, columnIndex, event.target.value)
                      }
                    />
                  ))}
                </StyledRow>
              ))}
            </StyledGrid>
          )}
        </>
      ) : (
        <>
          <StyledToolbar>
            <StyledPreviewLabel>Preview style</StyledPreviewLabel>
            <StyledSelect
              aria-label="Table preview style"
              value={previewStyle}
              onChange={(event) =>
                setPreviewStyle(event.target.value as ManuscriptTableStyle)
              }
            >
              {TABLE_STYLES.map((styleOption) => (
                <option key={styleOption} value={styleOption}>
                  {displayStyleName(styleOption)}
                  {styleOption === tableStyle ? ' (export)' : ''}
                </option>
              ))}
            </StyledSelect>
          </StyledToolbar>
          <ManuscriptTableView markdown={markdown} tableStyle={previewStyle} />
        </>
      )}
    </StyledEditor>
  );
};
