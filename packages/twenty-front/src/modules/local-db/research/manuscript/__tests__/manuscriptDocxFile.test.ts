import { strToU8, zipSync } from 'fflate';

import { wordRevisionsFromBytes } from '@/local-db/research/import-wizard/utils/readManuscriptWordRevisions';
// Type-only: the module itself is loaded later, once the browser APIs it reads
// at import time exist.
import type * as ManuscriptDocxFile from '@/local-db/research/manuscript/manuscriptDocxFile';

type DocxFileReader = typeof ManuscriptDocxFile;

// Drains a stream the way `Response` would. jsdom ships no `fetch`, and the
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

// The reader is browser-only glue, so the module is loaded after Node's
// implementations of what jsdom leaves out — `TextDecoder`, a `Blob`/`File`
// pair that can be read as bytes, and the deflate stream a real .docx needs.
const loadDocxFileReader = async (): Promise<DocxFileReader> => {
  const { TextDecoder: NodeTextDecoder } = await import('node:util');
  const { Blob: NodeBlob, File: NodeFile } = await import('node:buffer');
  const { DecompressionStream: NodeDecompressionStream } = await import(
    'node:stream/web'
  );
  Object.assign(globalThis as unknown as Record<string, unknown>, {
    TextDecoder: NodeTextDecoder,
    Blob: NodeBlob,
    File: NodeFile,
    DecompressionStream: NodeDecompressionStream,
    Response: StreamResponse,
  });
  return import('@/local-db/research/manuscript/manuscriptDocxFile');
};

const DOCUMENT_NAMESPACE =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

// The tracked paragraph, the comment anchors and the comment body are the ones
// a real reviewed manuscript carries: one insertion, one deletion and one
// comment whose range covers the words it was written about.
const REVIEWED_PARAGRAPH = `<w:p><w:r><w:t xml:space="preserve">The window is </w:t></w:r><w:ins w:id="9001" w:author="Reviewer" w:date="2026-08-01T00:00:00Z"><w:r><w:t xml:space="preserve">strictly </w:t></w:r></w:ins><w:del w:id="9002" w:author="Reviewer" w:date="2026-08-01T00:00:00Z"><w:r><w:delText xml:space="preserve">loosely </w:delText></w:r></w:del><w:commentRangeStart w:id="1"/><w:r><w:t>aligned.</w:t></w:r><w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r></w:p>`;

const CLEAN_PARAGRAPH = `<w:p><w:r><w:t>The window is loosely aligned.</w:t></w:r></w:p>`;

const heading = (text: string): string =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

