import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  collectManuscriptSourceImages,
  manuscriptSourceByline,
  manuscriptSourceCaption,
  manuscriptSourceFigureImage,
  manuscriptSourceFiguresByKey,
  manuscriptSourceLabel,
  manuscriptSourceLabelPrefix,
  renderManuscriptSourceBlocks,
  renderManuscriptSourceInline,
  renderManuscriptSourceNodes,
  type ManuscriptSourceBlockWriter,
  type ManuscriptSourceInlineWriter,
  type ManuscriptSourceNodeWriter,
} from '@/local-db/research/manuscript/manuscriptSourceExport';
import { type NumberedFigure } from '@/local-db/research/manuscript/manuscriptTypes';

// The LaTeX and Typst exporters pin what their own targets emit. What is
// pinned here is the seam the extraction created: which traversal step fires,
// in what order and with what payload, whatever a target later does with it.

const figure = (overrides: Partial<NumberedFigure> = {}): NumberedFigure => ({
  id: 'f1',
  number: '1',
  label: 'Figure 1',
  crossRefLabel: 'Figure 1',
  ...overrides,
});

// A writer that records the call instead of writing markup, so a test reads
// the traversal rather than one target's syntax.
const recordingBlockWriter = (
  calls: string[],
): ManuscriptSourceBlockWriter => ({
  paragraph: (text) => {
    calls.push(`paragraph:${text}`);
    return 'P';
  },
  heading: (level, text) => {
    calls.push(`heading:${level}:${text}`);
    return 'H';
  },
  code: (lines) => {
    calls.push(`code:${lines.join('|')}`);
    return 'C';
  },
  displayMath: (lines) => {
    calls.push(`math:${lines.join('|')}`);
    return 'M';
  },
  table: (markdown) => {
    calls.push(`table:${markdown.replace(/\n/g, '|')}`);
    return 'T';
  },
  thematicBreak: 'BREAK',
  list: (items, ordered) => {
    calls.push(`list:${ordered ? 'ordered' : 'bullet'}:${items.join('|')}`);
    return 'L';
  },
  quote: (text) => {
    calls.push(`quote:${text}`);
    return 'Q';
  },
});

describe('renderManuscriptSourceBlocks', () => {
  it('classifies every block kind the composer writes', () => {
    const calls: string[] = [];
    const blocks = renderManuscriptSourceBlocks(
      [
        '## A heading',
        '',
        'A paragraph',
        'wrapped over two lines.',
        '',
        '```',
        'code line',
        '```',
        '',
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        '---',
        '',
        '- one',
        '- two',
        '',
        '1. first',
        '',
        '> quoted',
      ].join('\n'),
      recordingBlockWriter(calls),
    );

    expect(calls).toEqual([
      'heading:2:A heading',
      'paragraph:A paragraph wrapped over two lines.',
      'code:code line',
      'table:| A | B ||| --- | --- ||| 1 | 2 |',
      'list:bullet:one|two',
      'list:ordered:first',
      'quote:quoted',
    ]);
    expect(blocks).toEqual(['H', 'P', 'C', 'T', 'BREAK', 'L', 'L', 'Q']);
  });

  it('reads a fenced display equation whether it closes on its own line or not', () => {
    const spanning: string[] = [];
    renderManuscriptSourceBlocks(
      ['$$', 'a + b', 'c + d', '$$'].join('\n'),
      recordingBlockWriter(spanning),
    );
    expect(spanning).toEqual(['math:|a + b|c + d|']);

    const inline: string[] = [];
    renderManuscriptSourceBlocks(
      '$$ E = mc^2 $$',
      recordingBlockWriter(inline),
    );
    expect(inline).toEqual(['math: E = mc^2 ']);
  });

  it('keeps a paragraph that follows a block from being swallowed by it', () => {
    const calls: string[] = [];
    renderManuscriptSourceBlocks(
      ['- one', 'after the list', '', '> quoted', 'after the quote'].join('\n'),
      recordingBlockWriter(calls),
    );
    expect(calls).toEqual([
      'list:bullet:one',
      'paragraph:after the list',
      'quote:quoted',
      'paragraph:after the quote',
    ]);
  });
});

