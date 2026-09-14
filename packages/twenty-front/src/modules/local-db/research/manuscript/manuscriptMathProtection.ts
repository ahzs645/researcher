// LaTeX is not Markdown: protect it before the editor consumes underscores,
// backslashes and asterisks. Tokens are local to one conversion, never persisted.
export const createMathProtection = (source: string) => {
  let prefix = 'MANUSCRIPTMATH';
  while (source.includes(prefix)) prefix += 'X';
  const originals = new Map<string, string>();
  const stash = (text: string): string => {
    const token = `${prefix}${originals.size}END`;
    originals.set(token, text);
    return token;
  };
  const restore = (text: string): string => {
    for (const [token, original] of originals)
      text = text.replaceAll(token, () => original);
    return text;
  };
  return { stash, restore };
};

export const protectMarkdownMath = (
  source: string,
  stash: (text: string) => string,
): string => {
  let output = '';
  let index = 0;
  let fence: string | undefined;
  while (index < source.length) {
    if (index === 0 || source[index - 1] === '\n') {
      const end = source.indexOf('\n', index);
      const line = source.slice(index, end < 0 ? source.length : end + 1);
      const delimiter = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence !== undefined || delimiter !== undefined) {
        if (fence === undefined) fence = delimiter;
        else if (
          delimiter?.[0] === fence[0] &&
          delimiter.length >= fence.length
        )
          fence = undefined;
        output += line;
        index += line.length;
        continue;
      }
    }
    if (source[index] === '\\') {
      output += source.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (source[index] === '`') {
      const run = /^`+/.exec(source.slice(index))?.[0] ?? '`';
      const end = source.indexOf(run, index + run.length);
      const stop = end < 0 ? index + run.length : end + run.length;
      output += source.slice(index, stop);
      index = stop;
      continue;
    }
    if (source[index] === '$') {
      const display = source[index + 1] === '$';
      const delimiter = display ? '$$' : '$';
      const start = index + delimiter.length;
      let end = start;
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2;
          continue;
        }
        if (!display && /[\r\n]/.test(source[end])) break;
        if (source.startsWith(delimiter, end)) {
          const body = source.slice(start, end);
          if (
            body.trim().length > 0 &&
            (display || (!/^\s|\s$/.test(body) && source[end + 1] !== '$'))
          ) {
            output += stash(source.slice(index, end + delimiter.length));
            index = end + delimiter.length;
          }
          break;
        }
        end += 1;
      }
      if (index > start) continue;
    }
    output += source[index];
    index += 1;
  }
  return output;
};
