// Tables are authored as GFM Markdown tables (the format Pandoc, BlockNote and
// every Markdown tool understands). This parses that string into a row/column
// grid for the DOCX exporter (which builds a real Word table), and normalizes a
// grid back to Markdown for previews.

const SEPARATOR_ROW = /^\|?[\s:|-]+\|?$/;

const isEscaped = (value: string, index: number): boolean => {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
};

const splitRow = (line: string): string[] => {
  const trimmed = line.trim();
  const withoutLeadingPipe = trimmed.startsWith('|')
    ? trimmed.slice(1)
    : trimmed;
  const value =
    withoutLeadingPipe.endsWith('|') &&
    !isEscaped(withoutLeadingPipe, withoutLeadingPipe.length - 1)
      ? withoutLeadingPipe.slice(0, -1)
      : withoutLeadingPipe;
  const cells: string[] = [];
  let cell = '';

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\' && index + 1 < value.length) {
      const nextCharacter = value[index + 1];
      if (nextCharacter === '\\' || nextCharacter === '|') {
        cell += nextCharacter;
        index += 1;
        continue;
      }
    }
    if (character === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
};

const escapeCell = (cell: string): string =>
  cell
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n|\r/g, ' ');

// Parse a GFM Markdown table into rows of cells (the header row is just the
// first row). Lines that aren't table rows, and the |---|---| separator, are
// dropped. Returns [] for empty/non-table input.
export const parseMarkdownTable = (
  markdown: string | null | undefined,
): string[][] => {
  if (markdown === null || markdown === undefined) return [];
  const rows = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|'))
    .filter((line) => !SEPARATOR_ROW.test(line))
    .map(splitRow)
    .filter((cells) => cells.some((cell) => cell.length > 0));
  return rows;
};

// Render a grid back to a GFM Markdown table (used when seeding/normalizing).
export const gridToMarkdownTable = (rows: string[][]): string => {
  if (rows.length === 0) return '';
  const columnCount = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]): string =>
    `| ${Array.from({ length: columnCount }, (_, index) => escapeCell(row[index] ?? '')).join(' | ')} |`;
  const [header, ...body] = rows;
  const separator = `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`;
  return [pad(header), separator, ...body.map(pad)].join('\n');
};

export const tableColumnCount = (rows: string[][]): number =>
  rows.length === 0 ? 0 : Math.max(...rows.map((row) => row.length));