// Delimiters that could not be mistaken for either real target, so a test
// failure points at the traversal rather than at LaTeX or Typst syntax.
const testInlineWriter: ManuscriptSourceInlineWriter = {
  escape: (value) => value.replace(/[<>]/g, '!'),
  citation: (keys, label) => `CITE(${keys.join('+')}|${label})`,
  crossReference: (refKey, label) => `REF(${refKey}|${label})`,
  footnote: (text, number) => `NOTE(${number ?? '-'}|${text})`,
  displayMath: (math) => `DISPLAY(${math})`,
  inlineMath: (math) => `INLINE(${math})`,
  code: (code) => `CODE(${code})`,
  image: (source, alt) => `IMAGE(${source}|${alt})`,
  link: (href) => ({ open: `LINK(${href}){`, close: '}' }),
  lineBreak: 'BR',
  superscript: { open: 'SUP{', close: '}' },
  subscript: { open: 'SUB{', close: '}' },
  bold: { open: 'B{', close: '}' },
  emphasis: { open: 'I{', close: '}' },
  strikethrough: { open: 'S{', close: '}' },
};

describe('renderManuscriptSourceInline', () => {
  it('walks every inline construct without letting the escaper reach what it wrote', () => {
    expect(
      renderManuscriptSourceInline(
        '**bold** *em* _em_ ~~gone~~ `a<b` $x<y$ [text](http://h) <sup>1</sup>a<br/>b',
        testInlineWriter,
      ),
    ).toBe(
      'B{bold} I{em} I{em} S{gone} CODE(a<b) INLINE(x<y) LINK(http://h){text} SUP{1}aBRb',
    );
  });

  it('escapes the text around what it parked, and inside a wrapper', () => {
    expect(renderManuscriptSourceInline('a<b **c<d**', testInlineWriter)).toBe(
      'a!b B{c!d}',
    );
  });

  it('nests a wrapper inside another, since only the delimiters are parked', () => {
    expect(
      renderManuscriptSourceInline('[link *em*](http://h)', testInlineWriter),
    ).toBe('LINK(http://h){link I{em}}');
    expect(
      renderManuscriptSourceInline('<sup>a `b`</sup>', testInlineWriter),
    ).toBe('SUP{a CODE(b)}');
  });
});

const nodeCallWriter = (
  abstractEnvironment: { open: string; close: string } | null,
): ManuscriptSourceNodeWriter => ({
  heading: (level, text) => `heading:${level}:${text}`,
  supplementBreak: (prefix) => [`break:${prefix}`],
  keywords: (keywords) => `keywords:${keywords}`,
  prose: (markdown) => [`prose:${markdown}`],
  figure: (value) => `figure:${value.id}`,
  table: (value) => `table:${value.id}`,
  equation: (value) => value.equationLatex ?? '',
  bibliography: () => ['bibliography'],
  abstractEnvironment,
});

const nodeBundle = (
  nodes: ManuscriptBundle['nodes'],
): Pick<ManuscriptBundle, 'nodes' | 'style'> => ({ nodes, style: {} });

