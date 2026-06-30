// Turn tabular data (a Markdown table, or a dataset's rows) into a chart figure.
// Pure SVG generation — no charting dependency — so a `figure` can be *plotted*
// from data instead of only uploaded as a static image. The browser glue that
// rasterizes the SVG to a PNG data-URL (for reliable DOCX/PDF embedding) lives
// in `manuscriptChartImage.ts`; this module is string-in / SVG-out and tested.

import { parseMarkdownTable } from './manuscriptTables';

export type ChartKind = 'bar' | 'line';

export type ChartData = {
  xLabel: string;
  categories: string[];
  series: { name: string; values: number[] }[];
};

// Coerce a cell like "1,234", "12.5 µg/m³", "$3.4M" to a number, or NaN.
const toNumber = (cell: string): number => {
  const cleaned = cell.replace(/[^0-9.\-+eE]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return NaN;
  return Number(cleaned);
};

// Read a grid (first row = header, first column = category labels, remaining
// columns = numeric series) into chartable data. Returns null when there is no
// numeric column to plot.
export const gridToChartData = (grid: string[][]): ChartData | null => {
  if (grid.length < 2) return null;
  const [header, ...body] = grid;
  const xLabel = header[0] ?? '';
  const columnCount = Math.max(...grid.map((row) => row.length));

  const candidateSeries: { name: string; values: number[] }[] = [];
  for (let column = 1; column < columnCount; column += 1) {
    const values = body.map((row) => toNumber(row[column] ?? ''));
    // Keep a column only if most of its cells are numeric.
    const numeric = values.filter((value) => !Number.isNaN(value)).length;
    if (numeric >= Math.ceil(body.length / 2)) {
      candidateSeries.push({
        name: header[column] ?? `Series ${column}`,
        values: values.map((value) => (Number.isNaN(value) ? 0 : value)),
      });
    }
  }
  if (candidateSeries.length === 0) return null;

  return {
    xLabel,
    categories: body.map((row) => row[0] ?? ''),
    series: candidateSeries,
  };
};

export const tableMarkdownToChartData = (
  markdown: string | null | undefined,
): ChartData | null => gridToChartData(parseMarkdownTable(markdown));

const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const niceMax = (max: number): number => {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
};

export type ChartOptions = {
  kind?: ChartKind;
  width?: number;
  height?: number;
  title?: string;
};

// Render chart data to a standalone SVG string (white background, axes, legend).
export const renderChartSvg = (
  data: ChartData,
  options: ChartOptions = {},
): string => {
  const kind = options.kind ?? 'bar';
  const width = options.width ?? 640;
  const height = options.height ?? 400;
  const margin = { top: options.title ? 40 : 20, right: 24, bottom: 56, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const allValues = data.series.flatMap((series) => series.values);
  const rawMax = Math.max(0, ...allValues);
  const max = niceMax(rawMax);
  const yOf = (value: number): number =>
    margin.top + plotHeight - (value / max) * plotHeight;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  if (options.title) {
    parts.push(
      `<text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="bold" fill="#111827">${escapeXml(options.title)}</text>`,
    );
  }

  // Y gridlines + labels (5 ticks).
  for (let tick = 0; tick <= 5; tick += 1) {
    const value = (max / 5) * tick;
    const y = yOf(value);
    parts.push(
      `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" stroke="#e5e7eb"/>`,
    );
    parts.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280">${Number(value.toFixed(2))}</text>`,
    );
  }

  // Axes.
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#9ca3af"/>`,
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#9ca3af"/>`,
  );

  const count = data.categories.length;
  const slot = count > 0 ? plotWidth / count : plotWidth;

  // Category labels.
  data.categories.forEach((category, index) => {
    const x = margin.left + slot * index + slot / 2;
    parts.push(
      `<text x="${x}" y="${margin.top + plotHeight + 16}" text-anchor="middle" font-size="11" fill="#374151">${escapeXml(category)}</text>`,
    );
  });

  if (kind === 'bar') {
    const groupWidth = slot * 0.7;
    const barWidth = groupWidth / data.series.length;
    data.series.forEach((series, seriesIndex) => {
      const color = PALETTE[seriesIndex % PALETTE.length];
      series.values.forEach((value, index) => {
        const x =
          margin.left + slot * index + (slot - groupWidth) / 2 + barWidth * seriesIndex;
        const y = yOf(value);
        const barHeight = margin.top + plotHeight - y;
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, barHeight).toFixed(1)}" fill="${color}"/>`,
        );
      });
    });
  } else {
    data.series.forEach((series, seriesIndex) => {
      const color = PALETTE[seriesIndex % PALETTE.length];
      const points = series.values
        .map((value, index) => {
          const x = margin.left + slot * index + slot / 2;
          return `${x.toFixed(1)},${yOf(value).toFixed(1)}`;
        })
        .join(' ');
      parts.push(
        `<polyline fill="none" stroke="${color}" stroke-width="2" points="${points}"/>`,
      );
    });
  }

  // Legend (only when more than one series).
  if (data.series.length > 1) {
    data.series.forEach((series, index) => {
      const color = PALETTE[index % PALETTE.length];
      const x = margin.left + index * 120;
      const y = height - 12;
      parts.push(`<rect x="${x}" y="${y - 9}" width="10" height="10" fill="${color}"/>`);
      parts.push(
        `<text x="${x + 14}" y="${y}" font-size="11" fill="#374151">${escapeXml(series.name)}</text>`,
      );
    });
  }

  parts.push('</svg>');
  return parts.join('');
};

// Convenience: Markdown table → SVG (or null when the table has no numeric data).
export const chartSvgFromTableMarkdown = (
  markdown: string | null | undefined,
  options: ChartOptions = {},
): string | null => {
  const data = tableMarkdownToChartData(markdown);
  return data === null ? null : renderChartSvg(data, options);
};
