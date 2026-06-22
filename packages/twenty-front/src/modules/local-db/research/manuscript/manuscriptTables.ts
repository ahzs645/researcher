// Tables are authored as GFM Markdown tables (the format Pandoc, BlockNote and
// every Markdown tool understands). This parses that string into a row/column
// grid for the DOCX exporter (which builds a real Word table), and normalizes a
// grid back to Markdown for previews.

const SEPARATOR_ROW = /^\|?[\s:|-]+\|?$/;

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

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
    `| ${Array.from({ length: columnCount }, (_, index) => row[index] ?? '').join(' | ')} |`;
  const [header, ...body] = rows;
  const separator = `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`;
  return [pad(header), separator, ...body.map(pad)].join('\n');
};

export const tableColumnCount = (rows: string[][]): number =>
  rows.length === 0 ? 0 : Math.max(...rows.map((row) => row.length));