describe('renderManuscriptSourceNodes', () => {
  it('turns an abstract heading into an environment for a target that has one', () => {
    const body = renderManuscriptSourceNodes(
      nodeBundle([
        { kind: 'heading', level: 3, text: 'Abstract' },
        { kind: 'prose', markdown: 'We test things.' },
        { kind: 'heading', level: 2, text: 'Results' },
      ]),
      nodeCallWriter({ open: 'OPEN', close: 'CLOSE' }),
    );
    expect(body).toEqual([
      'OPEN',
      'prose:We test things.',
      'CLOSE',
      'heading:2:Results',
    ]);
  });

  it('writes the abstract as an ordinary heading for a target with no environment', () => {
    const body = renderManuscriptSourceNodes(
      nodeBundle([
        { kind: 'heading', level: 3, text: 'Abstract' },
        { kind: 'prose', markdown: 'We test things.' },
      ]),
      nodeCallWriter(null),
    );
    expect(body).toEqual(['heading:3:Abstract', 'prose:We test things.']);
  });

  it('closes an open abstract when an asset interrupts it, and at the end', () => {
    const interrupted = renderManuscriptSourceNodes(
      nodeBundle([
        { kind: 'heading', level: 3, text: 'Abstract' },
        { kind: 'figure', figure: figure({ id: 'f1' }) },
      ]),
      nodeCallWriter({ open: 'OPEN', close: 'CLOSE' }),
    );
    expect(interrupted).toEqual(['OPEN', 'CLOSE', 'figure:f1']);

    const unterminated = renderManuscriptSourceNodes(
      nodeBundle([{ kind: 'heading', level: 3, text: 'Abstract' }]),
      nodeCallWriter({ open: 'OPEN', close: 'CLOSE' }),
    );
    expect(unterminated).toEqual(['OPEN', 'CLOSE']);
  });

  it('folds the prose under a keywords heading into the keyword line', () => {
    const body = renderManuscriptSourceNodes(
      nodeBundle([
        { kind: 'heading', level: 3, text: 'Keywords' },
        { kind: 'prose', markdown: 'Keywords: testing; latex' },
        { kind: 'prose', markdown: 'Ordinary prose.' },
      ]),
      nodeCallWriter(null),
    );
    expect(body).toEqual(['keywords:testing; latex', 'prose:Ordinary prose.']);
  });

  it('drops our own References heading, since the bibliography prints one', () => {
    const body = renderManuscriptSourceNodes(
      nodeBundle([
        { kind: 'heading', level: 2, text: 'References' },
        { kind: 'bibliography', entries: [] },
      ]),
      nodeCallWriter(null),
    );
    expect(body).toEqual(['bibliography']);
  });

  it('breaks the page and restarts the counters at the supplement', () => {
    const body = renderManuscriptSourceNodes(
      {
        nodes: [{ kind: 'heading', level: 1, text: 'Supplementary Material' }],
        style: { supplementPrefix: 'SI' },
      },
      nodeCallWriter(null),
    );
    expect(body).toEqual(['break:SI', 'heading:1:Supplementary Material']);
  });

  it('leaves an equation out when it has no body to write', () => {
    const body = renderManuscriptSourceNodes(
      nodeBundle([
        { kind: 'equation', figure: figure({ equationLatex: '' }) },
        { kind: 'equation', figure: figure({ equationLatex: 'E = mc^2' }) },
      ]),
      nodeCallWriter(null),
    );
    expect(body).toEqual(['E = mc^2']);
  });
});

describe('collectManuscriptSourceImages', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';

  it('writes one file per image and names it after the hint', () => {
    const images = collectManuscriptSourceImages();
    expect(images.addImage(PNG, 'My Plot')).toBe('figures/my-plot.png');
    expect(images.imageFiles()).toHaveLength(1);
    expect(images.imageFiles()[0].mimeType).toBe('image/png');
  });

  it('reuses the file when the same image is placed twice', () => {
    const images = collectManuscriptSourceImages();
    expect(images.addImage(PNG, 'first')).toBe('figures/first.png');
    expect(images.addImage(PNG, 'second')).toBe('figures/first.png');
    expect(images.imageFiles()).toHaveLength(1);
  });

  it('suffixes a name two different images both want', () => {
    const images = collectManuscriptSourceImages();
    expect(images.addImage(PNG, 'plot')).toBe('figures/plot.png');
    expect(images.addImage('data:image/png;base64,iVBORw0KGgoB', 'plot')).toBe(
      'figures/plot-2.png',
    );
  });

  it('normalises the extensions a browser spells differently', () => {
    const images = collectManuscriptSourceImages();
    expect(images.addImage('data:image/jpeg;base64,AAA=', 'photo')).toBe(
      'figures/photo.jpg',
    );
    expect(images.addImage('data:image/svg+xml;base64,BBB=', 'drawing')).toBe(
      'figures/drawing.svg',
    );
  });

  it('refuses anything that is not a base64 data URL', () => {
    const images = collectManuscriptSourceImages();
    expect(images.addImage('https://example.org/a.png', 'remote')).toBeNull();
    expect(images.imageFiles()).toHaveLength(0);
  });
});

