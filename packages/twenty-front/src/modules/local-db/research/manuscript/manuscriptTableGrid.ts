import { parseMarkdownTable } from './manuscriptTables';

// Merged cells, on top of the GFM Markdown tables the composer already stores.
//
// GFM has no colspan/rowspan, so a Word table whose header reads
// "Percent of Data Censored" across three columns imports as one cell plus two
// blanks — and exports sitting over a single column. Two continuation markers
// close that gap while keeping the stored value a valid Markdown table:
//
//   `<`  this cell continues the cell to its left   (colspan)
//   `^`  this cell continues the cell above it      (rowspan)
//
// A marker only counts when it is the cell's entire content, so `<50%` stays
// the literal value it looks like. `\<` and `\^` escape a cell that really is
// just that character.
//
// Header rows come from where the `|---|` separator sits: everything above it
// is header, which lets a two-deck header ("Percent of Data Censored" over
// "<50% | 50-80% | >80%") say so in the source.

export const TABLE_SPAN_LEFT_MARKER = '<';
export const TABLE_SPAN_UP_MARKER = '^';

const SEPARATOR_ROW = /^\|?[\s:|-]+\|?$/;

export type ManuscriptTableCell = {
  text: string;
  // Grid position of this cell's top-left corner.
  row: number;
  column: number;
  colSpan: number;
  rowSpan: number;
};

export type ManuscriptTableGrid = {
  // Anchor cells only, in row order. A cell covered by a span above or to its
  // left is folded into that anchor and never appears here — the same shape
  // HTML `<td colspan>` and Word's `gridSpan` expect.
  rows: ManuscriptTableCell[][];
  columnCount: number;
  headerRows: number;
};

const isSpanMarker = (cell: string, marker: string): boolean =>
  cell.trim() === marker;

// `\<` / `\^` are the escape hatch for a cell whose real content is the marker.
const unescapeSpanMarker = (cell: string): string =>
  /^\\[<^]$/.test(cell.trim()) ? cell.trim().slice(1) : cell;

export const escapeManuscriptTableCellSpanMarker = (cell: string): string =>
  cell.trim() === TABLE_SPAN_LEFT_MARKER || cell.trim() === TABLE_SPAN_UP_MARKER
    ? `\\${cell.trim()}`
    : cell;

// How many rows sit above the `|---|` separator. Tables written without one
// (or with it in the usual place) keep the single header row every caller
// assumed before merged cells existed.
export const manuscriptTableHeaderRows = (
  markdown: string | null | undefined,
): number => {
  if (markdown === null || markdown === undefined) return 1;
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));
  const separatorIndex = lines.findIndex((line) => SEPARATOR_ROW.test(line));
  if (separatorIndex < 0) return 1;
  // Rows above the separator that actually carry content — a leading blank
  // line would otherwise inflate the header.
  return Math.max(
    1,
    lines
      .slice(0, separatorIndex)
      .filter((line) => line.replace(/[|\s]/g, '').length > 0).length,
  );
};

// Resolve a raw string grid into anchor cells with their spans.
export const buildManuscriptTableGrid = (
  rawRows: string[][],
  headerRows = 1,
): ManuscriptTableGrid => {
  const columnCount =
    rawRows.length === 0 ? 0 : Math.max(...rawRows.map((row) => row.length));
  // Which anchor owns each grid slot, so a marker can find what it extends.
  const ownerAt: (ManuscriptTableCell | undefined)[][] = rawRows.map(() =>
    new Array<ManuscriptTableCell | undefined>(columnCount).fill(undefined),
  );
  const rows: ManuscriptTableCell[][] = rawRows.map(() => []);

  rawRows.forEach((rawRow, rowIndex) => {
    for (let column = 0; column < columnCount; column += 1) {
      const raw = rawRow[column] ?? '';
      const left = column > 0 ? ownerAt[rowIndex][column - 1] : undefined;
      const above = rowIndex > 0 ? ownerAt[rowIndex - 1][column] : undefined;

      if (isSpanMarker(raw, TABLE_SPAN_LEFT_MARKER) && left !== undefined) {
        ownerAt[rowIndex][column] = left;
        // A block merged both ways repeats `<` on every one of its rows; only
        // the row that owns the anchor widens it.
        if (left.row === rowIndex) left.colSpan += 1;
        continue;
      }
      if (isSpanMarker(raw, TABLE_SPAN_UP_MARKER) && above !== undefined) {
        ownerAt[rowIndex][column] = above;
        // Likewise, only the anchor's own column deepens it.
        if (above.column === column) above.rowSpan += 1;
        continue;
      }

      const cell: ManuscriptTableCell = {
        text: unescapeSpanMarker(raw),
        row: rowIndex,
        column,
        colSpan: 1,
        rowSpan: 1,
      };
      ownerAt[rowIndex][column] = cell;
      rows[rowIndex].push(cell);
    }
  });

  return {
    rows,
    columnCount,
    headerRows: Math.min(Math.max(0, headerRows), rawRows.length),
  };
};

// The one entry point exporters use: stored Markdown → span-aware grid.
export const parseManuscriptTableGrid = (
  markdown: string | null | undefined,
): ManuscriptTableGrid =>
  buildManuscriptTableGrid(
    parseMarkdownTable(markdown),
    manuscriptTableHeaderRows(markdown),
  );

// Expand a span-aware grid back to a full rectangular string grid, writing the
// continuation markers where cells are covered. The inverse of the parse, so a
// merged table survives an edit round-trip.
export const manuscriptTableGridToRawRows = (
  grid: ManuscriptTableGrid,
): string[][] => {
  const rawRows: string[][] = grid.rows.map(() =>
    new Array<string>(grid.columnCount).fill(''),
  );
  const filled = grid.rows.map(() =>
    new Array<boolean>(grid.columnCount).fill(false),
  );

  for (const row of grid.rows) {
    for (const cell of row) {
      for (let r = cell.row; r < cell.row + cell.rowSpan; r += 1) {
        for (let c = cell.column; c < cell.column + cell.colSpan; c += 1) {
          if (rawRows[r] === undefined) continue;
          filled[r][c] = true;
          rawRows[r][c] =
            r === cell.row && c === cell.column
              ? escapeManuscriptTableCellSpanMarker(cell.text)
              : c > cell.column
                ? TABLE_SPAN_LEFT_MARKER
                : TABLE_SPAN_UP_MARKER;
        }
      }
    }
  }
  // Slots no cell claimed stay empty rather than inheriting a stale marker.
  rawRows.forEach((row, rowIndex) =>
    row.forEach((_value, column) => {
      if (!filled[rowIndex][column]) rawRows[rowIndex][column] = '';
    }),
  );
  return rawRows;
};
