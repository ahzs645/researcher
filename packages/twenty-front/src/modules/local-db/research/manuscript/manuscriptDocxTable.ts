import { mapTableCell } from '@blocknote/core';
import type { docxDefaultSchemaMappings } from '@blocknote/xl-docx-exporter';
import {
  AlignmentType,
  BorderStyle,
  LineRuleType,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ITableBordersOptions,
} from 'docx';

import {
  hasManuscriptScripts,
  manuscriptScriptSegments,
} from './manuscriptScripts';

export type ManuscriptTableStyle =
  | 'ACADEMIC'
  | 'GRID'
  | 'SHADED_HEADER'
  | 'BORDERLESS';

const noBorder = { style: BorderStyle.NIL } as const;
const thinGrayBorder = {
  style: BorderStyle.SINGLE,
  color: 'A6A6A6',
  size: 4,
} as const;
const mediumGrayBorder = {
  style: BorderStyle.SINGLE,
  color: '7F7F7F',
  size: 8,
} as const;
const thinGridBorder = {
  style: BorderStyle.SINGLE,
  color: '808080',
  size: 4,
} as const;

const bordersForStyle = (
  tableStyle: ManuscriptTableStyle,
): ITableBordersOptions => {
  if (tableStyle === 'BORDERLESS') {
    return {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder,
    };
  }
  if (tableStyle === 'ACADEMIC') {
    return {
      top: mediumGrayBorder,
      bottom: mediumGrayBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: thinGrayBorder,
      insideVertical: noBorder,
    };
  }
  return {
    top: thinGridBorder,
    bottom: thinGridBorder,
    left: thinGridBorder,
    right: thinGridBorder,
    insideHorizontal: thinGridBorder,
    insideVertical: thinGridBorder,
  };
};

export const createManuscriptTableMapping =
  (
    tableStyle: ManuscriptTableStyle,
    fontFamily: string,
    tableFontSize: number,
    tableLineSpacing: number,
  ): typeof docxDefaultSchemaMappings.blockMapping.table =>
  (block, exporter) => {
    const data = block.content;
    const columnWidths = data.columnWidths.map(
      (width) => (width ?? 120) * 0.75 * 20,
    );
    const headerRows = new Array(data.headerRows ?? 0).fill(true);
    const headerColumns = new Array(data.headerCols ?? 0).fill(true);
    const centered = tableStyle !== 'GRID';
    const occupied = new Set<string>();

    return new Table({
      layout: TableLayoutType.FIXED,
      width: {
        size: columnWidths.reduce((sum, width) => sum + width, 0),
        type: WidthType.DXA,
      },
      columnWidths,
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      borders: bordersForStyle(tableStyle),
      // A cell that spans rows is omitted from the rows it covers, so the
      // position of every later cell has to be tracked against the real grid —
      // using the array index would put merged cells in the wrong column and
      // give them the wrong width.
      rows: data.rows.map((row, rowIndex) => {
        const isHeaderRow = headerRows[rowIndex] === true;
        let cursor = 0;
        return new TableRow({
          tableHeader: isHeaderRow,
          cantSplit: true,
          children: row.cells.map((cell) => {
            const mappedCell = mapTableCell(cell);
            while (occupied.has(`${rowIndex}:${cursor}`)) cursor += 1;
            const columnIndex = cursor;
            const columnSpan = mappedCell.props.colspan ?? 1;
            const rowSpan = mappedCell.props.rowspan ?? 1;
            for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
              for (let c = columnIndex; c < columnIndex + columnSpan; c += 1) {
                occupied.add(`${r}:${c}`);
              }
            }
            cursor = columnIndex + columnSpan;
            const isHeader = isHeaderRow || headerColumns[columnIndex] === true;
            const width = columnWidths
              .slice(columnIndex, columnIndex + columnSpan)
              .reduce((sum, value) => sum + value, 0);
            const cellText = mappedCell.content
              .map((content) =>
                'text' in content && typeof content.text === 'string'
                  ? content.text
                  : '',
              )
              .join('');
            return new TableCell({
              width: { size: width, type: WidthType.DXA },
              columnSpan,
              rowSpan: mappedCell.props.rowspan,
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              ...(tableStyle === 'SHADED_HEADER' && isHeader
                ? {
                    shading: {
                      type: ShadingType.CLEAR,
                      color: 'auto',
                      fill: 'DCE6F1',
                    },
                  }
                : {}),
              children: [
                new Paragraph({
                  alignment:
                    isHeader || centered
                      ? AlignmentType.CENTER
                      : AlignmentType.LEFT,
                  spacing: {
                    before: 0,
                    after: 0,
                    line: Math.round(240 * tableLineSpacing),
                    lineRule: LineRuleType.AUTO,
                  },
                  run: {
                    font: fontFamily,
                    size: tableFontSize * 2,
                    bold: isHeader,
                  },
                  children: hasManuscriptScripts(cellText)
                    ? manuscriptScriptSegments(cellText).map(
                        (segment) =>
                          new TextRun({
                            text: segment.text,
                            bold: isHeader,
                            superScript: segment.position === 'SUPERSCRIPT',
                            subScript: segment.position === 'SUBSCRIPT',
                          }),
                      )
                    : exporter.transformInlineContent(mappedCell.content),
                }),
              ],
            });
          }),
        });
      }),
    });
  };
