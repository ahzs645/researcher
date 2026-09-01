import { strFromU8, unzipSync } from 'fflate';
import {
  CommentRangeEnd,
  CommentRangeStart,
  Document,
  type ICommentOptions,
  Packer,
  type Paragraph,
} from 'docx';

import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { exportManuscriptToDocxBlob } from '@/local-db/research/manuscript/manuscriptDocxExport';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import type * as ManuscriptDocxFile from '@/local-db/research/manuscript/manuscriptDocxFile';

// The round trip this app exists for: a manuscript with a co-author's comments
// in it goes out as a real .docx — `word/comments.xml` plus the ranges in the
// body — and comes back in through the reader that read the co-author's file
// in the first place. BlockNote cannot be loaded under jest (its `uuid`
// dependency is ESM-only), so its exporter is replaced by one that does what
// the real one does: run the schema mapping over the blocks and hand the
// result to docx with the document options. Everything from there down —
// docx's XML, the zip, the reader, the parser — is the real thing.

type DocumentOptions = {
  comments?: { children: ICommentOptions[] };
};

type BlockMapping = {
  paragraph: (block: unknown, exporter: unknown) => Paragraph;
  heading: (block: unknown, exporter: unknown) => Paragraph;
};

type CapturedExport = {
  blocks: { type?: string }[];
  documentOptions: DocumentOptions;
  blockMapping: BlockMapping;
  bytes: Uint8Array;
};

const captured: CapturedExport[] = [];

