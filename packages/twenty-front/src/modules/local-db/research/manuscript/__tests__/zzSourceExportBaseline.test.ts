import { writeFileSync } from 'fs';

import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ExportFile } from '@/local-db/research/manuscript/manuscriptExport';
import { buildManuscriptLatexFiles } from '@/local-db/research/manuscript/manuscriptLatexExport';
import { buildManuscriptTypstFiles } from '@/local-db/research/manuscript/manuscriptTypstExport';

const OUT = process.env.BASELINE_DIR ?? '/tmp/source-export-baseline';

const prose = [
  '# A top heading',
  '',
  'Plain prose with **bold**, *emphasis*, _underscore emphasis_, ~~strike~~,',
  '`code span`, a [link](https://example.org/a_b?x=1&y=2), an inline image',
  '![alt text](data:image/png;base64,iVBORw0KGgo=), a linked one',
  '![remote](https://example.org/pic.png), <sup>up</sup> and <sub>down</sub>,',
  'a break<br/> and <span class="x">stray markup</span>.',
  '',
  'Specials: 100% & $3 #hash _under_score {braces} ~tilde^caret \\backslash.',
  '',
  'Maths inline $\\alpha_1 + \\frac{a}{b}$ and a citation [@smith2020] plus a',
  'cross-reference to [#fig:plot], [#tbl:grid] and [#eq1].',
  '',
  '## A second-level heading',
  '',
  '### A third-level heading',
  '',
  '#### A fourth-level heading',
  '',
  '##### A fifth-level heading',
  '',
  '###### A sixth-level heading',
  '',
  '```',
  'const code = "not escaped";',
  '  indented line & 100%',
  '```',
  '',
  '$$',
  '\\sum_{i=1}^{n} \\sqrt{x_i}',
  '\\times \\mathbf{v}',
  '$$',
  '',
  '$$ E = mc^2 $$',
  '',
  '| A | B | C |',
  '| --- | --- | --- |',
  '| 1 | 2 | 3 |',
  '| 4 | 5 | 6 |',
  '',
  '---',
  '',
  '- first item with **bold**',
  '- second item',
  '- third item',
  '',
  '1. ordered one',
  '2. ordered two',
  '3) ordered three',
  '',
  '> A quoted line',
  '> and its continuation with $x^2$.',
  '',
  'Data availability',
  '',
].join('\n');

