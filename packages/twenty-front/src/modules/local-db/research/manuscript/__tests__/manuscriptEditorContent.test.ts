import {
  citationKeysFromProp,
  citationKeysToProp,
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
    expect(testEditor.tryParseMarkdownToBlocks).toHaveBeenCalledTimes(1);
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

  it('keeps code, styled, linked, and escaped tokens lossless', () => {
    const blocks = [
      {
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'text',
            text: '[@literal] and $cash$',
            styles: { code: true },
          },
        ],
        children: [],
      },
      {
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: '\\[@escaped] and \\$5', styles: {} }],
        children: [],
      },
      {
        type: 'paragraph',
        props: {},
        content: [
          { type: 'text', text: 'see [@a] now', styles: { bold: true } },
          { type: 'text', text: ' [#fig:a]', styles: { italic: true } },
          { type: 'text', text: ' $x$', styles: { strike: true } },
        ],
        children: [],
      },
      {
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'link',
            href: 'https://example.com',
            content: [
              { type: 'text', text: 'see [@a] and [#fig:a]', styles: {} },
            ],
          },
        ],
        children: [],
      },
      {
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: '[@a; @b][@c; @d]', styles: {} }],
        children: [],
      },
      {
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: '[@a][#fig:x]$x$', styles: {} }],
        children: [],
      },
      {
        type: 'codeBlock',
        props: { language: 'text' },
        content: [
          { type: 'text', text: '[@literal] and $not-math$', styles: {} },
        ],
        children: [],
      },
    ];

    const converted = manuscriptTokensToNodes(blocks);

    expect(converted.slice(0, 4)).toEqual(blocks.slice(0, 4));
    expect(converted[4].content).toEqual([
      { type: 'citation', props: { citationKey: 'a; b' } },
      { type: 'citation', props: { citationKey: 'c; d' } },
    ]);
    expect(converted[5].content).toEqual([
      { type: 'citation', props: { citationKey: 'a' } },
      { type: 'crossRef', props: { refKey: 'fig:x' } },
      { type: 'inlineEquation', props: { latex: 'x' } },
    ]);
    expect(converted[6]).toEqual(blocks[6]);
    expect(manuscriptNodesToTokens(converted)).toEqual(blocks);
  });

  it('turns a multi-key citation cluster into one node and back', () => {
    const blocks = [
      {
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'text',
            text: 'Air quality worsens [@li2017; @manisalidis2020; @pehoiu2008] here.',
            styles: {},
          },
        ],
        children: [],
      },
    ];

    const converted = manuscriptTokensToNodes(blocks);

    expect(converted[0].content).toEqual([
      { type: 'text', text: 'Air quality worsens ', styles: {} },
      {
        type: 'citation',
        props: { citationKey: 'li2017; manisalidis2020; pehoiu2008' },
      },
      { type: 'text', text: ' here.', styles: {} },
    ]);
    expect(manuscriptNodesToTokens(converted)).toEqual(blocks);
  });

  it('normalizes cluster spacing and leaves locator forms as text', () => {
    const blocks = [
      {
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'text',
            text: '[@a;@b] but [@a, p. 33] and [@a; b] stay text',
            styles: {},
          },
        ],
        children: [],
      },
    ];

    const converted = manuscriptTokensToNodes(blocks);

    expect(converted[0].content).toEqual([
      { type: 'citation', props: { citationKey: 'a; b' } },
      {
        type: 'text',
        text: ' but [@a, p. 33] and [@a; b] stay text',
        styles: {},
      },
    ]);
    expect(manuscriptNodesToTokens(converted)).toEqual([
      {
        ...blocks[0],
        content: [
          {
            type: 'text',
            text: '[@a; @b] but [@a, p. 33] and [@a; b] stay text',
            styles: {},
          },
        ],
      },
    ]);
  });

  it('splits and rejoins cluster keys through the prop helpers', () => {
    expect(citationKeysFromProp('li2017; manisalidis2020')).toEqual([
      'li2017',
      'manisalidis2020',
    ]);
    expect(citationKeysFromProp('@li2017;@manisalidis2020')).toEqual([
      'li2017',
      'manisalidis2020',
    ]);
    expect(citationKeysFromProp('')).toEqual([]);
    expect(citationKeysToProp(['li2017', 'manisalidis2020'])).toBe(
      'li2017; manisalidis2020',
    );
  });

  it('restores escaped citation and dollar literals through the adapter', () => {
    const markdown = `Escaped \\[@escaped] and \\$5. Keep ${String.fromCodePoint(
      0x2063,
    )} too.`;

    expect(
      manuscriptBlocksToMarkdown(
        testEditor,
        markdownToManuscriptBlocks(testEditor, markdown),
      ),
    ).toBe(markdown);
  });
});
