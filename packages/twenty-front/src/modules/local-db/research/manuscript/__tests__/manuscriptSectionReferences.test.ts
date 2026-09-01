import {
  buildManuscriptBundle,
  type BuildBundleInput,
  type ManuscriptBundle,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ExportFile } from '@/local-db/research/manuscript/manuscriptExport';
import { exportManuscriptToHtml } from '@/local-db/research/manuscript/manuscriptHtmlExport';
import { buildJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsExport';
import { buildManuscriptLatexFiles } from '@/local-db/research/manuscript/manuscriptLatexExport';
import { buildManuscriptTypstFiles } from '@/local-db/research/manuscript/manuscriptTypstExport';

// "See Section 3" — a sentence that points at a section and follows it when the
// section moves. The number is the one the block builder prints for that
// heading, because there is only one section counter.

const input: BuildBundleInput = {
  manuscript: { id: 'm1', name: 'Sectioned paper' },
  style: { citationMode: 'NUMERIC', sectionNumbering: true },
  sections: [
    {
      id: 'record-abstract',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'A summary.',
    },
    {
      id: 'record-intro',
      refKey: 'sec:intro',
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      orderIndex: 1,
      content: 'The design is set out in [#sec:methods].',
    },
    {
      id: 'record-methods',
      refKey: 'sec:methods',
      name: 'Methods',
      sectionType: 'METHODS',
      placement: 'MAIN',
      orderIndex: 2,
      content: 'Sampling ran for a year.',
    },
    {
      id: 'record-results',
      refKey: 'sec:results',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 3,
      content: 'Reported against [#sec:intro].',
    },
  ],
  figures: [],
  references: [],
};

const bundleWith = (
  overrides: Partial<BuildBundleInput> = {},
): ManuscriptBundle =>
  buildManuscriptBundle({ ...input, ...overrides }, undefined, {
    citationAnchors: true,
    crossReferenceAnchors: true,
  });

const textOf = (files: ExportFile[], filename: string): string => {
  const file = files.find((candidate) => candidate.filename === filename);
  return typeof file?.content === 'string' ? file.content : '';
};

const proseOf = (bundle: ManuscriptBundle): string[] =>
  bundle.nodes.flatMap((node) =>
    node.kind === 'prose' ? [node.markdown] : [],
  );

describe('a reference to a section', () => {
  it('prints the number the section counter gave that heading', () => {
    const bundle = buildManuscriptBundle(input);
    expect(
      Object.fromEntries(
        bundle.numberedSections.map((section) => [section.id, section.number]),
      ),
    ).toEqual({
      'record-abstract': '',
      'record-intro': '1',
      'record-methods': '2',
      'record-results': '3',
    });
    expect(proseOf(bundle)).toContain('The design is set out in Section 2.');
    expect(proseOf(bundle)).toContain('Reported against Section 1.');
    expect(bundle.warnings).toEqual([]);
  });

  it('follows the section when it moves', () => {
    const reordered = buildManuscriptBundle({
      ...input,
      sections: input.sections.map((section) =>
        section.id === 'record-methods'
          ? { ...section, orderIndex: 0.5 }
          : section,
      ),
    });
    // Methods now runs before the introduction, so it is Section 1 and the
    // sentence pointing at it says so without anyone editing the sentence.
    expect(proseOf(reordered)).toContain('The design is set out in Section 1.');
    expect(proseOf(reordered)).toContain('Reported against Section 2.');
  });

  it('names the section when the journal numbers nothing', () => {
    const unnumbered = buildManuscriptBundle({
      ...input,
      style: { citationMode: 'NUMERIC' },
    });
    expect(proseOf(unnumbered)).toContain('The design is set out in Methods.');
  });

  it('reports a key that names nothing, and leaves the token visible', () => {
    const dangling = buildManuscriptBundle({
      ...input,
      sections: input.sections.map((section) =>
        section.id === 'record-intro'
          ? { ...section, content: 'See [#sec:nowhere].' }
          : section,
      ),
    });
    expect(proseOf(dangling)).toContain('See [#sec:nowhere].');
    expect(dangling.warnings).toEqual([
      'Section "Introduction" references unknown asset [#sec:nowhere]',
    ]);
  });

  it('still resolves after a per-journal version stands in for the section', () => {
    const withVersion = buildManuscriptBundle({
      ...input,
      style: {
        citationMode: 'NUMERIC',
        sectionNumbering: true,
        profileKey: 'mdpi:atmosphere',
      },
      sections: [
        ...input.sections,
        {
          // A version is an ordinary section record naming the base it
          // rewords; it keeps the base's id, key and place in the sequence.
          id: 'record-methods-short',
          name: 'Methods (short)',
          placement: 'MAIN',
          orderIndex: 2,
          variantOfId: 'record-methods',
          variantProfileKey: 'mdpi:atmosphere',
          content: 'Sampling ran for a year, in brief.',
        },
      ],
    });
    const methods = withVersion.numberedSections.find(
      (section) => section.id === 'record-methods',
    );
    expect(methods?.number).toBe('2');
    expect(methods?.name).toBe('Methods (short)');
    // The reference was written against the base and still resolves.
    expect(proseOf(withVersion)).toContain(
      'The design is set out in Section 2.',
    );
    expect(
      proseOf(withVersion).some((prose) =>
        prose.includes('Sampling ran for a year, in brief.'),
      ),
    ).toBe(true);
  });

  it('leaves a paper with no section keys exactly as it was', () => {
    const plain = buildManuscriptBundle({
      ...input,
      sections: input.sections.map(({ refKey: _refKey, ...section }) => ({
        ...section,
        content: (section.content ?? '').replace(
          /\[#sec:[a-z]+\]/g,
          'the next section',
        ),
      })),
    });
    expect(plain.warnings).toEqual([]);
    expect(proseOf(plain)).toContain(
      'The design is set out in the next section.',
    );
  });
});

describe('each exporter’s section-reference construct', () => {
  it('LaTeX labels the section and lets \\ref print its number', () => {
    const tex = textOf(
      buildManuscriptLatexFiles(bundleWith()),
      'sectioned-paper.tex',
    );
    expect(tex).toContain('\\section{Methods}\n\\label{sec:methods}');
    expect(tex).toContain('set out in Section~\\ref{sec:methods}');
    // An unnumbered heading is starred, so it gets no label a \ref could use.
    expect(tex).not.toContain('\\label{sec:abstract}');
  });

  it('LaTeX writes a reference to an unnumbered section as its title', () => {
    const tex = textOf(
      buildManuscriptLatexFiles(
        bundleWith({ style: { citationMode: 'NUMERIC' } }),
      ),
      'sectioned-paper.tex',
    );
    expect(tex).toContain('set out in Methods.');
    expect(tex).not.toContain('\\ref{sec:methods}');
  });

  it('Typst labels the heading and refs it', () => {
    const typ = textOf(
      buildManuscriptTypstFiles(bundleWith()),
      'sectioned-paper.typ',
    );
    expect(typ).toContain('= Methods <sec:methods>');
    expect(typ).toContain('set out in @sec:methods');
  });

  it('Typst prints a reference to an unnumbered section as text', () => {
    const typ = textOf(
      buildManuscriptTypstFiles(
        bundleWith({ style: { citationMode: 'NUMERIC' } }),
      ),
      'sectioned-paper.typ',
    );
    expect(typ).toContain('set out in Methods.');
    expect(typ).not.toContain('@sec:methods');
  });

  it('HTML links the sentence to the heading’s own anchor', async () => {
    const html = await exportManuscriptToHtml(buildManuscriptBundle(input));
    expect(html).toContain('id="section-sec-methods"');
    expect(html).toContain(
      '<a class="crossref" href="#section-sec-methods">Section 2</a>',
    );
    // …and prints that number on the heading, so both ends of the reference
    // show the same thing.
    expect(html).toContain('</span>2. Methods</h2>');
  });

  it('HTML numbers nothing when the journal numbers nothing', async () => {
    const html = await exportManuscriptToHtml(
      buildManuscriptBundle({ ...input, style: { citationMode: 'NUMERIC' } }),
    );
    expect(html).toContain('</span>Methods</h2>');
  });

  it('JATS gives the section the id the reference names', () => {
    const jats = buildJatsArticle(buildManuscriptBundle(input));
    expect(jats).toContain('<sec id="sec:methods">');
    // A section the author never keyed keeps the plain <sec> it always had.
    expect(jats).toContain('   <sec>\n    <title>Abstract</title>');
  });
});
