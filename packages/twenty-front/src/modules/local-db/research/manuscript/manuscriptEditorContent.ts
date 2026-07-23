type JsonRecord = Record<string, unknown>;

type MarkdownEditor<TBlock> = {
  tryParseMarkdownToBlocks: (markdown: string) => TBlock[];
  blocksToMarkdownLossy: (blocks: TBlock[]) => string;
};

export type ManuscriptInlineNode =
  | { type: 'inlineEquation'; props: { latex: string }; content?: undefined }
  | { type: 'citation'; props: { citationKey: string }; content?: undefined }
  | { type: 'crossRef'; props: { refKey: string }; content?: undefined };

// BlockNote removes Markdown escapes while parsing. Keep their provenance in
// the editable text with an invisible separator, then restore the backslash
// after serialization so an unrelated edit cannot activate a literal token.
const ESCAPED_TOKEN_MARKER = '\u2063';

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isUnescaped = (text: string, index: number): boolean => {
  let slashCount = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && text[cursor] === '\\';
    cursor -= 1
  ) {
    slashCount += 1;
  }
  return slashCount % 2 === 0;
};

const findInlineEquationEnd = (text: string, start: number): number => {
  if (
    text[start] !== '$' ||
    text[start + 1] === '$' ||
    /\s/.test(text[start + 1] ?? '') ||
    !isUnescaped(text, start)
  ) {
    return -1;
  }

  for (let cursor = start + 1; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === '\n' || character === '\r') return -1;
    if (
      character === '$' &&
      text[cursor + 1] !== '$' &&
      !/\s/.test(text[cursor - 1] ?? '') &&
      isUnescaped(text, cursor)
    ) {
      return cursor;
    }
  }
  return -1;
};

const nextToken = (
  text: string,
  start: number,
): { end: number; node: ManuscriptInlineNode } | undefined => {
  if (!isUnescaped(text, start) || text[start - 1] === ESCAPED_TOKEN_MARKER) {
    return undefined;
  }

  if (text.startsWith('[@', start)) {
    const match = /^\[@([^\]\s;]+)\]/.exec(text.slice(start));
    if (match !== null) {
      return {
        end: start + match[0].length,
        node: {
          type: 'citation',
          props: { citationKey: match[1] },
        },
      };
    }
  }

  if (text.startsWith('[#', start)) {
    const match = /^\[#([^\]\s]+)\]/.exec(text.slice(start));
    if (match !== null) {
      return {
        end: start + match[0].length,
        node: {
          type: 'crossRef',
          props: { refKey: match[1] },
        },
      };
    }
  }

  if (text[start] === '$') {
    const end = findInlineEquationEnd(text, start);
    if (end !== -1) {
      return {
        end: end + 1,
        node: {
          type: 'inlineEquation',
          props: { latex: text.slice(start + 1, end) },
        },
      };
    }
  }

  return undefined;
};

const textToInlineNodes = (node: JsonRecord): unknown[] => {
  const text = typeof node.text === 'string' ? node.text : '';
  if (isJsonRecord(node.styles) && Object.keys(node.styles).length > 0) {
    return [node];
  }
  const result: unknown[] = [];
  let plainStart = 0;
  let cursor = 0;

  const pushPlainText = (end: number) => {
    if (end > plainStart) {
      result.push({ ...node, text: text.slice(plainStart, end) });
    }
  };

  while (cursor < text.length) {
    const token = nextToken(text, cursor);
    if (token === undefined) {
      cursor += 1;
      continue;
    }
    pushPlainText(cursor);
    result.push(token.node);
    cursor = token.end;
    plainStart = cursor;
  }
  pushPlainText(text.length);

  return result.length === 0 ? [node] : result;
};

const toManuscriptInlineContent = (content: unknown): unknown => {
  if (!Array.isArray(content)) return content;
  return content.flatMap((node: unknown) => {
    if (!isJsonRecord(node)) return [node];
    if (node.type === 'text' && typeof node.text === 'string') {
      return textToInlineNodes(node);
    }
    // A custom inline node cannot retain the link or its nested text styles.
    if (node.type === 'link') return [node];
    return [node];
  });
};

const inlineNodeToText = (node: JsonRecord): JsonRecord | undefined => {
  if (!isJsonRecord(node.props)) return undefined;
  if (node.type === 'inlineEquation' && typeof node.props.latex === 'string') {
    return { type: 'text', text: `$${node.props.latex}$`, styles: {} };
  }
  if (node.type === 'citation' && typeof node.props.citationKey === 'string') {
    return { type: 'text', text: `[@${node.props.citationKey}]`, styles: {} };
  }
  if (node.type === 'crossRef' && typeof node.props.refKey === 'string') {
    return { type: 'text', text: `[#${node.props.refKey}]`, styles: {} };
  }
  return undefined;
};

