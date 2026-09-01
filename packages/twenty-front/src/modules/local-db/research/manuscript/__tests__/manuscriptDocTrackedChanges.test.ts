import {
  attachImportedComments,
  importedCommentsNote,
  parseWordComments,
  parseWordCommentAnchors,
  parseWordDocument,
  parseWordMlToMarkdown,
  parseWordMlToMarkdownBlocks,
  resolveWordFormattingRevisions,
  resolveWordTrackedChanges,
  summarizeWordRevisions,
  type ImportedSectionDraft,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  assembleImportedDocument,
  deriveImportBlocks,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';

const wordDocument = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${body}</w:body></w:document>`;

const heading = (text: string): string =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

const paragraph = (runs: string): string => `<w:p>${runs}</w:p>`;

const REVISED_SENTENCE = paragraph(
  [
    '<w:r><w:t>The window is </w:t></w:r>',
    '<w:ins w:id="1" w:author="R"><w:r><w:t>strictly </w:t></w:r></w:ins>',
    '<w:del w:id="2" w:author="R"><w:r><w:delText>loosely </w:delText></w:r></w:del>',
    '<w:r><w:t>aligned.</w:t></w:r>',
  ].join(''),
);

const REVISED_DOCUMENT = wordDocument(
  `${heading('Results')}${REVISED_SENTENCE}`,
);

const CLEAN_DOCUMENT = wordDocument(
  `${heading('Results')}${paragraph(
    '<w:r><w:t>The window is loosely aligned.</w:t></w:r>',
  )}${heading('Methods')}${paragraph(
    '<w:r><w:t>Samples were collected hourly for six weeks.</w:t></w:r>',
  )}`,
);

const COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="7" w:author="Rae Ivy" w:initials="RI" w:date="2026-03-04T09:12:00Z"><w:p><w:r><w:t>Justify this window.</w:t></w:r></w:p></w:comment><w:comment w:id="8" w:author="Dana Okoro" w:date="2026-03-05T11:00:00Z"><w:p><w:r><w:t>Was this </w:t></w:r><w:r><w:t>pre-registered?</w:t></w:r></w:p></w:comment></w:comments>`;

const COMMENTED_DOCUMENT = wordDocument(
  [
    heading('Results'),
    paragraph(
      [
        '<w:commentRangeStart w:id="7"/>',
        '<w:r><w:t>The window is strictly aligned.</w:t></w:r>',
        '<w:commentRangeEnd w:id="7"/>',
        '<w:r><w:commentReference w:id="7"/></w:r>',
      ].join(''),
    ),
    heading('Methods'),
    paragraph(
      [
        '<w:commentRangeStart w:id="8"/>',
        '<w:r><w:t>Samples were collected hourly.</w:t></w:r>',
        '<w:commentRangeEnd w:id="8"/>',
        '<w:r><w:commentReference w:id="8"/></w:r>',
      ].join(''),
    ),
  ].join(''),
);

const sectionNamed = (
  sections: ImportedSectionDraft[],
  name: string,
): ImportedSectionDraft => {
  const section = sections.find((candidate) => candidate.name === name);
  if (section === undefined) throw new Error(`No section named ${name}`);
  return section;
};

describe('parseWordDocument tracked changes', () => {
  it('accepts tracked changes by default: keeps the insertion, drops the deletion', () => {
    const document = parseWordDocument(REVISED_DOCUMENT);

    expect(sectionNamed(document.sections, 'Results').content).toBe(
      'The window is strictly aligned.',
    );
  });

  it('rejects tracked changes on request: drops the insertion, restores the deletion', () => {
    const document = parseWordDocument(REVISED_DOCUMENT, {
      trackedChanges: 'REJECT',
    });

    expect(sectionNamed(document.sections, 'Results').content).toBe(
      'The window is loosely aligned.',
    );
  });

  it('reports the revision counts on the imported document', () => {
    expect(parseWordDocument(REVISED_DOCUMENT).revisionSummary).toEqual({
      insertionCount: 1,
      deletionCount: 1,
      formattingChangeCount: 0,
      commentCount: 0,
    });
  });

  it('warns which way the tracked changes are being resolved', () => {
    const accepted = parseWordDocument(REVISED_DOCUMENT).warnings ?? [];
    const rejected =
      parseWordDocument(REVISED_DOCUMENT, { trackedChanges: 'REJECT' })
        .warnings ?? [];

    expect(accepted[0]).toBe(
      'This document has tracked changes: 1 insertion and 1 deletion. They are being accepted: inserted text is imported and deleted text is dropped. The revision history itself is not imported.',
    );
    expect(rejected[0]).toContain('They are being rejected');
  });

  it('counts every insertion and deletion, singular or plural', () => {
    const document = wordDocument(
      [
        heading('Results'),
        paragraph(
          [
            '<w:ins w:id="1" w:author="R"><w:r><w:t>One </w:t></w:r></w:ins>',
            '<w:ins w:id="2" w:author="R"><w:r><w:t>two </w:t></w:r></w:ins>',
            '<w:del w:id="3" w:author="R"><w:r><w:delText>three </w:delText></w:r></w:del>',
            '<w:r><w:t>four.</w:t></w:r>',
          ].join(''),
        ),
      ].join(''),
    );

    expect(parseWordDocument(document).revisionSummary).toEqual({
      insertionCount: 2,
      deletionCount: 1,
      formattingChangeCount: 0,
      commentCount: 0,
    });
    expect((parseWordDocument(document).warnings ?? [])[0]).toContain(
      '2 insertions and 1 deletion',
    );
  });

  it('leaves a document with no revisions exactly as it was imported before', () => {
    const before = parseWordDocument(CLEAN_DOCUMENT);
    const rejected = parseWordDocument(CLEAN_DOCUMENT, {
      trackedChanges: 'REJECT',
    });

    expect(before.revisionSummary).toBeUndefined();
    expect(before.warnings).toEqual([]);
    expect(
      before.sections.every((section) => section.comments === undefined),
    ).toBe(true);
    expect(sectionNamed(before.sections, 'Results').content).toBe(
      'The window is loosely aligned.',
    );
    // The resolution is a no-op on a clean document, so neither choice can
    // change what a paper with no revisions imports as.
    expect(rejected).toEqual(before);
    expect(resolveWordTrackedChanges(CLEAN_DOCUMENT, 'REJECT')).toBe(
      CLEAN_DOCUMENT,
    );
  });

  it('resolves an insertion nested inside a deletion in both directions', () => {
    // A co-author deleted text that the first reviewer had inserted: the words
    // survive neither reading.
    const document = wordDocument(
      `${heading('Results')}${paragraph(
        [
          '<w:r><w:t>Values were </w:t></w:r>',
          '<w:del w:id="1" w:author="B"><w:ins w:id="2" w:author="A"><w:r><w:delText>markedly </w:delText></w:r></w:ins></w:del>',
          '<w:r><w:t>stable.</w:t></w:r>',
        ].join(''),
      )}`,
    );

    expect(
      sectionNamed(parseWordDocument(document).sections, 'Results').content,
    ).toBe('Values were stable.');
    expect(
      sectionNamed(
        parseWordDocument(document, { trackedChanges: 'REJECT' }).sections,
        'Results',
      ).content,
    ).toBe('Values were stable.');
  });

  it('treats a moved paragraph as one insertion and one deletion, not two copies', () => {
    const document = wordDocument(
      [
        heading('Results'),
        paragraph(
          '<w:moveTo w:id="1" w:author="R"><w:r><w:t>The calibration ran first.</w:t></w:r></w:moveTo>',
        ),
        paragraph(
          '<w:moveFrom w:id="2" w:author="R"><w:r><w:delText>The calibration ran first.</w:delText></w:r></w:moveFrom>',
        ),
      ].join(''),
    );

    expect(
      sectionNamed(parseWordDocument(document).sections, 'Results').content,
    ).toBe('The calibration ran first.');
    expect(
      sectionNamed(
        parseWordDocument(document, { trackedChanges: 'REJECT' }).sections,
        'Results',
      ).content,
    ).toBe('The calibration ran first.');
    expect(parseWordDocument(document).revisionSummary).toEqual({
      insertionCount: 1,
      deletionCount: 1,
      formattingChangeCount: 0,
      commentCount: 0,
    });
  });

  it('ignores revision marks on paragraph properties, which carry no text', () => {
    const document = wordDocument(
      `${heading('Results')}${paragraph(
        '<w:pPr><w:rPr><w:ins w:id="9" w:author="R"/></w:rPr></w:pPr><w:r><w:t>A split paragraph.</w:t></w:r>',
      )}`,
    );

    expect(summarizeWordRevisions(document)).toEqual({
      insertionCount: 0,
      deletionCount: 0,
      formattingChangeCount: 0,
      commentCount: 0,
    });
    expect(parseWordMlToMarkdown(document)).toContain('A split paragraph.');
  });

  it('never confuses a table border or deleted text with a revision element', () => {
    const document = wordDocument(
      `${heading('Results')}${paragraph(
        '<w:pPr><w:pBdr><w:insideH w:val="single"/></w:pBdr></w:pPr><w:r><w:t>Bordered prose.</w:t></w:r>',
      )}`,
    );

    expect(summarizeWordRevisions(document).insertionCount).toBe(0);
  });
});

describe('word comments', () => {
  it('imports comment bodies with their author, initials and date', () => {
    expect(parseWordComments(COMMENTS_XML)).toEqual([
      {
        commentId: '7',
        author: 'Rae Ivy',
        initials: 'RI',
        date: '2026-03-04T09:12:00Z',
        text: 'Justify this window.',
      },
      {
        commentId: '8',
        author: 'Dana Okoro',
        date: '2026-03-05T11:00:00Z',
        text: 'Was this pre-registered?',
      },
    ]);
  });

  it('attaches each comment to the section it was anchored in', () => {
    const document = parseWordDocument(COMMENTED_DOCUMENT, {
      commentsXml: COMMENTS_XML,
    });

    expect(sectionNamed(document.sections, 'Results').comments).toEqual([
      {
        commentId: '7',
        author: 'Rae Ivy',
        initials: 'RI',
        date: '2026-03-04T09:12:00Z',
        text: 'Justify this window.',
        anchoredText: 'The window is strictly aligned.',
      },
    ]);
    expect(
      sectionNamed(document.sections, 'Methods').comments?.[0],
    ).toMatchObject({
      author: 'Dana Okoro',
      text: 'Was this pre-registered?',
      anchoredText: 'Samples were collected hourly.',
    });
  });

  it('warns how many comments were found and where they land', () => {
    const document = parseWordDocument(COMMENTED_DOCUMENT, {
      commentsXml: COMMENTS_XML,
    });

    expect(document.revisionSummary).toEqual({
      insertionCount: 0,
      deletionCount: 0,
      formattingChangeCount: 0,
      commentCount: 2,
    });
    expect(document.warnings?.[0]).toBe(
      'This document has 2 comments. Each one is imported into the notes of the section it sits in, with its author and the text it was anchored to.',
    );
  });

  it('counts anchored comments even when the comment bodies are missing', () => {
    expect(parseWordDocument(COMMENTED_DOCUMENT).revisionSummary).toEqual({
      insertionCount: 0,
      deletionCount: 0,
      formattingChangeCount: 0,
      commentCount: 2,
    });
  });

  it('renders imported comments as one attributed note line each', () => {
    const document = parseWordDocument(COMMENTED_DOCUMENT, {
      commentsXml: COMMENTS_XML,
    });

    expect(
      importedCommentsNote(
        sectionNamed(document.sections, 'Results').comments ?? [],
      ),
    ).toBe(
      'Imported comment — Rae Ivy (RI) on 2026-03-04 [on "The window is strictly aligned."]: Justify this window.',
    );
  });

  it('survives the map step, which rewrites the document through Markdown', () => {
    const wordBlocks = parseWordMlToMarkdownBlocks(COMMENTED_DOCUMENT);
    const document = assembleImportedDocument(
      deriveImportBlocks(wordBlocks),
      {},
      {
        revisionSummary: summarizeWordRevisions(
          COMMENTED_DOCUMENT,
          COMMENTS_XML,
        ),
      },
      parseWordCommentAnchors(COMMENTED_DOCUMENT, COMMENTS_XML, wordBlocks),
    );

    expect(document.revisionSummary?.commentCount).toBe(2);
    expect(
      sectionNamed(document.sections, 'Results').comments?.[0].author,
    ).toBe('Rae Ivy');
    expect(sectionNamed(document.sections, 'Methods').comments?.[0].text).toBe(
      'Was this pre-registered?',
    );
  });

  it('falls back to the first section when nothing anchors the comment', () => {
    const sections: ImportedSectionDraft[] = [
      {
        name: 'Results',
        sectionType: 'RESULTS',
        placement: 'MAIN',
        content: 'Stable.',
        orderIndex: 0,
        wordCount: 1,
        includeInExport: true,
      },
    ];

    expect(
      attachImportedComments(sections, [
        { commentId: '1', author: 'Rae Ivy', text: 'Orphaned note.' },
      ])[0].comments,
    ).toEqual([{ commentId: '1', author: 'Rae Ivy', text: 'Orphaned note.' }]);
  });
});

// A formatting revision keeps the reviewer's new properties in the run and the
// author's previous ones nested inside them, so a fixture has to be written the
// same way round: current first, `<w:rPrChange>` last.
const rPrChange = (previousProperties: string): string =>
  `<w:rPrChange w:id="41" w:author="Rae Ivy" w:date="2026-03-04T09:12:00Z"><w:rPr>${previousProperties}</w:rPr></w:rPrChange>`;

const pPrChange = (previousProperties: string): string =>
  `<w:pPrChange w:id="42" w:author="Rae Ivy" w:date="2026-03-04T09:12:00Z"><w:pPr>${previousProperties}</w:pPr></w:pPrChange>`;

// A reviewer un-bolded a run the author had bolded as a heading.
const UNBOLDED_RUN = `<w:r><w:rPr><w:sz w:val="24"/>${rPrChange(
  '<w:b/>',
)}</w:rPr><w:t>Coastal transects</w:t></w:r>`;

// A reviewer took the Heading 1 style off a paragraph and left it unstyled.
const UNSTYLED_PARAGRAPH = `<w:p><w:pPr>${pPrChange(
  '<w:pStyle w:val="Heading1"/>',
)}</w:pPr><w:r><w:t>Coastal transects</w:t></w:r></w:p>`;

describe('word formatting revisions', () => {
  it('drops the change element and keeps the current properties when accepting', () => {
    expect(resolveWordFormattingRevisions(UNBOLDED_RUN, 'ACCEPT')).toBe(
      '<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>Coastal transects</w:t></w:r>',
    );
  });

  it('restores the previous properties when rejecting', () => {
    expect(resolveWordFormattingRevisions(UNBOLDED_RUN, 'REJECT')).toBe(
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Coastal transects</w:t></w:r>',
    );
  });

  it('resolves a paragraph properties change the same way in both directions', () => {
    expect(resolveWordFormattingRevisions(UNSTYLED_PARAGRAPH, 'ACCEPT')).toBe(
      '<w:p><w:pPr></w:pPr><w:r><w:t>Coastal transects</w:t></w:r></w:p>',
    );
    expect(resolveWordFormattingRevisions(UNSTYLED_PARAGRAPH, 'REJECT')).toBe(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Coastal transects</w:t></w:r></w:p>',
    );
  });

  it('leaves every run with exactly one properties element under either resolution', () => {
    const propertiesElements = (xml: string): number =>
      (xml.match(/<w:rPr(?![A-Za-z])/g) ?? []).length;

    expect(propertiesElements(UNBOLDED_RUN)).toBe(2);
    expect(
      propertiesElements(
        resolveWordFormattingRevisions(UNBOLDED_RUN, 'ACCEPT'),
      ),
    ).toBe(1);
    expect(
      propertiesElements(
        resolveWordFormattingRevisions(UNBOLDED_RUN, 'REJECT'),
      ),
    ).toBe(1);
  });

  it('leaves a document with no formatting revisions exactly as it was', () => {
    expect(resolveWordFormattingRevisions(CLEAN_DOCUMENT, 'REJECT')).toBe(
      CLEAN_DOCUMENT,
    );
    expect(resolveWordFormattingRevisions(REVISED_DOCUMENT, 'ACCEPT')).toBe(
      REVISED_DOCUMENT,
    );
  });

  it('reads the bold off the properties the resolution chose, not off both', () => {
    // Bold is what makes an unstyled short line a heading. Accepting the
    // reviewer's un-bolding demotes it to prose; rejecting keeps the heading.
    const document = wordDocument(
      `${heading('Results')}${paragraph(UNBOLDED_RUN)}`,
    );

    const accepted = parseWordMlToMarkdown(document);
    const rejected = parseWordMlToMarkdown(document, {
      trackedChanges: 'REJECT',
    });

    expect(accepted).toContain('Coastal transects');
    expect(accepted).not.toContain('# Coastal transects');
    expect(rejected).toContain('### Coastal transects');
  });

  it('reads the paragraph style off the properties the resolution chose', () => {
    const document = wordDocument(`${heading('Results')}${UNSTYLED_PARAGRAPH}`);

    const accepted = parseWordMlToMarkdown(document);
    const rejected = parseWordMlToMarkdown(document, {
      trackedChanges: 'REJECT',
    });

    expect(accepted).toContain('Coastal transects');
    expect(accepted).not.toContain('# Coastal transects');
    expect(rejected).toContain('# Coastal transects');
  });

  it('resolves the bold of a trailing heading run split off after a line break', () => {
    // The trailing-run heading rule reads the *first* `<w:rPr>` of each run, so
    // an unresolved previous copy nested inside the current one made every such
    // run look bold whichever way the author resolved the review.
    const document = wordDocument(
      `${heading('Results')}${paragraph(
        [
          '<w:r><w:t>The instrument settled overnight.</w:t></w:r>',
          '<w:r><w:br/></w:r>',
          `<w:r><w:rPr><w:b/>${rPrChange(
            '<w:sz w:val="24"/>',
          )}</w:rPr><w:t>Coastal transects</w:t></w:r>`,
        ].join(''),
      )}`,
    );

    expect(parseWordMlToMarkdown(document)).toContain('### Coastal transects');
    expect(
      parseWordMlToMarkdown(document, { trackedChanges: 'REJECT' }),
    ).not.toContain('### Coastal transects');
  });

  it('resolves a formatting revision nested inside an inserted run', () => {
    const document = wordDocument(
      `${heading('Results')}${paragraph(
        [
          '<w:r><w:t>Values were </w:t></w:r>',
          `<w:ins w:id="1" w:author="R"><w:r><w:rPr><w:i/>${rPrChange(
            '<w:b/>',
          )}</w:rPr><w:t>markedly </w:t></w:r></w:ins>`,
          '<w:r><w:t>stable.</w:t></w:r>',
        ].join(''),
      )}`,
    );

    // The insertion is one insertion and the restyling of it is one formatting
    // revision — never two insertions.
    expect(summarizeWordRevisions(document)).toEqual({
      insertionCount: 1,
      deletionCount: 0,
      formattingChangeCount: 1,
      commentCount: 0,
    });
    expect(resolveWordTrackedChanges(document, 'ACCEPT')).not.toContain(
      'rPrChange',
    );
    expect(resolveWordTrackedChanges(document, 'REJECT')).not.toContain(
      'rPrChange',
    );
    expect(
      sectionNamed(parseWordDocument(document).sections, 'Results').content,
    ).toBe('Values were markedly stable.');
    expect(
      sectionNamed(
        parseWordDocument(document, { trackedChanges: 'REJECT' }).sections,
        'Results',
      ).content,
    ).toBe('Values were stable.');
  });

  it('counts formatting revisions and reports them even when nothing else changed', () => {
    const document = wordDocument(
      `${heading('Results')}${paragraph(UNBOLDED_RUN)}${UNSTYLED_PARAGRAPH}`,
    );

    expect(parseWordDocument(document).revisionSummary).toEqual({
      insertionCount: 0,
      deletionCount: 0,
      formattingChangeCount: 2,
      commentCount: 0,
    });
    expect(parseWordDocument(document).warnings?.[0]).toBe(
      'This document has 2 formatting revisions. They are being accepted: the formatting the reviewer set is used. Formatting is only read where it decides structure — a bold run or a heading style becoming a heading — and is not imported as styling.',
    );
    expect(
      parseWordDocument(document, { trackedChanges: 'REJECT' }).warnings?.[0],
    ).toBe(
      'This document has 2 formatting revisions. They are being rejected: the formatting from before the review is used. Formatting is only read where it decides structure — a bold run or a heading style becoming a heading — and is not imported as styling.',
    );
  });

  it('warns about formatting revisions alongside the insertions and deletions', () => {
    const document = wordDocument(
      `${heading('Results')}${REVISED_SENTENCE}${paragraph(UNBOLDED_RUN)}`,
    );
    const warnings = parseWordDocument(document).warnings ?? [];

    expect(warnings[0]).toContain('1 insertion and 1 deletion');
    expect(warnings[1]).toContain('This document has 1 formatting revision.');
  });

  it('never counts a formatting revision as an insertion or a deletion', () => {
    // The previous copy of a paragraph mark's properties carries the `w:ins`
    // that marked the paragraph split; counting it would invent an insertion.
    const document = wordDocument(
      `${heading('Results')}${paragraph(
        `<w:pPr><w:rPr><w:ins w:id="9" w:author="R"/></w:rPr>${pPrChange(
          '<w:rPr><w:ins w:id="9" w:author="R"/></w:rPr>',
        )}</w:pPr><w:r><w:t>A split paragraph.</w:t></w:r>`,
      )}`,
    );

    expect(summarizeWordRevisions(document)).toEqual({
      insertionCount: 0,
      deletionCount: 0,
      formattingChangeCount: 1,
      commentCount: 0,
    });
    expect(parseWordMlToMarkdown(document)).toContain('A split paragraph.');
  });
});
