// A `---` entry among the title-page lines is vertical space, which is how a
// cover page pushes its degree and institution blocks apart. `--- 6` is six
// blank lines: a cover page positions its blocks at particular heights, and one
// fixed gap cannot reproduce a page someone laid out by eye.
const SPACER_LINE = /^-{3,}(?:\s*[x×]?\s*(\d{1,3}))?$/i;
const MAX_SPACER_LINES = 40;

export const titlePageSpacerLineCount = (line: string): number | null => {
  const match = SPACER_LINE.exec(line.trim());
  if (match === null) return null;
  const count = match[1] === undefined ? 1 : Number(match[1]);
  return Math.min(MAX_SPACER_LINES, Math.max(1, count));
};

export const isTitlePageSpacerLine = (line: string): boolean =>
  titlePageSpacerLineCount(line) !== null;

export const titlePageSpacerLine = (count: number): string =>
  count <= 1 ? '---' : `--- ${Math.min(MAX_SPACER_LINES, count)}`;

export const parseManuscriptTitlePageExtraLines = (
  value: string | null | undefined,
): string[] => {
  if (value === null || value === undefined || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((line): line is string => typeof line === 'string')
      : [];
  } catch {
    return [];
  }
};

export const serializeManuscriptTitlePageExtraLines = (
  lines: string[],
): string => JSON.stringify(lines.map((line) => line.trim()).filter(Boolean));

export const moveManuscriptTitlePageLine = (
  lines: string[],
  index: number,
  offset: -1 | 1,
): string[] => {
  const target = index + offset;
  if (target < 0 || target >= lines.length) return lines;
  const next = [...lines];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const manuscriptTitlePageFragmentText = (markdown: string): string =>
  markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-+*]\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
