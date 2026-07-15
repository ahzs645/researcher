import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { buildBlockNoteDocument } from '@/local-db/research/manuscript/manuscriptBlocks';
import { wrapManuscriptScript } from '@/local-db/research/manuscript/manuscriptScripts';

jest.mock('@blocknote/core', () => ({
  BlockNoteSchema: {
    create: (options: unknown) => options,
  },
  BlockNoteEditor: {
    create: () => {
      const editor = {
        document: [] as unknown[],
        schema: {},
        tryParseMarkdownToBlocks: (markdown: string) => [
          { type: 'paragraph', content: markdown },
        ],
        replaceBlocks: (_current: unknown[], next: unknown[]) => {
          editor.document = next;
        },
      };
      return editor;
    },
  },
  createPageBreakBlockSpec: () => ({}),
  defaultBlockSpecs: {},
}));

describe('buildBlockNoteDocument', () => {
  it('uses a safe title size and marks display math for native Word export', () => {
    const bundle = buildManuscriptBundle({
      manuscript: {
        id: 'paper',
        name: 'A deliberately long manuscript title that must remain visible',
      },
      style: {
        name: 'Journal',
        frontMatterLayout: 'SEPARATE_TITLE_PAGE',
        bodyAlignment: 'JUSTIFIED',
      },
      sections: [
        {
          id: 'title-page',
          name: 'Title page',
          sectionType: 'TITLE_PAGE',
          placement: 'FRONT_MATTER',
          includeInExport: true,
          content: 'Ahmad Jalil; 1 University of Northern British Columbia',
        },
        {
          id: 'methods',
          name: 'Methods',
          sectionType: 'METHODS',
          placement: 'MAIN',
          includeInExport: true,
          content:
            'The contamination factor was calculated as follows.\n\n$$C_{f}=\\frac{C_{metal}}{C_{background}}$$',
        },
      ],
      figures: [
        {
          id: 'table-1',
          name: 'Concentrations',
          assetKind: 'TABLE',
          placement: 'MAIN',
          tableData: '| Metal | Value |\n| --- | --- |\n| Cd | 1 |',
        },
        {
          id: 'figure-1',
          name: 'Chart',
          assetKind: 'FIGURE',
          placement: 'MAIN',
          imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        },
      ],
      references: [],
    });

    const { blocks } = buildBlockNoteDocument(bundle);
    const serialized = JSON.stringify(blocks);

    expect(blocks[0].type).toBe('heading');
    if (blocks[0].type !== 'heading') {
      throw new Error('Expected the first block to be a heading');
    }
    expect(blocks[0].props.level).toBe(1);
    expect(blocks[0].props.textAlignment).toBe('center');
    expect(serialized).toContain('"type":"pageBreak"');
    expect(serialized).toContain('"textAlignment":"justify"');
    expect(serialized).toContain('C_{f}=\\\\frac{C_{metal}}{C_{background}}');
    expect(serialized).toContain('"textColor":"equation"');
    expect(serialized).not.toContain('$$');
    expect(serialized).toContain('"columnWidths":[312,312]');
    expect(serialized).toContain('"previewWidth":600');
    expect(serialized).toContain('Figure 1. Chart');
  });

  it('supports an above-caption option and one figure per page', () => {
    const bundle = buildManuscriptBundle({
      manuscript: { id: 'paper', name: 'Figure layout' },
      style: {
        figureCaptionPosition: 'ABOVE',
        figurePageLayout: 'ONE_PER_PAGE',
      },
      sections: [
        {
          id: 'results',
          name: 'Results',
          placement: 'MAIN',
          content:
            'Before the figure.\n\n[[asset:figure-key]]\n\nAfter the figure.',
        },
      ],
      figures: [
        {
          id: 'figure',
          refKey: 'figure-key',
          name: 'Seasonal composition',
          caption: '',
          assetKind: 'FIGURE',
          placement: 'MAIN',
          imageUrl: 'data:image/png;base64,AAAA',
        },
      ],
      references: [],
    });

    const { blocks } = buildBlockNoteDocument(bundle);
    const imageIndex = blocks.findIndex((block) => block.type === 'image');
    const captionIndex = blocks.findIndex(
      (block) =>
        (block.props as { textColor?: string } | undefined)?.textColor ===
        'figure-caption',
    );

    expect(captionIndex).toBe(imageIndex - 1);
    expect(blocks[captionIndex].content).toBe(
      'Figure 1. Seasonal composition',
    );
    expect(blocks[imageIndex - 2].type).toBe('pageBreak');
    expect(blocks[imageIndex + 1].type).toBe('pageBreak');
  });

  it('keeps a compact abstract on page one before starting the numbered body', () => {
    const bundle = buildManuscriptBundle({
      manuscript: {
        id: 'paper',
        name: 'Co-author review manuscript',
        authorLine: 'Ahmad Jalil; Ann Duong',
        affiliations: '1 University of Northern British Columbia',
      },
      style: {
        name: 'Scientific co-author review (Times)',
        frontMatterLayout: 'TITLE_WITH_ABSTRACT',
        bodyAlignment: 'JUSTIFIED',
        affiliationAlignment: 'LEFT',
        sectionNumbering: true,
      },
      sections: [
        {
          id: 'abstract',
          name: 'Abstract',
          sectionType: 'ABSTRACT',
          placement: 'FRONT_MATTER',
          includeInExport: true,
          content: 'A compact summary for co-author review.',
        },
        {
          id: 'keywords',
          name: 'Keywords',
          sectionType: 'KEYWORDS',
          placement: 'FRONT_MATTER',
          includeInExport: true,
          content: 'Air quality; particulate matter',
        },
        {
          id: 'introduction',
          name: 'Introduction',
          sectionType: 'INTRODUCTION',
          placement: 'MAIN',
          includeInExport: true,
          content: 'The double-spaced manuscript body starts here.',
        },
      ],
      figures: [],
      references: [],
    });

    const { blocks } = buildBlockNoteDocument(bundle);
    const pageBreakIndexes = blocks.flatMap((block, index) =>
      block.type === 'pageBreak' ? [index] : [],
    );
    const introductionIndex = blocks.findIndex(
      (block) =>
        block.type === 'heading' &&
        JSON.stringify(block.content).includes('1. Introduction'),
    );
    const serialized = JSON.stringify(blocks);

    expect(pageBreakIndexes).toHaveLength(1);
    expect(pageBreakIndexes[0]).toBe(introductionIndex - 1);
    expect(serialized).toContain('"textColor":"abstract-body"');
    expect(serialized).toContain('"textAlignment":"justify"');
    expect(serialized).toContain(
      '"textAlignment":"left","textColor":"affiliation-line"',
    );
    expect(serialized).toContain(wrapManuscriptScript('1', 'SUPERSCRIPT'));
    expect(serialized).not.toContain('Title page');

    bundle.style.affiliationNumberStyle = 'BASELINE';
    const baselineSerialized = JSON.stringify(
      buildBlockNoteDocument(bundle).blocks,
    );
    expect(baselineSerialized).not.toContain(
      wrapManuscriptScript('1', 'SUPERSCRIPT'),
    );
  });
});
