import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import {
  mappingSourceWithRevisions,
  resolvedWordBytes,
  wordRevisionsFromBytes,
} from '@/local-db/research/import-wizard/utils/readManuscriptWordRevisions';
import { parseWordMlToMarkdown } from '@/local-db/research/manuscript/manuscriptDocImport';

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Results</w:t></w:r></w:p><w:p><w:commentRangeStart w:id="3"/><w:r><w:t>The window is </w:t></w:r><w:ins w:id="1" w:author="R"><w:r><w:t>strictly </w:t></w:r></w:ins><w:del w:id="2" w:author="R"><w:r><w:delText>loosely </w:delText></w:r></w:del><w:r><w:t>aligned.</w:t></w:r><w:commentRangeEnd w:id="3"/><w:r><w:commentReference w:id="3"/></w:r></w:p></w:body></w:document>`;

const COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="3" w:author="Rae Ivy" w:date="2026-03-04T09:12:00Z"><w:p><w:r><w:t>Justify this window.</w:t></w:r></w:p></w:comment></w:comments>`;

const CLEAN_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>The window is loosely aligned.</w:t></w:r></w:p></w:body></w:document>`;

const wordPackage = (documentXml: string, commentsXml?: string): Uint8Array =>
  zipSync({
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8('<w:styles/>'),
    ...(commentsXml === undefined
      ? {}
      : { 'word/comments.xml': strToU8(commentsXml) }),
  });

const blocksSource = () => ({
  kind: 'blocks' as const,
  blocks: [],
  sourceInfo: { warnings: ['An existing warning.'] },
  sourceName: 'revised.docx',
});

describe('wordRevisionsFromBytes', () => {
  it('reads the counts and the comments out of a revised .docx', () => {
    const revisions = wordRevisionsFromBytes(
      wordPackage(DOCUMENT_XML, COMMENTS_XML),
      'ACCEPT',
    );

    expect(revisions?.summary).toEqual({
      insertionCount: 1,
      deletionCount: 1,
      formattingChangeCount: 0,
      commentCount: 1,
    });
    expect(revisions?.comments).toEqual([
      {
        commentId: '3',
        author: 'Rae Ivy',
        date: '2026-03-04T09:12:00Z',
        text: 'Justify this window.',
        anchoredText: 'The window is strictly aligned.',
        headingText: 'Results',
      },
    ]);
  });

  it('quotes the comment against the text the chosen resolution keeps', () => {
    const revisions = wordRevisionsFromBytes(
      wordPackage(DOCUMENT_XML, COMMENTS_XML),
      'REJECT',
    );

    expect(revisions?.comments[0].anchoredText).toBe(
      'The window is loosely aligned.',
    );
    expect(revisions?.resolution).toBe('REJECT');
  });

  it('has nothing to say about a document with no revisions or comments', () => {
    expect(
      wordRevisionsFromBytes(wordPackage(CLEAN_DOCUMENT_XML), 'ACCEPT'),
    ).toBeNull();
  });

  it('has nothing to say about bytes that are not a .docx', () => {
    expect(
      wordRevisionsFromBytes(new Uint8Array([1, 2, 3]), 'ACCEPT'),
    ).toBeNull();
  });
});

describe('mappingSourceWithRevisions', () => {
  it('adds the summary and the warning without dropping the reader’s own', () => {
    const revisions = wordRevisionsFromBytes(
      wordPackage(DOCUMENT_XML, COMMENTS_XML),
      'ACCEPT',
    );
    const file = new File([], 'revised.docx');

    const source = mappingSourceWithRevisions(blocksSource(), file, revisions);

    expect(source.sourceInfo.revisionSummary).toEqual(revisions?.summary);
    expect(source.sourceInfo.warnings?.[0]).toContain(
      'They are being accepted',
    );
    expect(source.sourceInfo.warnings).toContain('An existing warning.');
    expect(source.wordFile).toBe(file);
  });

  it('replaces the parser’s own revision warning instead of stacking a second', () => {
    // The reader already warned about the revisions it could see; only this
    // side has read `word/comments.xml`, so its count is the one that stands.
    const source = mappingSourceWithRevisions(
      {
        ...blocksSource(),
        sourceInfo: {
          warnings: [
            'This document has 1 comment. Each one is imported into the notes of the section it sits in, with its author and the text it was anchored to.',
            'An existing warning.',
          ],
        },
      },
      new File([], 'revised.docx'),
      wordRevisionsFromBytes(wordPackage(DOCUMENT_XML, COMMENTS_XML), 'ACCEPT'),
    );

    expect(
      source.sourceInfo.warnings?.filter((warning) =>
        warning.startsWith('This document has 1 comment.'),
      ),
    ).toHaveLength(1);
    expect(source.sourceInfo.warnings).toContain('An existing warning.');
  });

  it('keeps no file and changes no warning for a document with no revisions', () => {
    const source = mappingSourceWithRevisions(
      blocksSource(),
      new File([], 'clean.docx'),
      null,
    );

    expect(source.revisions).toBeUndefined();
    expect(source.wordFile).toBeUndefined();
    expect(source.sourceInfo).toEqual(blocksSource().sourceInfo);
  });
});

describe('resolvedWordBytes', () => {
  it('rewrites the body so the package re-reads under the chosen resolution', () => {
    const entries = unzipSync(
      resolvedWordBytes(wordPackage(DOCUMENT_XML, COMMENTS_XML), 'REJECT'),
    );

    expect(
      parseWordMlToMarkdown(strFromU8(entries['word/document.xml'])),
    ).toContain('The window is loosely aligned.');
    // Everything else rides along untouched, which is what keeps images,
    // styles and TIFF conversion identical across the two answers.
    expect(strFromU8(entries['word/styles.xml'])).toBe('<w:styles/>');
    expect(strFromU8(entries['word/comments.xml'])).toBe(COMMENTS_XML);
  });
});
