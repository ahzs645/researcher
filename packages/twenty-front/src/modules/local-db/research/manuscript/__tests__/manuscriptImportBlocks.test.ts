import {
  assembleImportedDocument,
  collectImportBlockWarnings,
  countImportBlocksNeedingReview,
  deriveImportBlocks,
  deriveImportBlocksFromMarkdown,
  linkImportCaptionOverride,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';
import {
  parseMarkdownDocument,
  type WordMarkdownBlock,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';

describe('manuscript import blocks', () => {
  it('infers captions only from explicit labels', () => {
    const blocks = deriveImportBlocksFromMarkdown(
      [
        'Figure 11 shows the model architecture.',
        'Figure 11. Model architecture.',
        'Table 2: Performance summary.',
      ].join('\n\n'),
    );

    expect(blocks.map((block) => block.role)).toEqual([
      'body',
      'caption',
      'caption',
    ]);
    expect(blocks[1]).toMatchObject({
      captionGuess: { kind: 'FIGURE', sourceLabel: '11' },
      roleConfidence: 'inferred',
    });
    expect(blocks[2]).toMatchObject({
      captionGuess: { kind: 'TABLE', sourceLabel: '2' },
    });
  });

  it('splits a same-Word-paragraph caption before its image', () => {
    const wordBlocks: WordMarkdownBlock[] = [
      {
        kind: 'paragraph',
        markdown:
          'Figure 1. Sampling sites\n\n![Map](data:image/png;base64,AAAA)',
      },
    ];

    expect(deriveImportBlocks(wordBlocks)).toMatchObject([
      {
        index: 0,
        role: 'caption',
        captionGuess: { kind: 'FIGURE', sourceLabel: '1' },
      },
      {
        index: 1,
        role: 'image',
        imageDataUrl: 'data:image/png;base64,AAAA',
      },
    ]);
  });

  it('preserves the parsed document when assembled without overrides', () => {
    const markdown = [
      '# Air quality study',
      '',
      '## Introduction',
      'Opening context.',
      '',
      '## Results',
      'Figure 1. Sampling map.',
      '',
      '![Map](data:image/png;base64,AAAA)',
      '',
      '| Site | Value |',
      '| --- | --- |',
      '| A | 12 |',
    ].join('\n');

    expect(
      assembleImportedDocument(deriveImportBlocksFromMarkdown(markdown), {}),
    ).toEqual(parseMarkdownDocument(markdown));
  });

  it('applies heading, exclusion, and linked-caption overrides', () => {
    const blocks = deriveImportBlocksFromMarkdown(
      [
        '# Paper title',
        '',
        'Results',
        '',
        'Generated sampling map',
        '',
        '![Map](data:image/png;base64,AAAA)',
        '',
        'Remove this note',
      ].join('\n'),
    );
    const results = blocks.find((block) => block.text === 'Results');
    const caption = blocks.find(
      (block) => block.text === 'Generated sampling map',
    );
    const image = blocks.find((block) => block.role === 'image');
    const excluded = blocks.find((block) => block.text === 'Remove this note');
    expect(results).toBeDefined();
    expect(caption).toBeDefined();
    expect(image).toBeDefined();
    expect(excluded).toBeDefined();

    const document = assembleImportedDocument(blocks, {
      [results?.id ?? '']: { role: 'heading', headingLevel: 2 },
      [caption?.id ?? '']: {
        role: 'caption',
        linkedAssetBlockId: image?.id,
        assetKind: 'FIGURE',
      },
      [excluded?.id ?? '']: { excluded: true },
    });

    expect(document.sections[0]).toMatchObject({
      name: 'Results',
      sectionType: 'RESULTS',
    });
    expect(document.sections[0].content).toContain(
      '![Map](data:image/png;base64,AAAA)\n\nFigure 1. Generated sampling map',
    );
    expect(document.sections[0].content).not.toContain('Remove this note');
  });

  it('wraps promoted equations and round-trips edited equation markdown', () => {
    const promotedBlocks = deriveImportBlocksFromMarkdown(
      '# Paper\n\n## Methods\n\nE = mc^2',
    );
    const promotedEquation = promotedBlocks.find(
      (block) => block.text === 'E = mc^2',
    );
    expect(promotedEquation).toBeDefined();
    const promotedDocument = assembleImportedDocument(promotedBlocks, {
      [promotedEquation?.id ?? '']: { role: 'equation' },
    });
    expect(promotedDocument.sections[0].content).toContain('$$E = mc^2$$');

    const equationBlocks = deriveImportBlocksFromMarkdown(
      '# Paper\n\n## Results\n\n$$x + y$$',
    );
    const equation = equationBlocks.find((block) => block.role === 'equation');
    expect(equation).toBeDefined();
    const editedDocument = assembleImportedDocument(equationBlocks, {
      [equation?.id ?? '']: {
        markdown: String.raw`\frac{a}{b}`,
      },
    });
    const roundTripped = deriveImportBlocksFromMarkdown(
      editedDocument.sections[0].content,
    );

    expect(
      roundTripped.find((block) => block.role === 'equation'),
    ).toMatchObject({
      markdown: String.raw`$$\frac{a}{b}$$`,
      text: String.raw`\frac{a}{b}`,
    });
  });

  it('keeps demoted tables and explicit captions as body through preparation', () => {
    const blocks = deriveImportBlocksFromMarkdown(
      [
        '# Paper',
        '',
        '## Results',
        '',
        'Figure 1. Keep this sentence as prose.',
        '',
        '![Map](data:image/png;base64,AAAA)',
        '',
        '| Site | Value |',
        '| --- | --- |',
        '| A | 12 |',
      ].join('\n'),
    );
    const caption = blocks.find((block) => block.role === 'caption');
    const table = blocks.find((block) => block.role === 'table');

    const document = assembleImportedDocument(blocks, {
      [caption?.id ?? '']: { role: 'body' },
      [table?.id ?? '']: { role: 'body' },
    });
    const prepared = prepareManuscriptImport(document, false);

    expect(prepared.figures).toHaveLength(1);
    expect(prepared.figures[0]).toMatchObject({
      assetKind: 'FIGURE',
      caption: '',
    });
    expect(prepared.sections[0].content).toContain(
      'Figure 1. Keep this sentence as prose.',
    );
    expect(prepared.sections[0].content).toContain('Site Value\nA 12');
    expect(prepared.sections[0].content).not.toContain('| --- |');
  });

  it.each([
    {
      captionText: 'Figure 7. Cross-kind table caption.',
      assetMarkdown: '| A | B |\n| --- | --- |\n| 1 | 2 |',
      assetRole: 'table' as const,
      assetKind: 'TABLE' as const,
    },
    {
      captionText: 'Table 4. Cross-kind image caption.',
      assetMarkdown: '![Plot](data:image/png;base64,AAAA)',
      assetRole: 'image' as const,
      assetKind: 'FIGURE' as const,
    },
  ])(
    'rewrites an explicit caption prefix when linking it to $assetKind',
    ({ captionText, assetMarkdown, assetRole, assetKind }) => {
      const blocks = deriveImportBlocksFromMarkdown(
        ['# Paper', '', '## Results', '', captionText, '', assetMarkdown].join(
          '\n',
        ),
      );
      const caption = blocks.find((block) => block.role === 'caption');
      const asset = blocks.find((block) => block.role === assetRole);
      const document = assembleImportedDocument(blocks, {
        [caption?.id ?? '']: {
          linkedAssetBlockId: asset?.id,
          assetKind,
        },
      });
      const prepared = prepareManuscriptImport(document, false);

      expect(prepared.figures).toHaveLength(1);
      expect(prepared.figures[0]).toMatchObject({
        assetKind,
        caption: expect.stringContaining('Cross-kind'),
      });
    },
  );

  it('keeps only one caption link per asset and warns on unsafe duplicate input', () => {
    const blocks = deriveImportBlocksFromMarkdown(
      [
        'Figure 1. First caption.',
        '',
        'Figure 2. Second caption.',
        '',
        '![Plot](data:image/png;base64,AAAA)',
      ].join('\n'),
    );
    const captions = blocks.filter((block) => block.role === 'caption');
    const image = blocks.find((block) => block.role === 'image');
    expect(image).toBeDefined();

    const firstLink = linkImportCaptionOverride(
      {},
      captions[0].id,
      image?.id ?? '',
      'FIGURE',
    );
    const secondLink = linkImportCaptionOverride(
      firstLink,
      captions[1].id,
      image?.id ?? '',
      'FIGURE',
    );
    expect(secondLink[captions[0].id]?.linkedAssetBlockId).toBeUndefined();
    expect(secondLink[captions[1].id]?.linkedAssetBlockId).toBe(image?.id);

    const unsafeOverrides = {
      [captions[0].id]: {
        linkedAssetBlockId: image?.id,
        assetKind: 'FIGURE' as const,
      },
      [captions[1].id]: {
        linkedAssetBlockId: image?.id,
        assetKind: 'FIGURE' as const,
      },
    };
    expect(collectImportBlockWarnings(blocks, unsafeOverrides)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('2 captions are linked to image block'),
      ]),
    );
  });

  it('splits complete equations from surrounding prose and each other', () => {
    const blocks = deriveImportBlocksFromMarkdown(
      ['Leading prose', '$$x=1$$', 'Trailing prose', '$$y=2$$', '$$z=3$$'].join(
        '\n',
      ),
    );

    expect(blocks.map((block) => [block.role, block.text])).toEqual([
      ['body', 'Leading prose'],
      ['equation', 'x=1'],
      ['body', 'Trailing prose'],
      ['equation', 'y=2'],
      ['equation', 'z=3'],
    ]);
  });

  it('keeps cross-extractor duplicate labels unique after assembly', () => {
    const document = assembleImportedDocument(
      deriveImportBlocksFromMarkdown(
        [
          '# Paper',
          '',
          '## Results',
          '![Map](data:image/png;base64,AAAA)',
          'Figure 1. Sampling map.',
          'Figure 1. Planned follow-up.',
        ].join('\n'),
      ),
      {},
    );
    const prepared = prepareManuscriptImport(document, false);

    expect(prepared.figures.map((figure) => figure.refKey)).toEqual([
      'imported-figure-1',
      'imported-figure-1-2',
    ]);
  });

  it('reports duplicate labels, TIFF images, and review sources', () => {
    const blocks = deriveImportBlocksFromMarkdown(
      [
        '# Paper',
        '',
        '## Results',
        '',
        'Figure 2. First result.',
        '',
        '![First](data:image/tiff;base64,AAAA)',
        '',
        'Figure 2. Second result.',
        '',
        '![Second](data:image/png;base64,BBBB)',
      ].join('\n'),
    );
    const warnings = collectImportBlockWarnings(blocks, {});

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('TIFF image block'),
        expect.stringContaining('2 captions are labeled "Figure 2"'),
      ]),
    );
    expect(countImportBlocksNeedingReview(blocks, {})).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('segments structural lines inside newline-heavy markdown', () => {
    const blocks = deriveImportBlocksFromMarkdown(
      [
        'Opening prose line',
        'Figure 3. Inline caption.',
        '![Plot](data:image/png;base64,AAAA)',
        '',
        'Plain heading candidate',
        '',
        '| Site | Value |',
        '| --- | --- |',
        '| A | 12 |',
      ].join('\n'),
    );

    expect(blocks.map((block) => [block.role, block.text])).toEqual([
      ['body', 'Opening prose line'],
      ['caption', 'Figure 3. Inline caption.'],
      ['image', 'Plot'],
      ['body', 'Plain heading candidate'],
      ['table', '| Site | Value |\n| --- | --- |\n| A | 12 |'],
    ]);
  });

  it('merges source metadata, statistics, and warnings at assembly', () => {
    const document = assembleImportedDocument(
      deriveImportBlocksFromMarkdown('## Introduction\n\nBody.'),
      {},
      {
        title: 'Source title',
        authorLine: 'Author One',
        affiliations: 'Example Institute',
        correspondingAuthor: 'Correspondence: author@example.org',
        warnings: ['Source warning'],
        stats: {
          equationCount: 2,
          embeddedImageCount: 1,
          tableCount: 3,
        },
      },
    );

    expect(document).toMatchObject({
      title: 'Source title',
      authorLine: 'Author One',
      affiliations: 'Example Institute',
      correspondingAuthor: 'Correspondence: author@example.org',
      warnings: ['Source warning'],
      stats: {
        equationCount: 2,
        embeddedImageCount: 1,
        tableCount: 3,
      },
    });
  });
});