describe('manuscriptSourceFigureImage', () => {
  const addImage = (): string => 'figures/plot.png';

  it('writes an embedded image out and clamps the width the author set', () => {
    expect(
      manuscriptSourceFigureImage(
        figure({
          imageSource: 'UPLOAD',
          imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
          widthPercent: 4,
        }),
        addImage,
      ),
    ).toEqual({ kind: 'file', filename: 'figures/plot.png', widthPercent: 10 });
  });

  it('names a linked image rather than losing it, since a compile has no network', () => {
    expect(
      manuscriptSourceFigureImage(
        figure({
          imageSource: 'URL',
          imageUrl: 'https://example.org/remote.png',
          label: '',
          name: 'Remote',
        }),
        addImage,
      ),
    ).toEqual({
      kind: 'linked',
      name: 'Remote',
      source: 'https://example.org/remote.png',
    });
  });

  it('reports a figure with no image at all', () => {
    expect(manuscriptSourceFigureImage(figure(), addImage)).toEqual({
      kind: 'missing',
      name: 'Figure 1',
    });
  });
});

describe('the small facts both targets share', () => {
  it('keeps a label to characters either target accepts as an identifier', () => {
    expect(manuscriptSourceLabel(' fig:my plot! ')).toBe('fig:my-plot');
    expect(manuscriptSourceLabel('***')).toBe('label');
  });

  it('takes the word in front of the number out of a journal label format', () => {
    expect(manuscriptSourceLabelPrefix('Fig. {n}.', 'Figure')).toBe('Fig');
    expect(manuscriptSourceLabelPrefix('Table {n}:', 'Table')).toBe('Table');
    expect(manuscriptSourceLabelPrefix('', 'Figure')).toBe('Figure');
    expect(manuscriptSourceLabelPrefix(null, 'Table')).toBe('Table');
  });

  it('falls back from a caption to the figure name, and appends the credit', () => {
    expect(
      manuscriptSourceCaption(figure({ caption: 'A plot.', credit: 'Jane' })),
    ).toBe('A plot. Credit: Jane');
    expect(manuscriptSourceCaption(figure({ name: 'Plot' }))).toBe('Plot');
  });

  it('numbers affiliations in order and points every author at them', () => {
    const byline = manuscriptSourceByline({
      title: 'T',
      authors: 'Smith, Jane [1*]; Doe, John [2]; Nobody, Nemo []',
      abstract: '',
      keywords: [],
      affiliations: '1 University of Tests\n2 Institute of Trials',
      titlePageExtraLines: [],
      correspondingAuthor: '',
      supplementTitle: '',
      supplementAuthors: '',
      supplementAffiliations: '',
      journal: '',
      citationStyleId: '',
      citationMode: '',
    });
    expect(byline.affiliations.map((value) => value.name)).toEqual([
      'University of Tests',
      'Institute of Trials',
    ]);
    expect(
      byline.authors.map(
        (author) =>
          `${author.name}|${author.markers}|${author.isCorresponding}`,
      ),
    ).toEqual([
      'Smith, Jane|1|true',
      'Doe, John|2|false',
      'Nobody, Nemo||false',
    ]);
  });

  it('indexes the assets under the key a cross-reference resolves to', () => {
    const byKey = manuscriptSourceFiguresByKey({
      numberedFigures: [
        figure({ id: 'f1', refKey: 'plot' }),
        figure({ id: 'f2' }),
      ],
    });
    expect([...byKey.keys()]).toEqual(['plot', 'f2']);
  });
});
