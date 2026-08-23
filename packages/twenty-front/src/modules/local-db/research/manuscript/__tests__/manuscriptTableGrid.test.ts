import {
  buildManuscriptTableGrid,
  manuscriptTableGridToRawRows,
  manuscriptTableHeaderRows,
  parseManuscriptTableGrid,
} from '@/local-db/research/manuscript/manuscriptTableGrid';
import { gridToMarkdownTable } from '@/local-db/research/manuscript/manuscriptTables';

// The table from the imported thesis whose header spans three columns.
const CENSORED_TABLE = [
  '|  | Percent of Data Censored | < | < |',
  '| Sample Size | <50% | 50-80% | >80% |',
  '| --- | --- | --- | --- |',
  '| n<50 | Robust ROS | Robust ROS | Censoring too high |',
  '| n≥50 | Robust ROS | MLE | Censoring too high |',
].join('\n');

describe('parseManuscriptTableGrid', () => {
  it('folds continuation cells into a spanning anchor', () => {
    const grid = parseManuscriptTableGrid(CENSORED_TABLE);

    expect(grid.columnCount).toBe(4);
    expect(grid.headerRows).toBe(2);
    expect(grid.rows[0]).toHaveLength(2);
    expect(grid.rows[0][1]).toMatchObject({
      text: 'Percent of Data Censored',
      column: 1,
      colSpan: 3,
      rowSpan: 1,
    });
    expect(grid.rows[1].map((cell) => cell.text)).toEqual([
      'Sample Size',
      '<50%',
      '50-80%',
      '>80%',
    ]);
  });

  it('treats a value that merely starts with a marker as content', () => {
    const grid = parseManuscriptTableGrid(
      '| Sample | <50% | >80% |\n| --- | --- | --- |\n| n<50 | a | b |',
    );

    expect(grid.rows[0].map((cell) => cell.colSpan)).toEqual([1, 1, 1]);
    expect(grid.rows[1][0].text).toBe('n<50');
  });

  it('merges upward, and only once for a block merged both ways', () => {
    const grid = buildManuscriptTableGrid(
      [
        ['Metal', 'Concentration', '<'],
        ['^', 'Rural', 'Urban'],
        ['Cu', '0.01', '0.29'],
      ],
      2,
    );

    expect(grid.rows[0][0]).toMatchObject({ colSpan: 1, rowSpan: 2 });
    expect(grid.rows[0][1]).toMatchObject({ colSpan: 2, rowSpan: 1 });
    expect(grid.rows[1].map((cell) => cell.text)).toEqual(['Rural', 'Urban']);
  });

  it('counts a two-by-two merge once in each direction', () => {
    const grid = buildManuscriptTableGrid([
      ['Span', '<', 'C'],
      ['^', '<', 'D'],
    ]);

    expect(grid.rows[0][0]).toMatchObject({ colSpan: 2, rowSpan: 2 });
    expect(grid.rows[1].map((cell) => cell.text)).toEqual(['D']);
  });

  it('keeps a marker with no neighbour to merge into as literal text', () => {
    const grid = buildManuscriptTableGrid([
      ['<', 'B'],
      ['^', 'C'],
    ]);

    expect(grid.rows[0][0]).toMatchObject({ text: '<', colSpan: 1 });
  });

  it('reads an escaped marker back as the bare character', () => {
    const grid = buildManuscriptTableGrid([['\\<', 'B']]);

    expect(grid.rows[0][0]).toMatchObject({ text: '<', colSpan: 1 });
  });

  it('returns an empty grid for non-table input', () => {
    expect(parseManuscriptTableGrid('').rows).toEqual([]);
    expect(parseManuscriptTableGrid(null).columnCount).toBe(0);
  });
});

describe('manuscriptTableHeaderRows', () => {
  it('defaults to one header row when there is no separator', () => {
    expect(manuscriptTableHeaderRows('| A | B |\n| 1 | 2 |')).toBe(1);
    expect(manuscriptTableHeaderRows(null)).toBe(1);
  });

  it('reads a multi-row header from where the separator sits', () => {
    expect(manuscriptTableHeaderRows(CENSORED_TABLE)).toBe(2);
  });
});

describe('manuscriptTableGridToRawRows', () => {
  it('round-trips a merged grid through Markdown', () => {
    const grid = parseManuscriptTableGrid(CENSORED_TABLE);
    const markdown = gridToMarkdownTable(
      manuscriptTableGridToRawRows(grid),
      grid.headerRows,
    );
    const reparsed = parseManuscriptTableGrid(markdown);

    expect(reparsed.headerRows).toBe(2);
    expect(reparsed.rows[0][1]).toMatchObject({
      text: 'Percent of Data Censored',
      colSpan: 3,
    });
    expect(reparsed.rows[1].map((cell) => cell.text)).toEqual([
      'Sample Size',
      '<50%',
      '50-80%',
      '>80%',
    ]);
  });

  it('escapes a cell whose content really is a marker', () => {
    const grid = buildManuscriptTableGrid([['<', 'B']]);

    expect(manuscriptTableGridToRawRows(grid)[0][0]).toBe('\\<');
    expect(
      parseManuscriptTableGrid(
        gridToMarkdownTable(manuscriptTableGridToRawRows(grid)),
      ).rows[0][0].text,
    ).toBe('<');
  });
});
