import {
  renderChartSvg,
  tableMarkdownToChartData,
} from '@/local-db/research/manuscript/manuscriptChart';
import { rasterizeSvgToPngDataUrl } from '@/local-db/research/manuscript/manuscriptChartImage';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 400;
const FIGURE_NAME_MAX_LENGTH = 60;

const normalizeFigureNameSource = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

export const deriveFigureNameFromCaption = (caption: string): string => {
  const normalizedCaption = normalizeFigureNameSource(caption);

  if (normalizedCaption.length <= FIGURE_NAME_MAX_LENGTH) {
    return normalizedCaption;
  }

  const candidate = normalizedCaption.slice(0, FIGURE_NAME_MAX_LENGTH);
  const lastWordBoundary = candidate.lastIndexOf(' ');

  return lastWordBoundary > 0
    ? candidate.slice(0, lastWordBoundary)
    : candidate;
};

type SyncFigureNameFromCaptionArgs = {
  currentName: string;
  previousCaption: string;
  nextCaption: string;
};

export const syncFigureNameFromCaption = ({
  currentName,
  previousCaption,
  nextCaption,
}: SyncFigureNameFromCaptionArgs): string => {
  const normalizedCurrentName = normalizeFigureNameSource(currentName);
  const previousDerivedName = deriveFigureNameFromCaption(previousCaption);
  const normalizedPreviousCaption = normalizeFigureNameSource(previousCaption);
  const wasAutoDerived =
    normalizedCurrentName.length === 0 ||
    normalizedCurrentName === previousDerivedName ||
    normalizedCurrentName === normalizedPreviousCaption;

  return wasAutoDerived
    ? deriveFigureNameFromCaption(nextCaption)
    : currentName;
};

export const chartPngFromTable = async (
  tableMarkdown: string,
): Promise<string | null> => {
  const data = tableMarkdownToChartData(tableMarkdown);
  if (data === null) return null;
  const svg = renderChartSvg(data, {
    kind: 'bar',
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
  });
  return rasterizeSvgToPngDataUrl(svg, CHART_WIDTH, CHART_HEIGHT);
};

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

export const slugifyFigureKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
