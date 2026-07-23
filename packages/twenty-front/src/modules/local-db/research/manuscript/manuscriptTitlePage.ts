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