describe('layout tables in the import map', () => {
  const wordTable = (rows: string[][]): string =>
    [rows[0].map((c) => c).join(' | '), rows[0].map(() => '---').join(' | ')]
      .map((line) => `| ${line} |`)
      .join('\n');

  it('names a numbered equation an equation, and keeps its number', () => {
    const markdown = wordTable([['x̄j,time = Σi wij xi / Σi wij', '(7)']]);
    const blocks = deriveImportBlocks([
      { kind: 'paragraph', markdown: '## Method', sourceHeadingLevel: 2 },
      { kind: 'table', markdown },
    ]);

    expect(blocks[1].role).toBe('equation');
    // The review list shows the maths and its number as the page showed them,
    // not a table grid.
    expect(blocks[1].text).toBe('x̄j,time = Σi wij xi / Σi wij\u2003(7)');
    // And it still serializes as the table the extractor lifts into a
    // numbered EQUATION asset, rather than anonymous display math.
    expect(assembleImportedDocument(blocks, {}).sections[0].content).toContain(
      '| (7) |',
    );
  });

  it('names a one-cell callout body, and unwraps it', () => {
    const markdown = wordTable([['Working-draft status: provisional.']]);
    const blocks = deriveImportBlocks([
      { kind: 'paragraph', markdown: '## Notes', sourceHeadingLevel: 2 },
      { kind: 'table', markdown },
    ]);

    expect(blocks[1].role).toBe('body');
    expect(blocks[1].text).toBe('Working-draft status: provisional.');
    expect(assembleImportedDocument(blocks, {}).sections[0].content).toBe(
      'Working-draft status: provisional.',
    );
  });

  it('leaves a real data table a table', () => {
    const markdown = wordTable([['Site', 'Value']]);
    expect(deriveImportBlocks([{ kind: 'table', markdown }])[0].role).toBe(
      'table',
    );
  });
});
