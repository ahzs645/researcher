import { manuscriptTablePlacement } from '@/local-db/research/manuscript/manuscriptTableLayout';

const cell = (text: string, colspan = 1, rowspan = 1) => ({
  props: { colspan, rowspan },
  content: [{ type: 'text', text }],
});

describe('manuscriptTablePlacement', () => {
  it('gives every cell the column it really starts at', () => {
    // Table 6 of the thesis: a header spanning three columns over a second
    // header row, with the corner cell spanning both rows.
    const { rows, covered } = manuscriptTablePlacement([
      { cells: [cell('Sample Size', 1, 2), cell('Percent of Data Censored', 3)] },
      { cells: [cell('<50%'), cell('50-80%'), cell('>80%')] },
      { cells: [cell('n<50'), cell('ROS'), cell('ROS'), cell('Too censored')] },
    ]);

    expect(rows[0].map((placed) => placed.columnIndex)).toEqual([0, 1]);
    expect(rows[0][1].columnSpan).toBe(3);
    // Row 2's first cell starts at column 1, because column 0 is still the
    // corner cell from the row above — using the array index would put "<50%"
    // under "Sample Size".
    expect(rows[1].map((placed) => placed.columnIndex)).toEqual([1, 2, 3]);
    expect(rows[2].map((placed) => placed.columnIndex)).toEqual([0, 1, 2, 3]);
    expect([...covered.keys()]).toEqual(['1:0']);
    expect(covered.get('1:0')).toEqual({ columnSpan: 1 });
  });

  it('carries a rowspan down every row it covers', () => {
    const { covered } = manuscriptTablePlacement([
      { cells: [cell('Metal', 2, 3), cell('2019')] },
      { cells: [cell('2020')] },
      { cells: [cell('2021')] },
    ]);

    expect([...covered.keys()].sort()).toEqual(['1:0', '2:0']);
    expect(covered.get('2:0')).toEqual({ columnSpan: 2 });
  });

  it('leaves a plain table exactly as it reads', () => {
    const { rows, covered } = manuscriptTablePlacement([
      { cells: [cell('Metal'), cell('Rural'), cell('Urban')] },
      { cells: [cell('Antimony'), cell('<0.001'), cell('0.032')] },
    ]);

    expect(rows.map((row) => row.map((placed) => placed.columnIndex))).toEqual([
      [0, 1, 2],
      [0, 1, 2],
    ]);
    expect(covered.size).toBe(0);
    expect(rows[1][0].text).toBe('Antimony');
  });
});
