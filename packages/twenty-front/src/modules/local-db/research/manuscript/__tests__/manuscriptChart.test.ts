import {
  gridToChartData,
  renderChartSvg,
  chartSvgFromTableMarkdown,
  tableMarkdownToChartData,
} from '../manuscriptChart';

describe('gridToChartData', () => {
  it('reads category labels and numeric series from a grid', () => {
    const data = gridToChartData([
      ['Site', 'PM2.5', 'CO2'],
      ['A', '12', '420'],
      ['B', '8', 'of 410'],
    ]);
    expect(data).not.toBeNull();
    expect(data?.xLabel).toBe('Site');
    expect(data?.categories).toEqual(['A', 'B']);
    expect(data?.series).toHaveLength(2);
    expect(data?.series[0]).toEqual({ name: 'PM2.5', values: [12, 8] });
    // "of 410" is coerced to 410.
    expect(data?.series[1].values).toEqual([420, 410]);
  });

  it('returns null when no column is numeric', () => {
    expect(
      gridToChartData([
        ['City', 'Country'],
        ['Vancouver', 'Canada'],
      ]),
    ).toBeNull();
  });

  it('drops mostly non-numeric columns', () => {
    const data = gridToChartData([
      ['X', 'Note', 'Y'],
      ['1', 'n/a', '5'],
      ['2', 'tbd', '7'],
    ]);
    expect(data?.series.map((s) => s.name)).toEqual(['Y']);
  });
});

describe('tableMarkdownToChartData', () => {
  it('parses a GFM table string', () => {
    const data = tableMarkdownToChartData(
      ['| Year | Cases |', '| --- | --- |', '| 2018 | 30 |', '| 2019 | 45 |'].join(
        '\n',
      ),
    );
    expect(data?.categories).toEqual(['2018', '2019']);
    expect(data?.series[0].values).toEqual([30, 45]);
  });
});

describe('renderChartSvg', () => {
  const data = {
    xLabel: 'Year',
    categories: ['2018', '2019'],
    series: [{ name: 'Cases', values: [30, 45] }],
  };

  it('renders a bar chart as a self-contained SVG', () => {
    const svg = renderChartSvg(data, { kind: 'bar', title: 'Cases by year' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<rect'); // bars
    expect(svg).toContain('Cases by year'); // title
    expect(svg).toContain('2018'); // category label
  });

  it('renders a line chart with a polyline', () => {
    const svg = renderChartSvg(data, { kind: 'line' });
    expect(svg).toContain('<polyline');
  });

  it('escapes XML in labels and titles', () => {
    const svg = renderChartSvg(
      { xLabel: '', categories: ['A & B'], series: [{ name: 'n', values: [1] }] },
      { title: '<unsafe>' },
    );
    expect(svg).toContain('A &amp; B');
    expect(svg).toContain('&lt;unsafe&gt;');
    expect(svg).not.toContain('<unsafe>');
  });

  it('chartSvgFromTableMarkdown returns null for non-numeric tables', () => {
    expect(
      chartSvgFromTableMarkdown('| a | b |\n| --- | --- |\n| x | y |'),
    ).toBeNull();
  });
});
