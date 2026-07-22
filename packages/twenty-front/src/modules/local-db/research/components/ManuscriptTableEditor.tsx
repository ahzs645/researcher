import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptTableView } from '@/local-db/research/components/ManuscriptTableView';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
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

const StyledCellInput = styled.input<{ isHeader: boolean }>`
  background: ${({ isHeader }) =>
    isHeader
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
  const [isSourceVisible, setIsSourceVisible] = useState(false);
  const [previewStyle, setPreviewStyle] = useState(tableStyle);
  const rows = editableGrid(markdown);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));

  const updateGrid = (nextRows: string[][]) =>
    onChange(gridToMarkdownTable(nextRows));

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

  return (
    <StyledEditor>
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
          </>
        ) : null}
      </StyledToolbar>

      {isSourceVisible ? (
        <StyledSource
          aria-label="Markdown table source"
          placeholder={'| Column A | Column B |\n| --- | --- |\n| 1 | 2 |'}
          value={markdown}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <StyledGrid>
          {rows.map((row, rowIndex) => (
            <StyledRow key={`row-${rowIndex}`} columnCount={columnCount}>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <StyledCellInput
                  key={`cell-${rowIndex}-${columnIndex}`}
                  aria-label={`${rowIndex === 0 ? 'Header' : `Row ${rowIndex}`} column ${columnIndex + 1}`}
                  isHeader={rowIndex === 0}
                  value={row[columnIndex] ?? ''}
                  onChange={(event) =>
                    updateCell(rowIndex, columnIndex, event.target.value)
                  }
                />
              ))}
            </StyledRow>
          ))}
        </StyledGrid>
      )}

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
    </StyledEditor>
  );
};
