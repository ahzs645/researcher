// Where each cell of a table really sits.
//
// A cell that spans rows is absent from every row it covers, and a cell that
// spans columns swallows the ones to its right, so a cell's position in the
// row array is not its column. Both exporters have to walk the grid to place
// anything correctly — the DOCX one does it inline; the PDF renderer needs the
// covered positions too, to leave the gap that makes a merge read as one box.
// Kept free of any renderer import so it can be tested on its own.

export type PlacedCell = {
  columnIndex: number;
  columnSpan: number;
  rowSpan: number;
  text: string;
};

export type TableCellLike = {
  props?: { colspan?: number; rowspan?: number };
  content?: unknown;
};

const cellText = (cell: TableCellLike): string => {
  const content = cell.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) =>
      typeof item === 'object' &&
      item !== null &&
      'text' in item &&
      typeof (item as { text?: unknown }).text === 'string'
        ? (item as { text: string }).text
        : '',
    )
    .join('');
};

export type ManuscriptTablePlacement = {
  // One entry per row, each cell carrying the column it really starts at.
  rows: PlacedCell[][];
  // Grid positions a rowspan covers, keyed "row:column", so a later row can
  // leave a gap that reads as part of the cell above rather than shifting left.
  covered: Map<string, { columnSpan: number }>;
};

// Walk the rows against the real grid: a cell that spans rows is missing from
// every row it covers, so the array index is not the column index.
const placeRow = (
  cells: TableCellLike[],
  rowIndex: number,
  occupied: Set<string>,
): PlacedCell[] => {
  const placed: PlacedCell[] = [];
  let cursor = 0;
  for (const cell of cells) {
    while (occupied.has(`${rowIndex}:${cursor}`)) cursor += 1;
    const columnSpan = Math.max(1, cell.props?.colspan ?? 1);
    const rowSpan = Math.max(1, cell.props?.rowspan ?? 1);
    for (let row = rowIndex; row < rowIndex + rowSpan; row += 1) {
      for (let column = cursor; column < cursor + columnSpan; column += 1) {
        occupied.add(`${row}:${column}`);
      }
    }
    placed.push({
      columnIndex: cursor,
      columnSpan,
      rowSpan,
      text: cellText(cell),
    });
    cursor += columnSpan;
  }
  return placed;
};

export const manuscriptTablePlacement = (
  rows: { cells?: TableCellLike[] }[],
): ManuscriptTablePlacement => {
  const occupied = new Set<string>();
  const covered = new Map<string, { columnSpan: number }>();
  const placed = rows.map((row, rowIndex) => {
    const cells = placeRow(row.cells ?? [], rowIndex, occupied);
    for (const cell of cells) {
      for (
        let covering = rowIndex + 1;
        covering < rowIndex + cell.rowSpan;
        covering += 1
      ) {
        covered.set(`${covering}:${cell.columnIndex}`, {
          columnSpan: cell.columnSpan,
        });
      }
    }
    return cells;
  });
  return { rows: placed, covered };
};
