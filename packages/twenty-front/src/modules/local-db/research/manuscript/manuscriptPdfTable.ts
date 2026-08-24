/* oxlint-disable twenty/no-hardcoded-colors -- rules printed on paper, not app
   chrome: these are the same greys the DOCX exporter writes into the Word
   table so the two outputs match. */
import { Text, View } from '@react-pdf/renderer';
import { createElement, type ReactNode } from 'react';

import { type ManuscriptTableStyle } from './manuscriptDocxTable';
import {
  manuscriptTablePlacement,
  type TableCellLike,
} from './manuscriptTableLayout';

// Tables for the PDF exporter.
//
// BlockNote's own table renderer lays every row out as a flat flex row of
// equal-status cells: it has no notion of colspan or rowspan, and it draws one
// fixed grid whatever the journal's table style says. A manuscript table has
// both — a header that spans three columns, a row label that spans two rows —
// and the merged version is the whole point of reading them out of the .docx.
// So the PDF gets its own mapping, tracking the real grid the way the DOCX one
// does and drawing the same four styles.

type TableRule = {
  // Border weight around the table, and between rows, in points.
  outer: number;
  inner: number;
  // Whether the style draws vertical lines between columns.
  vertical: boolean;
  // ACADEMIC rules the header off from the body and leaves the body open.
  innerOnlyUnderHeader: boolean;
  headerFill?: string;
};

const TABLE_RULES: Record<ManuscriptTableStyle, TableRule> = {
  ACADEMIC: {
    outer: 1.5,
    inner: 0.75,
    vertical: false,
    innerOnlyUnderHeader: true,
  },
  BORDERLESS: {
    outer: 0,
    inner: 0,
    vertical: false,
    innerOnlyUnderHeader: false,
  },
  GRID: {
    outer: 0.75,
    inner: 0.75,
    vertical: true,
    innerOnlyUnderHeader: false,
  },
  SHADED_HEADER: {
    outer: 0.75,
    inner: 0.75,
    vertical: true,
    innerOnlyUnderHeader: false,
    headerFill: '#dce6f1',
  },
};

const OUTER_COLOR = '#7f7f7f';
const INNER_COLOR = '#a6a6a6';

export type ManuscriptPdfTableOptions = {
  tableStyle: ManuscriptTableStyle;
  fontFamily: string | string[];
  tableFontSize: number;
  tableLineSpacing: number;
  // Column widths, already converted from the block model's CSS pixels into
  // points that fit the page.
  columnWidths: (columnWidths: (number | undefined)[]) => number[];
  // Cell text as react-pdf children, so sub- and superscript markers survive.
  renderText: (text: string, fontSize: number) => ReactNode[];
};

export const createManuscriptPdfTableMapping = ({
  tableStyle,
  fontFamily,
  tableFontSize,
  tableLineSpacing,
  columnWidths: resolveColumnWidths,
  renderText,
}: ManuscriptPdfTableOptions) => {
  const rule = TABLE_RULES[tableStyle];

  return (block: {
    id: string;
    content?: {
      rows?: { cells?: TableCellLike[] }[];
      columnWidths?: (number | undefined)[];
      headerRows?: number;
      headerCols?: number;
    };
  }): ReactNode => {
    const data = block.content;
    const rows = data?.rows ?? [];
    const widths = resolveColumnWidths(data?.columnWidths ?? []);
    const headerRows = data?.headerRows ?? 0;
    const headerColumns = data?.headerCols ?? 0;

    const { rows: placedRows, covered } = manuscriptTablePlacement(rows);

    const spannedWidth = (columnIndex: number, columnSpan: number): number =>
      widths
        .slice(columnIndex, columnIndex + columnSpan)
        .reduce((sum, width) => sum + width, 0);

    const renderCell = (
      key: string,
      columnIndex: number,
      columnSpan: number,
      rowIndex: number,
      text: string | null,
    ): ReactNode => {
      const isHeader = rowIndex < headerRows || columnIndex < headerColumns;
      return createElement(
        View,
        {
          key,
          style: {
            backgroundColor:
              isHeader && rule.headerFill !== undefined
                ? rule.headerFill
                : undefined,
            borderLeftColor: columnIndex === 0 ? OUTER_COLOR : INNER_COLOR,
            borderLeftWidth: rule.vertical
              ? columnIndex === 0
                ? rule.outer
                : rule.inner
              : 0,
            borderRightColor: OUTER_COLOR,
            borderRightWidth:
              rule.vertical && columnIndex + columnSpan >= widths.length
                ? rule.outer
                : 0,
            paddingHorizontal: 6,
            paddingVertical: 4,
            width: spannedWidth(columnIndex, columnSpan),
          },
        },
        text === null
          ? null
          : createElement(
              Text,
              {
                style: {
                  fontFamily,
                  fontSize: tableFontSize,
                  fontWeight: isHeader ? 'bold' : 'normal',
                  lineHeight: tableLineSpacing,
                  textAlign:
                    tableStyle === 'GRID' && !isHeader ? 'left' : 'center',
                },
              },
              ...renderText(text, tableFontSize),
            ),
      );
    };

    return createElement(
      View,
      { key: `table${block.id}`, style: { marginVertical: 6 } },
      ...placedRows.map((placed, rowIndex) => {
        const children: ReactNode[] = [];
        let columnIndex = 0;
        let cellIndex = 0;
        while (columnIndex < widths.length) {
          const continuation = covered.get(`${rowIndex}:${columnIndex}`);
          if (continuation !== undefined) {
            children.push(
              renderCell(
                `c${rowIndex}-${columnIndex}`,
                columnIndex,
                continuation.columnSpan,
                rowIndex,
                null,
              ),
            );
            columnIndex += continuation.columnSpan;
            continue;
          }
          const cell = placed[cellIndex];
          if (cell === undefined || cell.columnIndex !== columnIndex) break;
          children.push(
            renderCell(
              `c${rowIndex}-${columnIndex}`,
              columnIndex,
              cell.columnSpan,
              rowIndex,
              cell.text,
            ),
          );
          columnIndex += cell.columnSpan;
          cellIndex += 1;
        }
        // Horizontal rules belong to the row, not to its cells: cells in a row
        // are different heights, and a border on each of them draws a
        // staggered line rather than one rule across the table. A row that
        // continues a cell from above skips its rule, so the merge reads as
        // one box.
        const continues = [...covered.keys()].some((key) =>
          key.startsWith(`${rowIndex}:`),
        );
        const internalRule = continues
          ? 0
          : rule.innerOnlyUnderHeader
            ? rowIndex === headerRows
              ? rule.inner
              : 0
            : rule.inner;
        return createElement(
          View,
          {
            key: `r${rowIndex}`,
            wrap: false,
            style: {
              borderBottomColor: OUTER_COLOR,
              borderBottomWidth: rowIndex === rows.length - 1 ? rule.outer : 0,
              borderTopColor: rowIndex === 0 ? OUTER_COLOR : INNER_COLOR,
              borderTopWidth: rowIndex === 0 ? rule.outer : internalRule,
              flexDirection: 'row',
            },
          },
          ...children,
        );
      }),
    );
  };
};
