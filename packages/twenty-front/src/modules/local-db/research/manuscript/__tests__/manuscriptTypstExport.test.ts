import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ExportFile } from '@/local-db/research/manuscript/manuscriptExport';
import {
  buildManuscriptTypstFiles,
  latexToTypstMath,
} from '@/local-db/research/manuscript/manuscriptTypstExport';

const input: BuildBundleInput = {
  manuscript: {
    id: 'm1',
    name: 'Test article',
    affiliations: '1 University of Tests\n2 Institute of Trials',
    correspondingAuthor: 'jane@example.org',
  },
  style: { citationMode: 'NUMERIC' },
  authors: 'Smith, Jane [1*]; Doe, John [2]',
  sections: [
    {
      id: 'abs',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'We test things.',
    },
    {
      id: 'kw',
      name: 'Keywords',
      sectionType: 'KEYWORDS',
      placement: 'FRONT_MATTER',
      orderIndex: 1,
      content: 'testing; typst',
    },
    {
      id: 'res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content: 'It works [@smith2020], see [#fig:plot] and [#eq1].',
    },
    {
      id: 'sup',
      name: 'Supplement',
      sectionType: 'SUPPLEMENT',
      placement: 'SUPPLEMENT',
      orderIndex: 3,
      content: 'Extra.',
    },
  ],
  figures: [
    {
      id: 'f1',
      refKey: 'plot',
      name: 'Plot',
      caption: 'Yield rose 50% & $3 per unit_year.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      sectionId: 'res',
      imageSource: 'UPLOAD',
      imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
    },
    {
      id: 't1',
      refKey: 'grid',
      name: 'Grid',
      caption: 'A table.',
      assetKind: 'TABLE',
      placement: 'MAIN',
      sectionId: 'res',
      tableData: '| A | B |\n| --- | --- |\n| 1 | 2 |',
    },
    {
      id: 'e1',
      refKey: 'eq1',
      name: 'Eq',
      assetKind: 'EQUATION',
      placement: 'MAIN',
      sectionId: 'res',
      equationLatex: 'E = mc^2',
    },
  ],
  references: [
    {
      id: 'r1',
      citationKey: 'smith2020',
      name: 'A study',
      authors: 'Smith, Jane',
      year: 2020,
      containerTitle: 'Journal of Tests',
      pages: '10-20',
      doi: '10.1000/ref',
      cslType: 'ARTICLE_JOURNAL',
    },
  ],
};

const exportTypst = (overrides: Partial<BuildBundleInput> = {}): ExportFile[] =>
  buildManuscriptTypstFiles(
    buildManuscriptBundle({ ...input, ...overrides }, undefined, {
      citationAnchors: true,
      crossReferenceAnchors: true,
    }),
  );

const textOf = (files: ExportFile[], filename: string): string => {
  const file = files.find((candidate) => candidate.filename === filename);
  return typeof file?.content === 'string' ? file.content : '';
};

describe('buildManuscriptTypstFiles', () => {
  const files = exportTypst();
  const typ = textOf(files, 'test-article.typ');

  it('returns a .typ, a .bib and every figure image as its own file', () => {
    expect(files.map((file) => file.filename)).toEqual([
      'test-article.typ',
      'references.bib',
      'figures/plot.png',
    ]);
    expect(files[2].mimeType).toBe('image/png');
  });

  it('sets the page, font and spacing from the journal style', () => {
    expect(typ).toContain('#set page(paper: "a4", margin: 72pt');
    expect(typ).toContain('size: 12pt)');
    expect(typ).toContain('leading: 0.98em');
  });

  it('carries the title, affiliation markers and corresponding author', () => {
    expect(typ).toContain('#set document(title: "Test article"');
    expect(typ).toContain(
      '#block[Smith, Jane#super[1]#super[\\*], Doe, John#super[2]]',
    );
    expect(typ).toContain('#super[1]University of Tests');
    expect(typ).toContain('#super[\\*]jane\\@example.org');
    expect(typ).toContain('*Keywords:* testing; typst');
  });

  it('escapes Typst syntax characters in a caption', () => {
    expect(typ).toContain('caption: [Yield rose 50% & \\$3 per unit\\_year.]');
  });

  it('emits a figure with an image, a caption and a label', () => {
    expect(typ).toContain(
      '#figure(\n  image("figures/plot.png", width: 100%),',
    );
    expect(typ).toContain('supplement: [Figure],');
    expect(typ).toContain(') <plot>');
  });

  it('cross-references a figure with @label and an equation without a supplement', () => {
    expect(typ).toContain('see @plot and #ref(<eq1>, supplement: none)');
  });

  it('emits a numbered display equation with its label', () => {
    expect(typ).toContain('$ E = mc^2 $ <eq1>');
    expect(typ).toContain('#set math.equation(numbering: "(1)")');
  });

  it('emits a table as a real Typst table with a header row', () => {
    expect(typ).toContain('    columns: 2,');
    expect(typ).toContain('    table.header(');
    expect(typ).toContain('[*A*], [*B*],');
    expect(typ).toContain('[1], [2],');
  });

  it('cites by key and hands the bibliography to the .bib file', () => {
    expect(typ).toContain('#cite(<smith2020>)');
    expect(typ).toContain('#bibliography("references.bib")');
    expect(typ).not.toContain('[References]');
  });

  it('restarts the counters under the supplement prefix', () => {
    expect(typ).toContain('#pagebreak()');
    expect(typ).toContain('#counter(figure.where(kind: image)).update(0)');
    expect(typ).toContain('#set figure(numbering: n => "S" + str(n))');
  });
});

describe('section numbering in Typst', () => {
  it('writes every heading as an explicit unnumbered one when the journal does not number sections', () => {
    const typ = textOf(exportTypst(), 'test-article.typ');
    expect(typ).toContain('#heading(level: 1, numbering: none)[Results]');
    expect(typ).not.toContain('#set heading(numbering:');
  });

  it('uses the `=` shorthand and turns on heading numbering when the journal does', () => {
    const typ = textOf(
      exportTypst({
        style: { citationMode: 'NUMERIC', sectionNumbering: true },
      }),
      'test-article.typ',
    );
    expect(typ).toContain('#set heading(numbering: "1.1.1")');
    expect(typ).toContain('= Results');
    // Front and back matter stay outside the sequence.
    expect(typ).toContain(
      '#heading(level: 1, numbering: none)[Supplementary Material]',
    );
  });
});

describe('a journal profile with a vendored CSL style', () => {
  it('ships the .csl file and points the bibliography at it', () => {
    const files = exportTypst({
      style: { citationMode: 'NUMERIC', citationStyleId: 'ieee' },
    });
    expect(files.map((file) => file.filename)).toContain('ieee.csl');
    expect(textOf(files, 'test-article.typ')).toContain(
      '#bibliography("references.bib", style: "ieee.csl")',
    );
  });
});

describe('latexToTypstMath', () => {
  it('rewrites fractions and roots as Typst calls', () => {
    expect(latexToTypstMath('\\frac{a}{b}')).toBe('frac(a, b)');
    expect(latexToTypstMath('\\sqrt{1 - v^2}')).toBe('sqrt(1 - v^2)');
  });

  it('turns a braced script into Typst grouping and leaves plain braces out', () => {
    expect(latexToTypstMath('x^{2n}')).toBe('x^(2n)');
    expect(latexToTypstMath('{ab}')).toBe('ab');
  });

  it('uses the shared glyph table for symbols LaTeX and Typst name differently', () => {
    expect(latexToTypstMath('\\alpha \\times \\beta')).toBe('α × β');
  });

  it('drops delimiter sizing and keeps an unknown command as its bare name', () => {
    expect(latexToTypstMath('\\left( \\sum_{i} x \\right)')).toBe(
      '( sum_(i) x )',
    );
  });

  it('writes \\text as a Typst string', () => {
    expect(latexToTypstMath('c \\text{ per unit}')).toBe('c " per unit"');
  });
});
