import { FootnoteReferenceRun, Paragraph } from 'docx';

import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { exportManuscriptToDocxBlob } from '@/local-db/research/manuscript/manuscriptDocxExport';

// The DOCX export is the one target that writes a *real* Word footnote — a
// reference run in the body, the note itself in `word/footnotes.xml` under the
// same id — so what is worth asserting is the shape handed to docx rather than
// the bytes docx then produces. BlockNote's exporter is replaced by one that
// records the blocks, the document options and the schema mapping, and the
// mapping is then run over the blocks the way the real exporter would.

type DocumentOptions = {
  footnotes?: Record<string, { children: Paragraph[] }>;
};

type BlockMapping = {
  paragraph: (block: unknown, exporter: unknown) => Paragraph;
};

type CapturedExport = {
  blocks: { type?: string }[];
  documentOptions: DocumentOptions;
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
        // Inline content, not a bare string: the paragraph mapping reads the
        // runs, which is where a footnote anchor has to be recognised.
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

    async toBlob(
      blocks: { type?: string }[],
      options: { documentOptions: DocumentOptions },
    ): Promise<Blob> {
      captured.push({
        blocks,
        documentOptions: options.documentOptions,
        blockMapping: this.blockMapping,
      });
      return new Blob([]);
    }
  },
}));

const paragraphChildren = (paragraph: Paragraph): unknown[] =>
  (paragraph as unknown as { root: unknown[] }).root;

const mappedParagraphs = (capture: CapturedExport): Paragraph[] =>
  capture.blocks
    .filter((block) => block.type === 'paragraph')
    .map((block) =>
      capture.blockMapping.paragraph(block, {
        transformInlineContent: () => [],
      }),
    );

const input: BuildBundleInput = {
  manuscript: { id: 'm1', name: 'Noted article' },
  style: { citationMode: 'NUMERIC' },
  authors: 'Smith, Jane',
  sections: [
    {
      id: 'met',
      name: 'Methods',
      sectionType: 'METHODS',
      placement: 'MAIN',
      orderIndex: 0,
      content: 'We froze the sample^[Stored at -80 degrees.] overnight.',
    },
    {
      id: 'res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 1,
      content: 'The yield rose^[Measured in triplicate.] sharply.',
    },
  ],
  figures: [],
  references: [],
};

const runExport = async (
  bundleInput: BuildBundleInput,
): Promise<CapturedExport> => {
  captured.length = 0;
  await exportManuscriptToDocxBlob(buildManuscriptBundle(bundleInput));
  return captured[0];
};

describe('exportManuscriptToDocxBlob', () => {
  it('writes each note into the footnotes part under the id its mark points at', async () => {
    const footnotes = (await runExport(input)).documentOptions.footnotes ?? {};

    expect(Object.keys(footnotes)).toEqual(['1', '2']);
    expect(footnotes['1'].children).toHaveLength(1);
    expect(footnotes['1'].children[0]).toBeInstanceOf(Paragraph);
  });

  it('anchors the body with a Word footnote reference run, not with characters', async () => {
    const capture = await runExport(input);
    const references = mappedParagraphs(capture)
      .flatMap(paragraphChildren)
      .filter((child) => child instanceof FootnoteReferenceRun);

    expect(references).toHaveLength(2);
    expect(JSON.stringify(capture.blocks)).not.toContain('^[');
  });

  it('leaves a manuscript with no notes without a footnotes part', async () => {
    const capture = await runExport({
      ...input,
      sections: [
        { ...input.sections[0], content: 'We froze the sample overnight.' },
        { ...input.sections[1], content: 'The yield rose sharply.' },
      ],
    });

    expect(capture.documentOptions.footnotes).toBeUndefined();
    expect(
      mappedParagraphs(capture)
        .flatMap(paragraphChildren)
        .filter((child) => child instanceof FootnoteReferenceRun),
    ).toHaveLength(0);
  });
});
