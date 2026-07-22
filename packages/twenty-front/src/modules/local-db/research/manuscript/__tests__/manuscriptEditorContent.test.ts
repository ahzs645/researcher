import {
  manuscriptBlocksToMarkdown,
  manuscriptNodesToTokens,
  manuscriptTokensToNodes,
  markdownToManuscriptBlocks,
} from '@/local-db/research/manuscript/manuscriptEditorContent';

const TOKEN_HEAVY_MARKDOWN = [
  'Inline $E = mc^2$ mid-sentence and \\$5 stays money.',
  '',
  '$$\\int_0^1 x^2 \\, dx$$',
  '',
  'Multiple citations (see [@a2020]; [@b2021]) and [#fig:result].',
  '',
  'Keep [[asset:fig:result]] untouched, along with a lone $ marker.',
].join('\n');

type TestBlock = {
  children: TestBlock[];
  content: unknown[];
  props: Record<string, unknown>;
  type: string;
};

const testEditor = {
  tryParseMarkdownToBlocks: jest.fn((markdown: string): TestBlock[] =>
    markdown.split('\n\n').map((paragraph) => ({
      type: 'paragraph',
      props: {
        backgroundColor: 'default',
        textColor: 'default',
        textAlignment: 'left',
      },
      content: [{ type: 'text', text: paragraph, styles: {} }],
      children: [],
    })),
  ),
  blocksToMarkdownLossy: jest.fn((blocks: TestBlock[]): string =>
    blocks
      .map((block) => {
        if (!Array.isArray(block.content)) return '';
        return block.content
          .map((node) =>
            typeof node === 'object' &&
            node !== null &&
            'text' in node &&
            typeof node.text === 'string'
              ? node.text
              : '',
          )
          .join('');
      })
      .join('\n\n'),
  ),
};

describe('manuscript editor content', () => {
  it('converts tokens over plain block JSON and restores them exactly', () => {
    const blocks = [
      {
        id: 'paragraph-1',
        type: 'paragraph',
        props: {
          backgroundColor: 'default',
          textColor: 'default',
          textAlignment: 'left',
        },
        content: [
          {
            type: 'text',
            text: 'Value $x^2$ (see [@a2020]) [#fig:one] [[asset:fig:one]] \\$5 and lone $',
            styles: {},
          },
        ],
        children: [],
      },
      {
        id: 'equation-1',
        type: 'paragraph',
        props: {
          backgroundColor: 'default',
          textColor: 'default',
          textAlignment: 'left',
        },
        content: [{ type: 'text', text: '$$E = mc^2$$', styles: {} }],
        children: [],
      },
    ];

    const converted = manuscriptTokensToNodes(blocks);
    expect(converted[0].content).toEqual([
      { type: 'text', text: 'Value ', styles: {} },
      {
        type: 'inlineEquation',
        props: { latex: 'x^2' },
      },
      { type: 'text', text: ' (see ', styles: {} },
      { type: 'citation', props: { citationKey: 'a2020' } },
      { type: 'text', text: ') ', styles: {} },
      { type: 'crossRef', props: { refKey: 'fig:one' } },
      {
        type: 'text',
        text: ' [[asset:fig:one]] \\$5 and lone $',
        styles: {},
      },
    ]);
    expect(converted[1]).toMatchObject({
      type: 'displayEquation',
      props: { latex: 'E = mc^2' },
    });
    expect(manuscriptNodesToTokens(converted)).toEqual(blocks);
  });

  it('round-trips token-heavy Markdown byte-for-byte through the editor adapter', () => {
    const blocks = markdownToManuscriptBlocks(testEditor, TOKEN_HEAVY_MARKDOWN);

    expect(manuscriptBlocksToMarkdown(testEditor, blocks)).toBe(
      TOKEN_HEAVY_MARKDOWN,
    );
    expect(testEditor.tryParseMarkdownToBlocks).toHaveBeenCalledWith(
      TOKEN_HEAVY_MARKDOWN,
    );
  });

  it('requires non-space inline math boundaries and a same-line closing dollar', () => {
    const blocks = [
      {
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'text',
            text: '$ spaced $ and $open only and $line\nbreak$',
            styles: {},
          },
        ],
        children: [],
      },
    ];

    expect(manuscriptTokensToNodes(blocks)).toEqual(blocks);
  });
});
