import { type Paragraph } from 'docx';

import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { exportManuscriptToDocxBlob } from '@/local-db/research/manuscript/manuscriptDocxExport';

// What Word is actually given for a number and for the sentences that name it:
// a SEQ field inside a bookmark where the number is printed, a REF field
// pointing at that bookmark wherever the prose refers to it. Asserted on the
// shape handed to docx rather than on the bytes docx then produces, the same
// way the footnote export is tested.

type BlockMapping = {
  paragraph: (block: unknown, exporter: unknown) => Paragraph;
  heading: (block: unknown, exporter: unknown) => Paragraph;
};

type CapturedExport = {
  blocks: {
    type?: string;
    props?: Record<string, unknown>;
    content?: unknown;
  }[];
  blockMapping: BlockMapping;
};

const captured: CapturedExport[] = [];

jest.mock('@blocknote/core', () => ({
  BlockNoteSchema: { create: (options: unknown) => options },
  BlockNoteEditor: {
    create: () => {
      const editor = {
        document: [] as unknown[],
        schema: {},
        tryParseMarkdownToBlocks: (markdown: string) => [
          {
            type: 'paragraph',
            props: {},
            content: [{ type: 'text', text: markdown, styles: {} }],
          },
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

jest.mock('@blocknote/xl-docx-exporter', () => ({
  docxDefaultSchemaMappings: { blockMapping: {}, inlineContentMapping: {} },
  DOCXExporter: class {
    options = { resolveFileUrl: undefined };

    private readonly blockMapping: BlockMapping;

    constructor(_schema: unknown, mappings: { blockMapping: BlockMapping }) {
      this.blockMapping = mappings.blockMapping;
    }

    async toBlob(blocks: CapturedExport['blocks']): Promise<Blob> {
      captured.push({ blocks, blockMapping: this.blockMapping });
      return new Blob([]);
    }
  },
}));

// The real editor normalizes a string `content` into inline runs; the mock
// keeps blocks verbatim, so the same normalization happens here.
const asInlineContent = (content: unknown): unknown =>
  typeof content === 'string'
    ? [{ type: 'text', text: content, styles: {} }]
    : content;

const mapBlocks = (capture: CapturedExport, type: string): Paragraph[] =>
  capture.blocks
    .filter((block) => block.type === type)
    .map((block) =>
      capture.blockMapping[type === 'heading' ? 'heading' : 'paragraph'](
        { ...block, content: asInlineContent(block.content) },
        { transformInlineContent: () => [] },
      ),
    );

const xmlOf = (paragraph: Paragraph): string => JSON.stringify(paragraph);

// Every character the paragraph actually prints, fields included: a SEQ or REF
// field carries the value Word shows before anyone updates it, so this is the
// sentence a reader sees on opening the file.
const printedText = (paragraph: Paragraph): string => {
  const parts: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const node = value as { rootKey?: string; root?: unknown };
    if (node.rootKey === 'w:t' && Array.isArray(node.root)) {
      for (const item of node.root) {
        if (typeof item === 'string') parts.push(item);
      }
      return;
    }
    visit(node.root);
  };
  visit(JSON.parse(JSON.stringify(paragraph)));
  return parts.join('');
};

const input: BuildBundleInput = {
  manuscript: { id: 'm1', name: 'Field paper' },
  style: { citationMode: 'NUMERIC', sectionNumbering: true },
  sections: [
    {
      id: 'section-record-1',
      refKey: 'sec:methods',
      name: 'Methods',
      sectionType: 'METHODS',
      placement: 'MAIN',
      orderIndex: 0,
      content: 'Sampling is described here.',
    },
    {
      id: 'section-record-2',
      refKey: 'sec:results',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 1,
      content:
        'As set out in [#sec:methods], the plume splits — see [#fig:plume-b].',
    },
  ],
  figures: [
    {
      id: 'plume',
      refKey: 'fig:plume',
      name: 'Plume',
      caption: 'The plume.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 0,
      sectionId: 'section-record-2',
    },
    {
      id: 'plume-left',
      refKey: 'fig:plume-left',
      name: 'Left',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 0,
      parentFigureId: 'plume',
    },
    {
      id: 'plume-right',
      refKey: 'fig:plume-right',
      name: 'Right',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 1,
      parentFigureId: 'plume',
    },
  ],
  references: [],
};

const runExport = async (
  bundleInput: BuildBundleInput = input,
): Promise<CapturedExport> => {
  captured.length = 0;
  await exportManuscriptToDocxBlob(buildManuscriptBundle(bundleInput));
  return captured[0];
};

describe('the Word fields a section reference is written as', () => {
  it('defines the section number as a SEQ field inside a bookmark', async () => {
    const headings = (await runExport()).blocks.filter(
      (block) => block.type === 'heading',
    );
    const xml = mapBlocks(await runExport(), 'heading')
      .map(xmlOf)
      .join('');

    expect(headings).not.toHaveLength(0);
    expect(xml).toContain('SEQ Section \\\\* ARABIC');
    expect(xml).toContain('_Refsec_methods');
  });

  it('points the sentence at that bookmark with a REF field', async () => {
    const xml = mapBlocks(await runExport(), 'paragraph')
      .map(xmlOf)
      .join('');
    expect(xml).toContain('REF _Refsec_methods \\\\h');
    // And the heading prints the same number the reference caches.
    expect(mapBlocks(await runExport(), 'heading').map(printedText)).toContain(
      '1. Methods',
    );
  });

  it('leaves a section with no authored key as plain text', async () => {
    const xml = mapBlocks(
      await runExport({
        ...input,
        sections: input.sections.map(({ refKey: _refKey, ...section }) => ({
          ...section,
          content: section.content?.replace('[#sec:methods]', 'Section 1'),
        })),
      }),
      'heading',
    )
      .map(xmlOf)
      .join('');
    expect(xml).not.toContain('SEQ Section');
  });
});

describe('the Word fields a panel reference is written as', () => {
  it('splits "Figure 1b" into the figure’s live number and a literal letter', async () => {
    const xml = mapBlocks(await runExport(), 'paragraph')
      .map(xmlOf)
      .join('');
    // The figure's own bookmark — panels have none, because no counter in Word
    // produces a letter.
    expect(xml).toContain('REF _Reffig_plume \\\\h');
    expect(xml).not.toContain('_Reffig_plume_right');
    // The sentence still reads correctly before anyone updates the fields: the
    // REF's cached "1" and the literal "b" typed beside it.
    expect(
      mapBlocks(await runExport(), 'paragraph').map(printedText),
    ).toContain('As set out in Section 1, the plume splits — see Figure 1b.');
  });

  it('defines the figure’s own number as a SEQ field once', async () => {
    const capture = await runExport();
    const xml = [
      ...mapBlocks(capture, 'paragraph'),
      ...mapBlocks(capture, 'heading'),
    ]
      .map(xmlOf)
      .join('');
    const sequences = xml.match(/SEQ Figure \\\\\* ARABIC/g) ?? [];
    expect(sequences).toHaveLength(1);
  });
});
