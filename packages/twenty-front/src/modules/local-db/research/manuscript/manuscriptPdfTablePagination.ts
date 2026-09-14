import { type PlacedCell } from './manuscriptTableLayout';

// Keep a table that fits on one page intact. Longer tables are grouped with
// their header repeated; never cut a rowspan across groups. The conservative
// height budget leaves room for font metrics and the surrounding caption.
export const paginateManuscriptTable = (
  rows: PlacedCell[][],
  widths: number[],
  headerRows: number,
  fontSize: number,
  lineSpacing: number,
): { rows: number[]; keepTogether: boolean }[] => {
  const budget = 620;
  const heights = rows.map((row) =>
    Math.max(
      fontSize * lineSpacing + 8,
      ...row.map((cell) => {
        const width = Math.max(
          fontSize,
          widths
            .slice(cell.columnIndex, cell.columnIndex + cell.columnSpan)
            .reduce((sum, value) => sum + value, 0) - 12,
        );
        const characters = Math.max(1, Math.floor(width / (fontSize * 0.65)));
        const lines = cell.text
          .split('\n')
          .reduce(
            (sum, line) =>
              sum + Math.max(1, Math.ceil(line.length / characters)),
            0,
          );
        return (lines + 1) * fontSize * lineSpacing + 8;
      }),
    ),
  );
  const headers = Array.from(
    { length: Math.min(headerRows, rows.length) },
    (_, index) => index,
  );
  const headerHeight = headers.reduce((sum, index) => sum + heights[index], 0);
  const groups: { rows: number[]; keepTogether: boolean }[] = [];
  let current = [...headers];
  let height = headerHeight;
  for (let index = headerRows; index < rows.length; ) {
    let end = index + 1;
    for (
      let cursor = index;
      cursor < end && cursor < rows.length;
      cursor += 1
    ) {
      for (const cell of rows[cursor])
        end = Math.min(rows.length, Math.max(end, cursor + cell.rowSpan));
    }
    const indexes = Array.from(
      { length: end - index },
      (_, offset) => index + offset,
    );
    const groupHeight = indexes.reduce((sum, row) => sum + heights[row], 0);
    if (current.length > headers.length && height + groupHeight > budget) {
      groups.push({ rows: current, keepTogether: height <= budget });
      current = [...headers];
      height = headerHeight;
    }
    current.push(...indexes);
    height += groupHeight;
    index = end;
  }
  if (current.length > 0)
    groups.push({ rows: current, keepTogether: height <= budget });
  return groups;
};
