import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ExportFile } from '@/local-db/research/manuscript/manuscriptExport';
import { buildManuscriptLatexFiles } from '@/local-db/research/manuscript/manuscriptLatexExport';

const input: BuildBundleInput = {
  manuscript: {
    id: 'm1',
    name: 'Test article',
    targetVenue: 'Journal of Tests',
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
      content: 'testing; latex',
    },
    {
      id: 'res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content:
        'It works [@smith2020], see [#fig:plot] and [#eq1]. Inline maths $\\alpha_1$ stays.',
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
      name: 'A study of 100% recovery',
      authors: 'Smith, Jane; Doe, John',
      year: 2020,
      containerTitle: 'Journal of Tests',
      volume: '4',
      issue: '2',
      pages: '10-20',
      doi: '10.1000/ref',
      cslType: 'ARTICLE_JOURNAL',
    },
  ],
};

const exportLatex = (overrides: Partial<BuildBundleInput> = {}): ExportFile[] =>
  buildManuscriptLatexFiles(
    buildManuscriptBundle({ ...input, ...overrides }, undefined, {
      citationAnchors: true,
      crossReferenceAnchors: true,
    }),
  );

const textOf = (files: ExportFile[], filename: string): string => {
  const file = files.find((candidate) => candidate.filename === filename);
  return typeof file?.content === 'string' ? file.content : '';
};

describe('buildManuscriptLatexFiles', () => {
  const files = exportLatex();
  const tex = textOf(files, 'test-article.tex');

  it('returns a .tex, a .bib and every figure image as its own file', () => {
    expect(files.map((file) => file.filename)).toEqual([
      'test-article.tex',
      'references.bib',
      'figures/plot.png',
    ]);
    expect(files[2].mimeType).toBe('image/png');
  });

  it('builds a preamble from the journal page geometry and spacing', () => {
    expect(tex).toContain('\\documentclass[12pt,a4paper]{article}');
    expect(tex).toContain('\\usepackage[a4paper,margin=72pt]{geometry}');
    expect(tex).toContain('\\setstretch{1.5}');
    expect(tex).toContain('\\begin{document}');
    expect(tex.trimEnd().endsWith('\\end{document}')).toBe(true);
  });

  it('carries the title, affiliation markers and corresponding author', () => {
    expect(tex).toContain('\\title{Test article}');
    expect(tex).toContain(
      'Smith, Jane\\textsuperscript{1}\\textsuperscript{*}',
    );
    expect(tex).toContain('Doe, John\\textsuperscript{2}');
    expect(tex).toContain('\\textsuperscript{1}University of Tests');
    expect(tex).toContain('\\textsuperscript{*}jane@example.org');
  });

  it('renders the abstract and keywords as LaTeX front matter', () => {
    expect(tex).toContain('\\begin{abstract}');
    expect(tex).toContain('\\end{abstract}');
    expect(tex).toContain('\\noindent\\textbf{Keywords:} testing; latex');
  });

  it('escapes LaTeX special characters in prose and captions', () => {
    expect(tex).toContain('Yield rose 50\\% \\& \\$3 per unit\\_year.');
  });

  it('leaves maths alone inside its delimiters', () => {
    expect(tex).toContain('$\\alpha_1$');
  });

  it('emits a figure with an includegraphics, a caption and a label', () => {
    expect(tex).toContain('\\begin{figure}[htbp]');
    expect(tex).toContain(
      '\\includegraphics[width=1.00\\textwidth]{figures/plot.png}',
    );
    expect(tex).toContain('\\label{plot}');
    // The caption carries no "Figure 1." of ours — LaTeX numbers it.
    expect(tex).not.toContain('\\caption{Figure 1.');
  });

  it('cross-references a figure with \\ref and an equation with \\eqref', () => {
    expect(tex).toContain('see Figure~\\ref{plot} and \\eqref{eq1}');
  });

  it('emits a numbered display equation with its label', () => {
    expect(tex).toContain('\\begin{equation}\n\\label{eq1}\nE = mc^2');
  });

  it('emits a table as a real tabular', () => {
    expect(tex).toContain('\\begin{tabular}{ll}');
    expect(tex).toContain('\\toprule');
    expect(tex).toContain('\\textbf{A} & \\textbf{B} \\\\');
    expect(tex).toContain('1 & 2 \\\\');
    expect(tex).toContain('\\bottomrule');
  });

  it('cites by key and hands the bibliography to BibTeX', () => {
    expect(tex).toContain('\\cite{smith2020}');
    expect(tex).toContain('\\bibliographystyle{unsrt}');
    expect(tex).toContain('\\bibliography{references}');
    // \bibliography prints its own heading, so ours is dropped.
    expect(tex).not.toContain('{References}');
  });

  it('restarts the counters under the supplement prefix', () => {
    expect(tex).toContain('\\section*{Supplementary Material}');
    expect(tex).toContain(
      '\\setcounter{figure}{0}\\renewcommand{\\thefigure}{S\\arabic{figure}}',
    );
  });
});

describe('section numbering in LaTeX', () => {
  it('stars every heading when the journal does not number sections', () => {
    const tex = textOf(exportLatex(), 'test-article.tex');
    expect(tex).toContain('\\section*{Results}');
    expect(tex).not.toContain('\\section{Results}');
  });

  it('lets LaTeX number the body sections when the journal does', () => {
    const tex = textOf(
      exportLatex({
        style: { citationMode: 'NUMERIC', sectionNumbering: true },
      }),
      'test-article.tex',
    );
    expect(tex).toContain('\\section{Results}');
    // Front and back matter stay outside the sequence.
    expect(tex).toContain('\\section*{Supplementary Material}');
  });
});

describe('the .bib the LaTeX export writes', () => {
  const bib = textOf(exportLatex(), 'references.bib');

  it('maps a journal article onto @article with its fields', () => {
    expect(bib).toContain('@article{smith2020,');
    expect(bib).toContain('author = {Smith, Jane and Doe, John}');
    expect(bib).toContain('journal = {{Journal of Tests}}');
    expect(bib).toContain('year = {2020}');
    expect(bib).toContain('volume = {4}');
    expect(bib).toContain('number = {2}');
    expect(bib).toContain('doi = {10.1000/ref}');
  });

  it('writes page ranges as en-dashes and protects the title case', () => {
    expect(bib).toContain('pages = {10--20}');
    expect(bib).toContain('title = {{A study of 100\\% recovery}}');
  });
});

describe('a journal profile with an author-date CSL style', () => {
  it('picks a bibliography style the base TeX distribution ships', () => {
    const tex = textOf(
      exportLatex({
        style: { citationMode: 'AUTHOR_DATE', citationStyleId: 'apa' },
      }),
      'test-article.tex',
    );
    expect(tex).toContain('\\bibliographystyle{apalike}');
  });
});