jest.mock('@blocknote/core', () => ({
  BlockNoteSchema: { create: (options: unknown) => options },
  BlockNoteEditor: {
    create: () => {
      const editor = {
        document: [] as unknown[],
        schema: {},
        // Inline content rather than a bare string: a comment range is read
        // off the runs, which is where the paragraph mapping looks.
        tryParseMarkdownToBlocks: (markdown: string) => [
          {
            type: 'paragraph',
            props: {},
            content: [{ type: 'text', text: markdown, styles: {} }],
          },
        ],
        // BlockNote normalizes a block whose content was given as a bare
        // string into inline content; the heading blocks are built that way,
        // and the mapping reads their runs.
        replaceBlocks: (_current: unknown[], next: unknown[]) => {
          editor.document = next.map((block) => {
            const record = block as { content?: unknown };
            return typeof record.content === 'string'
              ? {
                  ...record,
                  content: [{ type: 'text', text: record.content, styles: {} }],
                }
              : block;
          });
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
      const transformInlineContent = () => [];
      const children = blocks.flatMap((block) =>
        block.type === 'heading'
          ? [this.blockMapping.heading(block, { transformInlineContent })]
          : block.type === 'paragraph'
            ? [this.blockMapping.paragraph(block, { transformInlineContent })]
            : [],
      );
      const bytes = await Packer.toBuffer(
        new Document({
          ...options.documentOptions,
          sections: [{ children }],
        }),
      );
      captured.push({
        blocks,
        documentOptions: options.documentOptions,
        blockMapping: this.blockMapping,
        bytes,
      });
      return new Blob([]);
    }
  },
}));

type DocxFileReader = typeof ManuscriptDocxFile;

// Drains a stream the way `Response` would; jsdom ships no `fetch` and the
// reader inflates a zip entry with `new Response(stream).arrayBuffer()`.
class StreamResponse {
  private readonly stream: ReadableStream<Uint8Array>;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.stream = stream;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const reader = this.stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (value !== undefined) {
        chunks.push(value);
        length += value.length;
      }
      if (done) break;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes.buffer;
  }
}

// The reader and docx's packer are browser glue, so Node's implementations of
// what jsdom leaves out go in before either is used.
const installBrowserGlobals = async (): Promise<void> => {
  const { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder } =
    await import('node:util');
  const { Blob: NodeBlob, File: NodeFile } = await import('node:buffer');
  const { DecompressionStream: NodeDecompressionStream } = await import(
    'node:stream/web'
  );
  Object.assign(globalThis as unknown as Record<string, unknown>, {
    TextDecoder: NodeTextDecoder,
    TextEncoder: NodeTextEncoder,
    Blob: NodeBlob,
    File: NodeFile,
    DecompressionStream: NodeDecompressionStream,
    Response: StreamResponse,
  });
};

// Loaded only once those exist: the reader builds a `TextDecoder` at import.
const loadDocxFileReader = async (): Promise<DocxFileReader> =>
  import('@/local-db/research/manuscript/manuscriptDocxFile');

const REVIEWER_COMMENT =
  'Imported comment — Rae Ivy (RI) on 2026-03-04 [on "The window is strictly aligned."]: Justify this window.';

const inputWith = (notes?: string, content?: string): BuildBundleInput => ({
  manuscript: {
    id: 'm1',
    name: 'Aligned windows',
    authorLine: 'Dana Okoro*; Rae Ivy',
  },
  style: { citationMode: 'NUMERIC' },
  sections: [
    {
      id: 'res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 0,
      content:
        content ??
        'Sampling ran for six weeks. The window is strictly aligned.',
      ...(notes === undefined ? {} : { notes }),
    },
  ],
  figures: [],
  references: [],
});

const runExport = async (
  bundleInput: BuildBundleInput,
): Promise<CapturedExport> => {
  captured.length = 0;
  await exportManuscriptToDocxBlob(buildManuscriptBundle(bundleInput));
  return captured[0];
};

const packageEntry = (capture: CapturedExport, entry: string): string =>
  strFromU8(unzipSync(capture.bytes)[entry]);

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

const reimport = async (capture: CapturedExport): Promise<ImportedDocument> => {
  const reader = await loadDocxFileReader();
  const { bytes } = capture;
  return reader.readImportedWordDocument(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
    'round-trip.docx',
  );
};

describe('exportManuscriptToDocxBlob comments', () => {
  beforeAll(installBrowserGlobals);

  it('writes the comment into the comments part and its range into the body', async () => {
    const capture = await runExport(inputWith(REVIEWER_COMMENT));
    const comments = capture.documentOptions.comments?.children ?? [];
    const ranges = mappedParagraphs(capture)
      .flatMap(paragraphChildren)
      .filter(
        (child) =>
          child instanceof CommentRangeStart ||
          child instanceof CommentRangeEnd,
      );

    expect(comments).toHaveLength(1);
    expect(comments[0].author).toBe('Rae Ivy');
    expect(comments[0].initials).toBe('RI');
    expect(ranges).toHaveLength(2);
  });

  it('leaves a manuscript with no comments exactly as it was', async () => {
    const withoutComments = await runExport(inputWith());
    const withOnlyPlainNotes = await runExport(
      inputWith('Chase the ethics approval.'),
    );

    expect(withoutComments.documentOptions.comments).toBeUndefined();
    expect(withOnlyPlainNotes.documentOptions.comments).toBeUndefined();
    expect(JSON.stringify(withOnlyPlainNotes.blocks)).toBe(
      JSON.stringify(withoutComments.blocks),
    );
    // Word's own parts, not just the shape handed to docx. The package as a
    // whole cannot be compared byte for byte — docx stamps `core.xml` with the
    // moment it packed — but the two parts this feature writes are identical.
    expect(packageEntry(withOnlyPlainNotes, 'word/document.xml')).toBe(
      packageEntry(withoutComments, 'word/document.xml'),
    );
    expect(packageEntry(withOnlyPlainNotes, 'word/comments.xml')).toBe(
      packageEntry(withoutComments, 'word/comments.xml'),
    );
  });

  it('sends an unanswered comment back out as its author wrote it', async () => {
    const document = await reimport(
      await runExport(inputWith(REVIEWER_COMMENT)),
    );

    expect(document.sections[0].comments).toEqual([
      {
        commentId: '0',
        author: 'Rae Ivy',
        initials: 'RI',
        // The notes field keeps the day, so the instant comes back at
        // midnight — the day Rae wrote it, which is what was stored.
        date: '2026-03-04T00:00:00.000Z',
        text: 'Justify this window.',
        anchoredText: 'The window is strictly aligned.',
      },
    ]);
  });

  it('round-trips a comment, its anchor and the answer to it', async () => {
    const capture = await runExport(
      inputWith(
        `${REVIEWER_COMMENT}\nReply — The window is set by the instrument duty cycle.`,
      ),
    );
    const document = await reimport(capture);
    const comments = document.sections[0].comments ?? [];

    expect(comments.map((comment) => comment.author)).toEqual([
      'Rae Ivy',
      'Dana Okoro',
    ]);
    expect(comments.map((comment) => comment.anchoredText)).toEqual([
      'The window is strictly aligned.',
      'The window is strictly aligned.',
    ]);
    expect(comments[1].text).toBe(
      'Reply: The window is set by the instrument duty cycle.',
    );
    expect(document.revisionSummary?.commentCount).toBe(2);
  });

  it('re-anchors a comment whose words the author deleted, and says it did', async () => {
    const capture = await runExport(
      inputWith(
        REVIEWER_COMMENT,
        'Sampling ran for six weeks. Every transect was re-run in spring.',
      ),
    );
    const document = await reimport(capture);
    const comment = (document.sections[0].comments ?? [])[0];

    expect(comment.anchoredText).toBe('Sampling ran for six weeks.');
    expect(comment.text).toBe(
      'Justify this window. Originally on: “The window is strictly aligned.” — that text has since been edited.',
    );
  });
});
