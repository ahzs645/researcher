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
    expect(blocks[captionIndex].content).toBe('Figure 1. Seasonal composition');
    expect(blocks[imageIndex - 2].type).toBe('pageBreak');
    expect(blocks[imageIndex + 1].type).toBe('pageBreak');
  });

  it('isolates supplementary figures while main figures stay inline', () => {
    const bundle = buildManuscriptBundle({
      manuscript: { id: 'paper', name: 'Mixed figure layout' },
      style: { figurePageLayout: 'SUPPLEMENT_ONE_PER_PAGE' },
      sections: [
        {
          id: 'results',
          name: 'Results',
          placement: 'MAIN',
          content: 'Main before.\n\n[[asset:main-figure]]\n\nMain after.',
        },
        {
          id: 'supplement',
          name: 'Supplementary material',
          placement: 'SUPPLEMENT',
          content:
            'Supplement before.\n\n[[asset:supplement-figure]]\n\nSupplement after.',
        },
      ],
      figures: [
        {
          id: 'main',
          refKey: 'main-figure',
          name: 'Main result',
          assetKind: 'FIGURE',
          placement: 'MAIN',
          imageUrl: 'data:image/png;base64,AAAA',
        },
        {
          id: 'supplement',
          refKey: 'supplement-figure',
          name: 'Supplement result',
          assetKind: 'FIGURE',
          placement: 'SUPPLEMENT',
          imageUrl: 'data:image/png;base64,BBBB',
        },
      ],
      references: [],
    });

    const { blocks } = buildBlockNoteDocument(bundle);
    const imageIndexes = blocks
      .map((block, index) => (block.type === 'image' ? index : -1))
      .filter((index) => index >= 0);
    const [mainImageIndex, supplementImageIndex] = imageIndexes;

    expect(blocks[mainImageIndex - 1].type).not.toBe('pageBreak');
    expect(blocks[mainImageIndex + 1].type).not.toBe('pageBreak');
    expect(blocks[supplementImageIndex - 1].type).toBe('pageBreak');
    expect(blocks[supplementImageIndex + 1].type).toBe('pageBreak');
  });

  it('starts a prepared supplemental-information cover on a new page', () => {
    const bundle = buildManuscriptBundle({
      manuscript: {
        id: 'paper',
        name: 'Organic aerosol concentration in Addis Ababa',
        authorLine: 'Anwar M. N.1,7; Takahama S.2',
        affiliations:
          '1 Air Quality Research Center, University of California, Davis',
      },
      style: { supplementStartLayout: 'NEW_COVER_PAGE' },
      sections: [
        {
          id: 'results',
          name: 'Results',
          placement: 'MAIN',
          content: 'Main-paper results.',
        },
        {
          id: 'supplement',
          name: 'Supplementary Material',
          placement: 'SUPPLEMENT',
          content:
            'Supplemental Information for\n\nOrganic aerosol concentration in Addis Ababa\n\nAnwar M. N.1,7, Takahama S.2',
        },
      ],
      figures: [],
      references: [],
    });

    const { blocks } = buildBlockNoteDocument(bundle);
    const serialized = JSON.stringify(blocks);
    const coverIndex = blocks.findIndex(
      (block) =>
        block.type === 'paragraph' &&
        JSON.stringify(block.content).includes('Supplemental Information for'),
    );

    expect(coverIndex).toBeGreaterThan(0);
    expect(blocks[coverIndex - 1].type).toBe('pageBreak');
    expect(serialized).not.toContain('Supplementary Material');
  });

  it('can generate a supplemental cover independently from its page break setting', () => {
    const bundle = buildManuscriptBundle({
      manuscript: {
        id: 'paper',
        name: 'Organic aerosol concentration in Addis Ababa',
        authorLine: 'Anwar M. N.1,7; Takahama S.2',
        affiliations:
          '1 Air Quality Research Center, University of California, Davis\n2 EPFL, Lausanne, Switzerland',
        supplementTitle: 'Custom supplemental title',
        supplementAuthorLine: 'Supplement Author1',
        supplementAffiliations: '1 Supplement Institute',
      },
      style: {
        supplementStartLayout: 'NEW_PAGE',
        supplementCoverPage: true,
      },
      sections: [
        {
          id: 'conclusion',
          name: 'Conclusion',
          placement: 'MAIN',
          content: 'Conclusion text.',
        },
        {
          id: 'supplement',
          name: 'S2.1: PMF analysis',
          placement: 'SUPPLEMENT',
          content: 'Supplement method.',
        },
      ],
      figures: [],
      references: [],
    });

    const { blocks } = buildBlockNoteDocument(bundle);
    const coverIndex = blocks.findIndex((block) =>
      (JSON.stringify(block.content) ?? '').includes(
        'Supplemental Information for',
      ),
    );
    const serialized = JSON.stringify(blocks);

    expect(blocks[coverIndex - 1].type).toBe('pageBreak');
    expect(serialized).toContain('Custom supplemental title');
    expect(serialized).toContain('Supplement Author');
    expect(serialized).toContain('Supplement Institute');
    expect(serialized).toContain('S2.1: PMF analysis');
    const supplementalMethodIndex = blocks.findIndex((block) =>
      (JSON.stringify(block.content) ?? '').includes('S2.1: PMF analysis'),
    );
    expect(blocks[supplementalMethodIndex - 1].type).toBe('pageBreak');
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

  it('numbers imported nested headings beneath their parent section', () => {
    const bundle = buildManuscriptBundle({
      manuscript: { id: 'paper', name: 'Modular paper' },
      style: { sectionNumbering: true },
      sections: [
        {
          id: 'background',
          name: 'Background and related tools',
          placement: 'MAIN',
          includeInExport: true,
          content:
            'Overview.\n\n### Existing software\nDetails.\n\n[[asset:architecture]]\n\n### Design gap\nRationale.',
        },
      ],
      figures: [
        {
          id: 'architecture',
          refKey: 'architecture',
          name: 'Architecture',
          assetKind: 'FIGURE',
          placement: 'MAIN',
        },
      ],
      references: [],
    });

    const { blocks } = buildBlockNoteDocument(bundle);
    const serialized = JSON.stringify(blocks);

    expect(serialized).toContain('1. Background and related tools');
    expect(serialized).toContain('### 1.1 Existing software');
    expect(serialized).toContain('### 1.2 Design gap');
  });
});
