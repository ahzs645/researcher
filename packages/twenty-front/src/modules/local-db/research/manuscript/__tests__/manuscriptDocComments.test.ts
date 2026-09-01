import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  anchorManuscriptComments,
  manuscriptImportedSectionNotes,
  manuscriptSectionComments,
  parseManuscriptSectionNotes,
  serializeManuscriptSectionNotes,
  splitManuscriptCommentAnchors,
  stripManuscriptCommentAnchors,
  withManuscriptCommentReply,
} from '@/local-db/research/manuscript/manuscriptComments';
import {
  importedCommentsNote,
  parseWordDocument,
} from '@/local-db/research/manuscript/manuscriptDocImport';

const rangeStart = (commentId: number): string => `\u0006${commentId}\u0003`;
const rangeEnd = (commentId: number): string => `\u0007${commentId}\u0003`;

const wordDocument = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

const COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="7" w:author="Rae Ivy" w:initials="RI" w:date="2026-03-04T09:12:00Z"><w:p><w:r><w:t>Justify this window.</w:t></w:r></w:p></w:comment></w:comments>`;

const COMMENTED_DOCUMENT = wordDocument(
  [
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Results</w:t></w:r></w:p>',
    '<w:p>',
    '<w:r><w:t xml:space="preserve">Sampling ran for six weeks. </w:t></w:r>',
    '<w:commentRangeStart w:id="7"/>',
    '<w:r><w:t>The window is strictly aligned.</w:t></w:r>',
    '<w:commentRangeEnd w:id="7"/>',
    '<w:r><w:commentReference w:id="7"/></w:r>',
    '</w:p>',
  ].join(''),
);

const IMPORTED_NOTE =
  'Imported comment — Rae Ivy (RI) on 2026-03-04 [on "The window is strictly aligned."]: Justify this window.';

const bundleWith = (
  content: string,
  notes?: string,
): ReturnType<typeof buildManuscriptBundle> => {
  const input: BuildBundleInput = {
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
        content,
        ...(notes === undefined ? {} : { notes }),
      },
    ],
    figures: [],
    references: [],
  };
  return buildManuscriptBundle(input);
};

const SECTION_CONTENT =
  'Sampling ran for six weeks. The window is strictly aligned.';

describe('a comment stored in a section note', () => {
  it('keeps the words it was anchored to, not just the section', () => {
    const document = parseWordDocument(COMMENTED_DOCUMENT, {
      commentsXml: COMMENTS_XML,
    });
    const comments = document.sections[0].comments ?? [];

    expect(comments[0].anchoredText).toBe('The window is strictly aligned.');
    expect(importedCommentsNote(comments)).toBe(IMPORTED_NOTE);
  });

  it('reads back out of the notes field exactly as it went in', () => {
    const document = parseWordDocument(COMMENTED_DOCUMENT, {
      commentsXml: COMMENTS_XML,
    });
    const notes = manuscriptImportedSectionNotes(document.sections[0]);

    expect(notes).toBe(IMPORTED_NOTE);
    expect(manuscriptSectionComments(notes)).toEqual([
      {
        author: 'Rae Ivy',
        initials: 'RI',
        date: '2026-03-04',
        anchoredText: 'The window is strictly aligned.',
        text: 'Justify this window.',
      },
    ]);
  });

  it('leaves the author’s own notes where they were when a reply is written', () => {
    const notes = [
      'Ask Dana about the calibration run.',
      IMPORTED_NOTE,
      'Still need the supplementary table.',
    ].join('\n');

    expect(
      withManuscriptCommentReply(
        notes,
        0,
        'Six weeks is the shortest\nusable interval.',
      ),
    ).toBe(
      [
        'Ask Dana about the calibration run.',
        IMPORTED_NOTE,
        'Reply — Six weeks is the shortest usable interval.',
        'Still need the supplementary table.',
      ].join('\n'),
    );
  });

  it('clears the reply when the answer is emptied', () => {
    const answered = withManuscriptCommentReply(IMPORTED_NOTE, 0, 'Because.');

    expect(withManuscriptCommentReply(answered, 0, '   ')).toBe(IMPORTED_NOTE);
    expect(manuscriptSectionComments(answered)[0].reply).toBe('Because.');
  });

  it('treats a line it does not recognise as the note it is', () => {
    const entries = parseManuscriptSectionNotes(
      'Reply — orphaned line\nWord count is over by 200.',
    );

    expect(entries).toEqual([
      { kind: 'note', text: 'Reply — orphaned line' },
      { kind: 'note', text: 'Word count is over by 200.' },
    ]);
    expect(serializeManuscriptSectionNotes(entries)).toBe(
      'Reply — orphaned line\nWord count is over by 200.',
    );
  });

  it('carries a comment with no initials and no date', () => {
    const note =
      'Imported comment — Unknown author: Where is the ethics statement?';

    expect(manuscriptSectionComments(note)).toEqual([
      { author: 'Unknown author', text: 'Where is the ethics statement?' },
    ]);
  });
});

describe('anchorManuscriptComments', () => {
  it('wraps the words the comment was written about', () => {
    const { bundle, comments } = anchorManuscriptComments(
      bundleWith(SECTION_CONTENT, IMPORTED_NOTE),
    );
    const prose = bundle.nodes.find((node) => node.kind === 'prose');

    expect(comments).toEqual([
      {
        commentId: 0,
        author: 'Rae Ivy',
        initials: 'RI',
        date: '2026-03-04',
        text: 'Justify this window.',
        isReply: false,
      },
    ]);
    expect(prose?.kind === 'prose' ? prose.markdown : '').toBe(
      `Sampling ran for six weeks. ${rangeStart(0)}The window is strictly aligned.${rangeEnd(0)}`,
    );
  });

  it('puts the answer on the same words as a second comment', () => {
    const { bundle, comments } = anchorManuscriptComments(
      bundleWith(
        SECTION_CONTENT,
        `${IMPORTED_NOTE}\nReply — The window is set by the instrument duty cycle.`,
      ),
    );
    const prose = bundle.nodes.find((node) => node.kind === 'prose');

    expect(
      comments.map((comment) => [comment.author, comment.isReply]),
    ).toEqual([
      ['Rae Ivy', false],
      ['Dana Okoro', true],
    ]);
    expect(prose?.kind === 'prose' ? prose.markdown : '').toBe(
      `Sampling ran for six weeks. ${rangeStart(0)}${rangeStart(1)}The window is strictly aligned.${rangeEnd(0)}${rangeEnd(1)}`,
    );
  });

  it('anchors on the section’s opening sentence, and says so, when the author deleted the words', () => {
    const { bundle, comments } = anchorManuscriptComments(
      bundleWith(
        'Sampling ran for six weeks. Every transect was re-run in spring.',
        IMPORTED_NOTE,
      ),
    );
    const heading = bundle.nodes.find((node) => node.kind === 'heading');
    const prose = bundle.nodes.find((node) => node.kind === 'prose');

    expect(comments[0].orphanedAnchorText).toBe(
      'The window is strictly aligned.',
    );
    // The heading is left alone: the export reads it to decide whether a
    // section is the abstract or opens the supplement.
    expect(heading?.kind === 'heading' ? heading.text : '').toBe('Results');
    expect(prose?.kind === 'prose' ? prose.markdown : '').toBe(
      `${rangeStart(0)}Sampling ran for six weeks.${rangeEnd(0)} Every transect was re-run in spring.`,
    );
  });

  it('finds the words again after the paragraph around them was rewritten', () => {
    const { comments, bundle } = anchorManuscriptComments(
      bundleWith(
        'We re-ran every transect in the spring.\n\nThe window is strictly aligned. The duty cycle requires it.',
        IMPORTED_NOTE,
      ),
    );

    expect(comments[0].orphanedAnchorText).toBeUndefined();
    expect(
      bundle.nodes.some(
        (node) =>
          node.kind === 'prose' &&
          node.markdown.includes(`${rangeStart(0)}The window`),
      ),
    ).toBe(true);
  });

  it('leaves a manuscript with no comments untouched', () => {
    const source = bundleWith(SECTION_CONTENT);
    const { bundle, comments } = anchorManuscriptComments(source);

    expect(comments).toEqual([]);
    expect(bundle).toBe(source);
  });

  it('leaves prose that is only the author’s own notes untouched', () => {
    const source = bundleWith(SECTION_CONTENT, 'Chase the ethics approval.');
    const { bundle, comments } = anchorManuscriptComments(source);

    expect(comments).toEqual([]);
    expect(bundle).toBe(source);
  });
});

describe('comment anchors', () => {
  it('split into the runs around them and are strippable', () => {
    const anchored = `before ${rangeStart(2)}inside${rangeEnd(2)} after`;

    expect(splitManuscriptCommentAnchors(anchored)).toEqual([
      { kind: 'text', value: 'before ' },
      { kind: 'commentStart', commentId: 2 },
      { kind: 'text', value: 'inside' },
      { kind: 'commentEnd', commentId: 2 },
      { kind: 'text', value: ' after' },
    ]);
    expect(stripManuscriptCommentAnchors(anchored)).toBe('before inside after');
  });
});