const documentXml = (bodyXml: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document ${DOCUMENT_NAMESPACE}><w:body>${heading(
    'Results',
  )}${bodyXml}${heading(
    'Discussion',
  )}<w:p><w:r><w:t>The alignment matters for the retrieval.</w:t></w:r></w:p></w:body></w:document>`;

const REVIEWED_DOCUMENT_XML = documentXml(REVIEWED_PARAGRAPH);
const CLEAN_DOCUMENT_XML = documentXml(CLEAN_PARAGRAPH);

const COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8"?><w:comments ${DOCUMENT_NAMESPACE}><w:comment w:id="1" w:author="Hossein Kazemian" w:initials="HK" w:date="2026-08-02T00:00:00Z"><w:p><w:r><w:t>Say which time standard this alignment uses.</w:t></w:r></w:p></w:comment></w:comments>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?><w:styles ${DOCUMENT_NAMESPACE}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;

const wordPackageBytes = (
  bodyDocumentXml: string,
  commentsXml?: string,
  footnotesXml?: string,
): Uint8Array =>
  zipSync({
    'word/document.xml': strToU8(bodyDocumentXml),
    'word/styles.xml': strToU8(STYLES_XML),
    ...(commentsXml === undefined
      ? {}
      : { 'word/comments.xml': strToU8(commentsXml) }),
    ...(footnotesXml === undefined
      ? {}
      : { 'word/footnotes.xml': strToU8(footnotesXml) }),
  });

// A footnote's text is in `word/footnotes.xml` and nowhere else; the body run
// that anchors it carries no text at all. Word's own separator entries live in
// the same part and are not the author's notes.
const FOOTNOTES_XML = `<?xml version="1.0" encoding="UTF-8"?><w:footnotes ${DOCUMENT_NAMESPACE}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="2"><w:p><w:r><w:t>Aligned against UTC.</w:t></w:r></w:p></w:footnote></w:footnotes>`;

const NOTED_PARAGRAPH = `<w:p><w:r><w:t xml:space="preserve">The window is loosely aligned</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="2"/></w:r><w:r><w:t>.</w:t></w:r></w:p>`;

const NOTED_DOCUMENT_XML = documentXml(NOTED_PARAGRAPH);

const wordFile = (bytes: Uint8Array, name = 'reviewed.docx'): File =>
  new File([new Uint8Array(bytes).buffer], name);

const REVIEWED_COMMENT = {
  commentId: '1',
  author: 'Hossein Kazemian',
  initials: 'HK',
  date: '2026-08-02T00:00:00Z',
  text: 'Say which time standard this alignment uses.',
  anchoredText: 'aligned.',
};

describe('readImportedDocumentFile', () => {
  it('carries a reviewer comment with its author and text into the section it was anchored in', async () => {
    const { readImportedDocumentFile } = await loadDocxFileReader();

    const document = await readImportedDocumentFile(
      wordFile(wordPackageBytes(REVIEWED_DOCUMENT_XML, COMMENTS_XML)),
    );

    expect(document.sections[0].name).toBe('Results');
    expect(document.sections[0].comments).toEqual([REVIEWED_COMMENT]);
    expect(document.sections[1].comments).toBeUndefined();
  });

  it('reports the tracked changes and the comments it found', async () => {
    const { readImportedDocumentFile } = await loadDocxFileReader();

    const document = await readImportedDocumentFile(
      wordFile(wordPackageBytes(REVIEWED_DOCUMENT_XML, COMMENTS_XML)),
    );

    expect(document.revisionSummary).toEqual({
      insertionCount: 1,
      deletionCount: 1,
      formattingChangeCount: 0,
      commentCount: 1,
    });
    expect(document.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('They are being accepted'),
        expect.stringContaining('This document has 1 comment.'),
      ]),
    );
    expect(document.sections[0].content).toContain(
      'The window is strictly aligned.',
    );
  });

  it('restores the deleted text when the caller rejects the revisions', async () => {
    const { readImportedDocumentFile } = await loadDocxFileReader();

    const document = await readImportedDocumentFile(
      wordFile(wordPackageBytes(REVIEWED_DOCUMENT_XML, COMMENTS_XML)),
      'REJECT',
    );

    expect(document.sections[0].content).toContain(
      'The window is loosely aligned.',
    );
    expect(document.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('They are being rejected'),
      ]),
    );
    // The comment still arrives, quoted against the text the author is keeping.
    expect(document.sections[0].comments).toEqual([REVIEWED_COMMENT]);
  });

  it('leaves a document with no revisions and no comments exactly as it was', async () => {
    const { readImportedDocumentFile } = await loadDocxFileReader();

    const document = await readImportedDocumentFile(
      wordFile(wordPackageBytes(CLEAN_DOCUMENT_XML), 'clean.docx'),
    );

    expect(document.revisionSummary).toBeUndefined();
    expect(
      document.sections.every((section) => section.comments === undefined),
    ).toBe(true);
    expect(
      (document.warnings ?? []).filter((warning) =>
        warning.startsWith('This document has'),
      ),
    ).toEqual([]);
    expect(document.sections[0].content).toContain(
      'The window is loosely aligned.',
    );
  });
});

describe('footnotes in a .docx package', () => {
  it('reads word/footnotes.xml and puts each note where its anchor sat', async () => {
    const { readImportedDocumentFile } = await loadDocxFileReader();

    const document = await readImportedDocumentFile(
      wordFile(
        wordPackageBytes(NOTED_DOCUMENT_XML, undefined, FOOTNOTES_XML),
        'noted.docx',
      ),
    );

    expect(document.sections[0].content).toContain(
      'The window is loosely aligned^[Aligned against UTC.].',
    );
    expect(document.sections[0].content).not.toContain('separator');
  });

  it('reads a package with no footnotes part exactly as it did before', async () => {
    const { readImportedDocumentFile } = await loadDocxFileReader();

    const document = await readImportedDocumentFile(
      wordFile(wordPackageBytes(CLEAN_DOCUMENT_XML), 'clean.docx'),
    );

    expect(document.sections[0].content).toContain(
      'The window is loosely aligned.',
    );
    expect(document.sections[0].content).not.toContain('^[');
  });
});

describe('the two import entry points', () => {
  it('read the same comments and the same counts out of the same file', async () => {
    const { readImportedDocumentFile, readImportedDocumentSource } =
      await loadDocxFileReader();
    const bytes = wordPackageBytes(REVIEWED_DOCUMENT_XML, COMMENTS_XML);

    const document = await readImportedDocumentFile(wordFile(bytes));
    const source = await readImportedDocumentSource(wordFile(bytes));
    // What the wizard reads for its own step 2, from the same bytes.
    const revisions = wordRevisionsFromBytes(bytes, 'ACCEPT');

    expect(document.revisionSummary).toEqual(revisions?.summary);
    expect(document.sections[0].comments).toEqual(
      revisions?.comments.map(
        ({ headingText: _headingText, ...comment }) => comment,
      ),
    );
    expect(source.kind).toBe('blocks');
    if (source.kind !== 'blocks') return;
    expect(source.sourceInfo.warnings).toEqual(document.warnings);
  });

  it('agree that a document with no revisions has nothing to report', async () => {
    const { readImportedDocumentFile, readImportedDocumentSource } =
      await loadDocxFileReader();
    const bytes = wordPackageBytes(CLEAN_DOCUMENT_XML);

    const document = await readImportedDocumentFile(
      wordFile(bytes, 'clean.docx'),
    );
    const source = await readImportedDocumentSource(
      wordFile(bytes, 'clean.docx'),
    );

    expect(wordRevisionsFromBytes(bytes, 'ACCEPT')).toBeNull();
    expect(document.revisionSummary).toBeUndefined();
    expect(source.kind).toBe('blocks');
    if (source.kind !== 'blocks') return;
    expect(source.sourceInfo.revisionSummary).toBeUndefined();
    expect(source.sourceInfo.warnings).toEqual(document.warnings);
  });
});