const mergeAdjacentText = (content: unknown[]): unknown[] => {
  const merged: unknown[] = [];
  for (const node of content) {
    const previous = merged.at(-1);
    if (
      isJsonRecord(previous) &&
      isJsonRecord(node) &&
      previous.type === 'text' &&
      node.type === 'text' &&
      typeof previous.text === 'string' &&
      typeof node.text === 'string' &&
      JSON.stringify(previous.styles ?? {}) ===
        JSON.stringify(node.styles ?? {})
    ) {
      merged[merged.length - 1] = {
        ...previous,
        text: `${previous.text}${node.text}`,
      };
    } else {
      merged.push(node);
    }
  }
  return merged;
};

const fromManuscriptInlineContent = (content: unknown): unknown => {
  if (!Array.isArray(content)) return content;
  return mergeAdjacentText(
    content.map((node: unknown) => {
      if (!isJsonRecord(node)) return node;
      const tokenText = inlineNodeToText(node);
      if (tokenText !== undefined) return tokenText;
      if (node.type === 'link') {
        return { ...node, content: fromManuscriptInlineContent(node.content) };
      }
      return node;
    }),
  );
};

const displayEquationLatex = (block: JsonRecord): string | undefined => {
  if (block.type !== 'paragraph' || !Array.isArray(block.content)) {
    return undefined;
  }
  const content = block.content;
  if (
    content.length !== 1 ||
    !isJsonRecord(content[0]) ||
    content[0].type !== 'text' ||
    typeof content[0].text !== 'string'
  ) {
    return undefined;
  }
  const match = /^\$\$(\S(?:[^\r\n]*\S)?)\$\$$/.exec(content[0].text);
  return match?.[1];
};

const transformBlock = (block: unknown, toManuscript: boolean): unknown => {
  if (!isJsonRecord(block)) return block;
  const children = Array.isArray(block.children)
    ? block.children.map((child) => transformBlock(child, toManuscript))
    : block.children;

  if (toManuscript) {
    if (block.type === 'codeBlock') {
      return block;
    }
    const latex = displayEquationLatex(block);
    if (latex !== undefined) {
      return {
        ...block,
        type: 'displayEquation',
        props: { latex },
        content: undefined,
        children,
      };
    }
    return {
      ...block,
      content: toManuscriptInlineContent(block.content),
      children,
    };
  }

  if (
    block.type === 'displayEquation' &&
    isJsonRecord(block.props) &&
    typeof block.props.latex === 'string'
  ) {
    return {
      ...block,
      type: 'paragraph',
      props: {
        backgroundColor: 'default',
        textColor: 'default',
        textAlignment: 'left',
      },
      content: [{ type: 'text', text: `$$${block.props.latex}$$`, styles: {} }],
      children,
    };
  }
  return {
    ...block,
    content: fromManuscriptInlineContent(block.content),
    children,
  };
};

export const manuscriptTokensToNodes = <TBlock>(blocks: TBlock[]): TBlock[] =>
  blocks.map((block) => transformBlock(block, true)) as TBlock[];

export const manuscriptNodesToTokens = <TBlock>(blocks: TBlock[]): TBlock[] =>
  blocks.map((block) => transformBlock(block, false)) as TBlock[];

const startsEscapableToken = (markdown: string, index: number): boolean =>
  markdown.startsWith('[@', index) ||
  markdown.startsWith('[#', index) ||
  markdown[index] === '$';

const protectEscapedTokens = (markdown: string): string => {
  let protectedMarkdown = '';
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === ESCAPED_TOKEN_MARKER) {
      protectedMarkdown += `${ESCAPED_TOKEN_MARKER}${ESCAPED_TOKEN_MARKER}`;
      continue;
    }
    if (
      markdown[index] === '\\' &&
      isUnescaped(markdown, index) &&
      startsEscapableToken(markdown, index + 1)
    ) {
      protectedMarkdown += ESCAPED_TOKEN_MARKER;
    } else {
      protectedMarkdown += markdown[index];
    }
  }
  return protectedMarkdown;
};

const restoreEscapedTokens = (markdown: string): string => {
  let restoredMarkdown = '';
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] !== ESCAPED_TOKEN_MARKER) {
      restoredMarkdown += markdown[index];
      continue;
    }
    if (markdown[index + 1] === ESCAPED_TOKEN_MARKER) {
      restoredMarkdown += ESCAPED_TOKEN_MARKER;
      index += 1;
      continue;
    }
    if (startsEscapableToken(markdown, index + 1)) {
      restoredMarkdown += '\\';
    }
  }
  return restoredMarkdown;
};

export const markdownToManuscriptBlocks = <TBlock>(
  editor: MarkdownEditor<TBlock>,
  markdown: string,
): TBlock[] =>
  manuscriptTokensToNodes(
    editor.tryParseMarkdownToBlocks(protectEscapedTokens(markdown)),
  );

export const manuscriptBlocksToMarkdown = <TBlock>(
  editor: MarkdownEditor<TBlock>,
  document: TBlock[],
): string =>
  restoreEscapedTokens(
    editor.blocksToMarkdownLossy(manuscriptNodesToTokens(document)),
  );