const input: BuildBundleInput = {
  manuscript: {
    id: 'm1',
    name: 'Baseline article: 100% & more',
    targetVenue: 'Journal of Tests',
    affiliations: '1 University of Tests\n2 Institute of Trials & Errors',
    correspondingAuthor: 'jane@example.org',
  },
  style: { citationMode: 'NUMERIC' },
  authors: 'Smith, Jane [1*]; Doe, John [2]; Nobody, Nemo []',
  sections: [
    {
      id: 'abs',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'We test **things** with 50% & $3, see [@smith2020].',
    },
    {
      id: 'kw',
      name: 'Keywords',
      sectionType: 'KEYWORDS',
      placement: 'FRONT_MATTER',
      orderIndex: 1,
      content: 'testing; latex; typst',
    },
    {
      id: 'res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content: prose,
    },
    {
      id: 'dat',
      name: 'Data availability',
      sectionType: 'DATA_AVAILABILITY',
      placement: 'BACK_MATTER',
      orderIndex: 3,
      content: 'Everything is at https://example.org.',
    },
    {
      id: 'sup',
      name: 'Supplementary Material',
      sectionType: 'SUPPLEMENT',
      placement: 'SUPPLEMENT',
      orderIndex: 4,
      content: 'Extra material, see [#fig:extra].',
    },
  ],
  figures: [
    {
      id: 'f1',
      refKey: 'plot',
      name: 'Plot',
      caption: 'Yield rose 50% & $3 per unit_year.',
      credit: 'A. Photographer',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      sectionId: 'res',
      imageSource: 'UPLOAD',
      imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      widthPercent: 60,
    },
    {
      id: 'f2',
      refKey: 'linked',
      name: 'Linked',
      caption: 'A figure whose image lives on a server.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      sectionId: 'res',
      imageSource: 'URL',
      imageUrl: 'https://example.org/remote.png',
    },
    {
      id: 'f3',
      refKey: 'todo',
      name: 'Pending',
      caption: 'No image yet.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      sectionId: 'res',
      numbered: false,
    },
    {
      id: 't1',
      refKey: 'grid',
      name: 'Grid',
      caption: 'A table with a span.',
      assetKind: 'TABLE',
      placement: 'MAIN',
      sectionId: 'res',
      tableData:
        '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |',
    },
    {
      id: 'e1',
      refKey: 'eq1',
      name: 'Eq',
      assetKind: 'EQUATION',
      placement: 'MAIN',
      sectionId: 'res',
      equationLatex: 'E = mc^2 + \\frac{\\alpha}{\\beta}',
    },
    {
      id: 'e2',
      refKey: 'eq2',
      name: 'Eq two',
      assetKind: 'EQUATION',
      placement: 'MAIN',
      sectionId: 'res',
      equationLatex: '\\int_0^1 x \\, dx',
      numbered: false,
    },
    {
      id: 'f4',
      refKey: 'extra',
      name: 'Extra',
      caption: 'A supplementary figure.',
      assetKind: 'FIGURE',
      placement: 'SUPPLEMENT',
      sectionId: 'sup',
      imageSource: 'UPLOAD',
      imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
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

// A front-matter section that places an asset mid-way: the node stream then
// reads heading -> figure -> prose, which is the only way the abstract
// environment and a pending keywords heading meet an asset node.
const frontMatterAssets: Partial<BuildBundleInput> = {
  sections: input.sections.map((section) =>
    section.id === 'kw'
      ? { ...section, content: '[[asset:plot]]\n\ntesting; latex; typst' }
      : section.id === 'abs'
        ? { ...section, content: 'We test.\n\n[[asset:grid]]\n\nAnd again.' }
        : section,
  ),
};

const VARIANTS: { name: string; overrides: Partial<BuildBundleInput> }[] = [
  { name: 'default', overrides: {} },
  { name: 'frontmatterassets', overrides: frontMatterAssets },
  {
    name: 'numbered',
    overrides: {
      style: {
        citationMode: 'NUMERIC',
        sectionNumbering: true,
        lineNumbering: true,
        twoColumn: true,
        pageNumbering: false,
        bodyAlignment: 'JUSTIFIED',
        fontFamily: 'Arial "Bold"',
        bodyFontSize: 10,
        titleFontSize: 18,
        lineSpacing: 2,
        figureLabelFormat: 'Fig. {n}.',
        tableLabelFormat: 'Tbl. {n}.',
        supplementPrefix: 'SI',
        figureCaptionPosition: 'ABOVE',
        tableCaptionPosition: 'BELOW',
      },
    },
  },
  {
    name: 'authordate',
    overrides: {
      style: {
        citationMode: 'AUTHOR_DATE',
        citationStyleId: 'apa',
        fontFamily: 'Times New Roman',
        bodyFontSize: 11,
      },
    },
  },
];

const write = (name: string, files: ExportFile[]) => {
  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    writeFileSync(
      `${OUT}/${name}-${file.filename.replace(/\//g, '_')}`,
      file.content,
    );
  }
  writeFileSync(
    `${OUT}/${name}-filelist.txt`,
    files.map((file) => `${file.filename} ${file.mimeType}`).join('\n'),
  );
};

describe('source export baseline', () => {
  it('writes a real .tex and .typ for every variant', () => {
    for (const variant of VARIANTS) {
      const bundle = buildManuscriptBundle(
        { ...input, ...variant.overrides },
        undefined,
        { citationAnchors: true, crossReferenceAnchors: true },
      );
      write(`latex-${variant.name}`, buildManuscriptLatexFiles(bundle));
      write(`typst-${variant.name}`, buildManuscriptTypstFiles(bundle));
    }
    expect(true).toBe(true);
  });
});
