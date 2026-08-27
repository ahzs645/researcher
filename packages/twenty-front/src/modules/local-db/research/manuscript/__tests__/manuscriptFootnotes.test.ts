import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { parseWordDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import { type ExportFile } from '@/local-db/research/manuscript/manuscriptExport';
import {
  hasManuscriptFootnotes,
  manuscriptFootnoteMarkersToScripts,
  manuscriptFootnoteNotesNodes,
  manuscriptFootnoteTexts,
  numberManuscriptFootnotes,
  splitManuscriptFootnotes,
  stripManuscriptFootnotes,
  wrapManuscriptFootnote,
} from '@/local-db/research/manuscript/manuscriptFootnotes';
import {
  manuscriptFootnotesToHtml,
  manuscriptInlineToHtml,
  type ManuscriptHtmlRenderContext,
} from '@/local-db/research/manuscript/manuscriptHtmlMarkdown';
import {
  manuscriptNodesToTokens,
  manuscriptTokensToNodes,
} from '@/local-db/research/manuscript/manuscriptEditorContent';
import { buildJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsExport';
import { parseJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsImport';
import { buildManuscriptLatexFiles } from '@/local-db/research/manuscript/manuscriptLatexExport';
import {
  buildPortableResearchPaperManifest,
  parsePortableResearchPaperManifest,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';
import { wrapManuscriptScript } from '@/local-db/research/manuscript/manuscriptScripts';
import { buildManuscriptTypstFiles } from '@/local-db/research/manuscript/manuscriptTypstExport';

// The numbered anchor as `numberManuscriptFootnotes` emits it, spelled out
// here so a test never has to carry control characters in its own source.
const footnoteAnchor = (number: number, text: string): string =>
  `\u0004${number}\u0011${text}\u0003`;

// ── The token ───────────────────────────────────────────────────────────────

describe('splitManuscriptFootnotes', () => {
  it('takes an inline note out of the sentence it is anchored in', () => {
    expect(
      splitManuscriptFootnotes(
        'The sample was frozen^[Stored at -80 degrees.] overnight.',
      ),
    ).toEqual([
      { kind: 'text', value: 'The sample was frozen' },
      { kind: 'footnote', text: 'Stored at -80 degrees.' },
      { kind: 'text', value: ' overnight.' },
    ]);
  });

  it('lets a note quote a bracket, matching them by depth', () => {
    expect(
      manuscriptFootnoteTexts(
        'Frozen^[See [1] and [2] for the method.] first.',
      ),
    ).toEqual(['See [1] and [2] for the method.']);
  });

  it('reads a Pandoc superscript as a superscript, not as a note', () => {
    // `<sup>[1]</sup>` is exactly what the JATS importer writes, and reading it
    // as a note whose text is "1" would put a phantom footnote in the paper.
    expect(hasManuscriptFootnotes('Chelated^[1]^ iron')).toBe(false);
  });

  it('stops at a paragraph break rather than swallowing the rest of a section', () => {
    expect(hasManuscriptFootnotes('A stray ^[opener\n\nNext paragraph.')).toBe(
      false,
    );
  });

  it('strips a note out for the places that can only print text', () => {
    expect(stripManuscriptFootnotes('Frozen^[Stored cold.] first.')).toBe(
      'Frozen first.',
    );
  });

  it('collapses the whitespace of a note it is asked to write', () => {
    expect(wrapManuscriptFootnote('  Stored\n  cold.  ')).toBe(
      '^[Stored cold.]',
    );
  });
});

// ── Numbering ───────────────────────────────────────────────────────────────

const notedInput = (
  sections: BuildBundleInput['sections'],
): BuildBundleInput => ({
  manuscript: { id: 'm1', name: 'Noted article' },
  style: { citationMode: 'NUMERIC' },
  authors: 'Smith, Jane',
  sections,
  figures: [],
  references: [],
});

const RESULTS_SECTION = {
  id: 'res',
  name: 'Results',
  sectionType: 'RESULTS',
  placement: 'MAIN',
  orderIndex: 1,
  content: 'The yield rose^[Measured in triplicate.] sharply.',
};

const METHODS_SECTION = {
  id: 'met',
  name: 'Methods',
  sectionType: 'METHODS',
  placement: 'MAIN',
  orderIndex: 0,
  content: 'We froze the sample^[Stored at -80 degrees.] overnight.',
};

const numberedProse = (input: BuildBundleInput): string[] => {
  const { bundle } = numberManuscriptFootnotes(buildManuscriptBundle(input));
  return bundle.nodes.flatMap((node) =>
    node.kind === 'prose' ? [node.markdown] : [],
  );
};

describe('numberManuscriptFootnotes', () => {
  it('numbers notes 1 and 2 in the order the document is read', () => {
    const { footnotes } = numberManuscriptFootnotes(
      buildManuscriptBundle(notedInput([METHODS_SECTION, RESULTS_SECTION])),
    );

    expect(footnotes).toEqual([
      { number: 1, text: 'Stored at -80 degrees.' },
      { number: 2, text: 'Measured in triplicate.' },
    ]);
  });

  it('follows the sections when they are reordered', () => {
    const { footnotes } = numberManuscriptFootnotes(
      buildManuscriptBundle(
        notedInput([
          { ...METHODS_SECTION, orderIndex: 1 },
          { ...RESULTS_SECTION, orderIndex: 0 },
        ]),
      ),
    );

    expect(footnotes).toEqual([
      { number: 1, text: 'Measured in triplicate.' },
      { number: 2, text: 'Stored at -80 degrees.' },
    ]);
  });

  it('renumbers when a section is left out of the export', () => {
    const { footnotes } = numberManuscriptFootnotes(
      buildManuscriptBundle(
        notedInput([
          { ...METHODS_SECTION, includeInExport: false },
          RESULTS_SECTION,
        ]),
      ),
    );

    expect(footnotes).toEqual([{ number: 1, text: 'Measured in triplicate.' }]);
  });

  it('replaces the authored token with an anchor carrying the number', () => {
    expect(numberedProse(notedInput([METHODS_SECTION]))).toEqual([
      `We froze the sample${footnoteAnchor(1, 'Stored at -80 degrees.')} overnight.`,
    ]);
  });

  it('numbers a note anchored in a figure caption alongside the prose', () => {
    const { footnotes } = numberManuscriptFootnotes(
      buildManuscriptBundle({
        ...notedInput([METHODS_SECTION]),
        figures: [
          {
            id: 'f1',
            refKey: 'plot',
            name: 'Plot',
            caption: 'Yield over time^[Two runs were discarded.]',
            assetKind: 'FIGURE',
            placement: 'MAIN',
            sectionId: 'met',
            imageSource: 'UPLOAD',
            imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
          },
        ],
      }),
    );

    expect(footnotes).toEqual([
      { number: 1, text: 'Stored at -80 degrees.' },
      { number: 2, text: 'Two runs were discarded.' },
    ]);
  });

  it('leaves a manuscript with no notes exactly as it was', () => {
    const bundle = buildManuscriptBundle(
      notedInput([{ ...METHODS_SECTION, content: 'We froze the sample.' }]),
    );
    const numbered = numberManuscriptFootnotes(bundle);

    expect(numbered.footnotes).toEqual([]);
    expect(numbered.bundle).toBe(bundle);
  });

  it('raises the marker for a target that can only draw text', () => {
    // The same sentinels the importer marks a raised Word run with, so the PDF
    // export's existing script machinery sets the number rather than printing
    // a digit on the baseline.
    expect(
      manuscriptFootnoteMarkersToScripts(
        `Frozen${footnoteAnchor(3, 'Stored cold.')} first.`,
      ),
    ).toBe(`Frozen${wrapManuscriptScript('3', 'SUPERSCRIPT')} first.`);
  });

  it('prints a note the numbering walk never saw rather than dropping it', () => {
    expect(
      manuscriptFootnoteMarkersToScripts('Frozen^[Stored cold.] first.'),
    ).toBe('Frozen (Stored cold.) first.');
  });

  it('writes the end-of-document notes list in printed order', () => {
    expect(
      manuscriptFootnoteNotesNodes([
        { number: 1, text: 'Stored at -80 degrees.' },
        { number: 2, text: 'Measured in triplicate.' },
      ]),
    ).toEqual([
      { kind: 'heading', level: 2, text: 'Notes' },
      {
        kind: 'prose',
        markdown: '1. Stored at -80 degrees.\n2. Measured in triplicate.',
      },
    ]);
    expect(manuscriptFootnoteNotesNodes([])).toEqual([]);
  });
});

// ── The editor ──────────────────────────────────────────────────────────────

describe('the editor round trip', () => {
  it('leaves the token as one run of text, claimed by no inline node', () => {
    // `[@key]`, `[#refKey]` and `$latex$` each become an atomic inline node in
    // the editor; a note must not be mistaken for any of them on the way in or
    // rewritten on the way out.
    const paragraph = {
      type: 'paragraph',
      props: {},
      content: [
        {
          type: 'text',
          text: 'We froze it^[Stored at -80 degrees.] and cited [@smith2020].',
          styles: {},
        },
      ],
      children: [],
    };

    const nodes = manuscriptTokensToNodes([paragraph]);

    expect(nodes[0].content).toEqual([
      {
        type: 'text',
        text: 'We froze it^[Stored at -80 degrees.] and cited ',
        styles: {},
      },
      { type: 'citation', props: { citationKey: 'smith2020' } },
      { type: 'text', text: '.', styles: {} },
    ]);
    expect(manuscriptNodesToTokens(nodes)).toEqual([paragraph]);
  });
});

// ── Word import ─────────────────────────────────────────────────────────────

const WORD_NAMESPACE =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const wordDocument = (bodyXml: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document ${WORD_NAMESPACE}><w:body>${bodyXml}</w:body></w:document>`;

const wordHeading = (text: string): string =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

// The reference run as Word writes it: the FootnoteReference character style,
// a superscript vertical alignment, and no text of its own anywhere in it.
const footnoteReferenceRun = (id: string): string =>
  `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;

const endnoteReferenceRun = (id: string): string =>
  `<w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="${id}"/></w:r>`;

const NOTED_BODY = [
  wordHeading('Methods'),
  `<w:p><w:r><w:t xml:space="preserve">The sample was frozen</w:t></w:r>${footnoteReferenceRun(
    '2',
  )}<w:r><w:t xml:space="preserve"> and thawed</w:t></w:r>${footnoteReferenceRun(
    '3',
  )}<w:r><w:t>.</w:t></w:r></w:p>`,
].join('');

// Word writes its own furniture into the same part: the rule above the notes
// and its continued-on-the-next-page twin, at ids -1 and 0.
const FOOTNOTES_XML = `<?xml version="1.0" encoding="UTF-8"?><w:footnotes ${WORD_NAMESPACE}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="2"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Stored at -80 &#xB0;C for 12 h.</w:t></w:r></w:p></w:footnote><w:footnote w:id="3"><w:p><w:r><w:t>Thawed on ice.</w:t></w:r></w:p></w:footnote></w:footnotes>`;

const ENDNOTES_XML = `<?xml version="1.0" encoding="UTF-8"?><w:endnotes ${WORD_NAMESPACE}><w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote><w:endnote w:id="4"><w:p><w:r><w:t>Raw data are in the repository.</w:t></w:r></w:p></w:endnote></w:endnotes>`;

describe('Word footnotes', () => {
  it('brings a footnote in with its text, at the point it was anchored', () => {
    const document = parseWordDocument(wordDocument(NOTED_BODY), {
      footnotesXml: FOOTNOTES_XML,
    });

    expect(document.sections[0].content).toBe(
      'The sample was frozen^[Stored at -80 °C for 12 h.] and thawed^[Thawed on ice.].',
    );
  });

  it('never imports Word’s separator notes as content', () => {
    const document = parseWordDocument(wordDocument(NOTED_BODY), {
      footnotesXml: FOOTNOTES_XML,
    });

    expect(document.sections[0].content).not.toContain('separator');
    expect(manuscriptFootnoteTexts(document.sections[0].content)).toEqual([
      'Stored at -80 °C for 12 h.',
      'Thawed on ice.',
    ]);
  });

  it('reads endnotes from their own part', () => {
    const body = [
      wordHeading('Data availability'),
      `<w:p><w:r><w:t>The data are open</w:t></w:r>${endnoteReferenceRun('4')}<w:r><w:t>.</w:t></w:r></w:p>`,
    ].join('');

    const document = parseWordDocument(wordDocument(body), {
      endnotesXml: ENDNOTES_XML,
    });

    expect(document.sections[0].content).toBe(
      'The data are open^[Raw data are in the repository.].',
    );
  });

  it('leaves an anchor alone when its note is not in the package', () => {
    const document = parseWordDocument(wordDocument(NOTED_BODY), {});

    expect(document.sections[0].content).toBe(
      'The sample was frozen and thawed.',
    );
  });

  it('reads a document with no notes exactly as it did before', () => {
    const plainBody = [
      wordHeading('Methods'),
      '<w:p><w:r><w:t>The sample was frozen and thawed.</w:t></w:r></w:p>',
    ].join('');

    expect(
      parseWordDocument(wordDocument(plainBody), {
        footnotesXml: FOOTNOTES_XML,
        endnotesXml: ENDNOTES_XML,
      }),
    ).toEqual(parseWordDocument(wordDocument(plainBody)));
  });

  it('drops a note whose anchor the author deleted, once the deletion is accepted', () => {
    const body = [
      wordHeading('Methods'),
      `<w:p><w:r><w:t xml:space="preserve">The sample was frozen</w:t></w:r><w:del w:id="1" w:author="R" w:date="2026-08-01T00:00:00Z">${footnoteReferenceRun(
        '2',
      )}</w:del><w:r><w:t>.</w:t></w:r></w:p>`,
    ].join('');

    expect(
      parseWordDocument(wordDocument(body), { footnotesXml: FOOTNOTES_XML })
        .sections[0].content,
    ).toBe('The sample was frozen.');
    expect(
      parseWordDocument(wordDocument(body), {
        footnotesXml: FOOTNOTES_XML,
        trackedChanges: 'REJECT',
      }).sections[0].content,
    ).toBe('The sample was frozen^[Stored at -80 °C for 12 h.].');
  });
});

// ── Exporters ───────────────────────────────────────────────────────────────

const notedBundle = () =>
  buildManuscriptBundle(notedInput([METHODS_SECTION, RESULTS_SECTION]));

const fileNamed = (files: ExportFile[], suffix: string): string => {
  const file = files.find((candidate) => candidate.filename.endsWith(suffix));
  if (file === undefined || typeof file.content !== 'string') {
    throw new Error(`No ${suffix} file in this export`);
  }
  return file.content;
};

describe('exporters', () => {
  it('LaTeX writes \\footnote and lets LaTeX count them', () => {
    const tex = fileNamed(buildManuscriptLatexFiles(notedBundle()), '.tex');

    expect(tex).toContain(
      'We froze the sample\\footnote{Stored at -80 degrees.} overnight.',
    );
    expect(tex).toContain(
      'The yield rose\\footnote{Measured in triplicate.} sharply.',
    );
  });

  it('LaTeX renders the Markdown inside a note rather than escaping it flat', () => {
    const tex = fileNamed(
      buildManuscriptLatexFiles(
        buildManuscriptBundle(
          notedInput([
            {
              ...METHODS_SECTION,
              content: 'Frozen^[See *Smith* on $\\alpha_1$.] overnight.',
            },
          ]),
        ),
      ),
      '.tex',
    );

    expect(tex).toContain('\\footnote{See \\emph{Smith} on $\\alpha_1$.}');
  });

  it('Typst writes #footnote', () => {
    const typ = fileNamed(buildManuscriptTypstFiles(notedBundle()), '.typ');

    expect(typ).toContain(
      'We froze the sample#footnote[Stored at -80 degrees.] overnight.',
    );
  });

  it('JATS anchors an <xref> in the prose and collects the notes in <fn-group>', () => {
    const xml = buildJatsArticle(notedBundle());

    expect(xml).toContain(
      'We froze the sample<xref ref-type="fn" rid="fn1">1</xref> overnight.',
    );
    expect(xml).toContain(
      'The yield rose<xref ref-type="fn" rid="fn2">2</xref> sharply.',
    );
    expect(xml).toContain('   <fn-group>');
    expect(xml).toContain('    <fn id="fn1">');
    expect(xml).toContain('     <label>1</label>');
    expect(xml).toContain('     <p>Stored at -80 degrees.</p>');
    expect(xml).toContain('  </back>');
  });

  it('JATS leaves an article with no notes without an <fn-group>', () => {
    const xml = buildJatsArticle(
      buildManuscriptBundle(
        notedInput([{ ...METHODS_SECTION, content: 'We froze the sample.' }]),
      ),
    );

    expect(xml).not.toContain('fn-group');
  });

  it('JATS comes back in with its notes inside the sentences they belong to', () => {
    const source = parseJatsArticle(buildJatsArticle(notedBundle()));
    const methods = source.sections.find(
      (section) => section.name === 'Methods',
    );

    expect(methods?.content).toBe(
      'We froze the sample^[Stored at -80 degrees.] overnight.',
    );
  });

  it('JATS leaves an author note in the front matter it belongs to', () => {
    // `<author-notes><fn>` is a note about a person — "deceased", "these
    // authors contributed equally" — not a note on a sentence.
    const source = parseJatsArticle(
      [
        '<article><front><article-meta><title-group>',
        '<article-title>Noted</article-title></title-group>',
        '<contrib-group><contrib contrib-type="author">',
        '<string-name>Jane Smith</string-name>',
        '<xref ref-type="fn" rid="fn-dec"/></contrib></contrib-group>',
        '<author-notes><fn id="fn-dec"><p>Deceased.</p></fn></author-notes>',
        '</article-meta></front><body><sec><title>Methods</title>',
        '<p>We froze the sample overnight.</p>',
        '</sec></body></article>',
      ].join(''),
    );

    expect(source.manuscript.authorLine).toBe('Jane Smith');
    expect(source.sections[0].content).toBe('We froze the sample overnight.');
  });

  it('JATS reads a note written inline, without a <fn-group>', () => {
    const source = parseJatsArticle(
      [
        '<article><front><article-meta><title-group>',
        '<article-title>Inline</article-title>',
        '</title-group></article-meta></front><body><sec><title>Methods</title>',
        '<p>We froze the sample<fn><label>1</label><p>Stored cold.</p></fn> overnight.</p>',
        '</sec></body></article>',
      ].join(''),
    );

    expect(source.sections[0].content).toBe(
      'We froze the sample^[Stored cold.] overnight.',
    );
  });
});

// ── HTML ────────────────────────────────────────────────────────────────────

const htmlContext = (): ManuscriptHtmlRenderContext => ({
  renderCitation: (keys, label) =>
    `<cite data-keys="${keys.join(',')}">${label}</cite>`,
  renderCrossReference: (key, label) => `<ref data-key="${key}">${label}</ref>`,
  renderDisplayMath: (latex) => `<math-display>${latex.trim()}</math-display>`,
  renderInlineMath: (latex) => `<math-inline>${latex.trim()}</math-inline>`,
  tableClass: 'table-academic',
  registerHeading: (_level, text) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
});

describe('HTML footnotes', () => {
  it('marks the anchor with a linked superscript number', () => {
    expect(
      manuscriptInlineToHtml(
        `We froze the sample${footnoteAnchor(1, 'Stored cold.')} overnight.`,
        htmlContext(),
      ),
    ).toBe(
      'We froze the sample<sup class="footnote-ref" id="footnote-ref-1">' +
        '<a href="#footnote-1">1</a></sup> overnight.',
    );
  });

  it('writes the notes list the markers point at', () => {
    expect(
      manuscriptFootnotesToHtml(
        [{ number: 1, text: 'Stored *cold*.' }],
        htmlContext(),
      ),
    ).toBe(
      '<section class="footnotes"><h2>Notes</h2><ol>' +
        '<li id="footnote-1">Stored <em>cold</em>. ' +
        '<a class="footnote-backref" href="#footnote-ref-1" title="Back to text">↩</a>' +
        '</li></ol></section>',
    );
  });

  it('prints a note that was never numbered rather than dropping it', () => {
    expect(
      manuscriptInlineToHtml('Frozen^[Stored cold.] first.', htmlContext()),
    ).toBe('Frozen<span class="footnote-inline">(Stored cold.)</span> first.');
  });
});

// ── The portable package ────────────────────────────────────────────────────

describe('the portable research package', () => {
  it('carries a footnote out and back inside the sentence it belongs to', () => {
    const manifest = buildPortableResearchPaperManifest(
      {
        manuscript: { title: 'Noted article' },
        sections: [METHODS_SECTION],
        figures: [],
        references: [],
      },
      {},
      {},
    );

    const restored = parsePortableResearchPaperManifest(
      JSON.stringify(manifest),
    );

    expect(restored.schemaVersion).toBe(2);
    expect(restored.sections[0].content).toBe(METHODS_SECTION.content);
    expect(manuscriptFootnoteTexts(restored.sections[0].content)).toEqual([
      'Stored at -80 degrees.',
    ]);
  });
});
