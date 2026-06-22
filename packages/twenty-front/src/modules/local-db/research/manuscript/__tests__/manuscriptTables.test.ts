import {
  gridToMarkdownTable,
  parseMarkdownTable,
  tableColumnCount,
} from '@/local-db/research/manuscript/manuscriptTables';

const TABLE = '| Run | Temp |\n| --- | --- |\n| A | 220 |\n| B | 240 |';

describe('parseMarkdownTable', () => {
  it('parses header + body rows and drops the separator', () => {
    expect(parseMarkdownTable(TABLE)).toEqual([
      ['Run', 'Temp'],
      ['A', '220'],
      ['B', '240'],
    ]);
  });

  it('returns [] for empty / non-table input', () => {
    expect(parseMarkdownTable('')).toEqual([]);
    expect(parseMarkdownTable(null)).toEqual([]);
    expect(parseMarkdownTable('no pipes here')).toEqual([]);
  });

  it('reports the column count', () => {
    expect(tableColumnCount(parseMarkdownTable(TABLE))).toBe(2);
  });
});

describe('gridToMarkdownTable', () => {
  it('round-trips a grid through Markdown', () => {
    const grid = [
      ['A', 'B'],
      ['1', '2'],
    ];
    expect(parseMarkdownTable(gridToMarkdownTable(grid))).toEqual(grid);
  });

  it('pads ragged rows to the widest column count', () => {
    const out = gridToMarkdownTable([['A', 'B', 'C'], ['1']]);
    expect(parseMarkdownTable(out)).toEqual([
      ['A', 'B', 'C'],
      ['1', '', ''],
    ]);
  });
});
