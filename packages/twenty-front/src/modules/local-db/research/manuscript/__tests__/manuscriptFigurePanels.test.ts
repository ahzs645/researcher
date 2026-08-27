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

// A two-panel figure, end to end: one number for the figure, a letter for each
// panel, and a sentence that points at a panel by key.

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const input: BuildBundleInput = {
  manuscript: { id: 'm1', name: 'Panelled paper' },
  style: { citationMode: 'NUMERIC' },
  sections: [
    {
      id: 'res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 0,
      content:
        'The plume splits, as [#fig:plume-left] shows, and rejoins in [#fig:plume-right]. Compare [#fig:budget].',
    },
  ],
  figures: [
    {
      id: 'plume',
      refKey: 'fig:plume',
      name: 'Plume',
      caption: 'Transport of the March plume.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 0,
      sectionId: 'res',
      panelColumns: 2,
    },
    {
      id: 'plume-left',
      refKey: 'fig:plume-left',
      name: 'Northbound',
      caption: 'Northbound leg.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 0,
      parentFigureId: 'plume',
      imageUrl: PIXEL,
    },
    {
      id: 'plume-right',
      refKey: 'fig:plume-right',
      name: 'Southbound',
      caption: 'Southbound leg.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 1,
      parentFigureId: 'plume',
      imageUrl: PIXEL,
    },
    {
      id: 'budget',
      refKey: 'fig:budget',
      name: 'Budget',
      caption: 'Mass budget.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 1,
      sectionId: 'res',
      imageUrl: PIXEL,
    },
  ],
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

describe('a figure made of panels', () => {
  const bundle = buildManuscriptBundle(input);

  it('numbers the figure once and letters its panels', () => {
    const byId = Object.fromEntries(
      bundle.numberedFigures.map((figure) => [figure.id, figure]),
    );
    expect(byId.plume.number).toBe('1');
    expect(byId['plume-left'].number).toBe('1a');
    expect(byId['plume-right'].number).toBe('1b');
    // The figure after it is Figure 2, not Figure 4.
    expect(byId.budget.number).toBe('2');
    expect(bundle.stats.figureCount).toBe(2);
  });

  it('places one figure, not three', () => {
    const figureNodes = bundle.nodes.filter((node) => node.kind === 'figure');
    expect(figureNodes.map((node) => node.figure.id)).toEqual([
      'plume',
      'budget',
    ]);
    expect(figureNodes[0].figure.panels?.map((panel) => panel.label)).toEqual([
      '(a)',
      '(b)',
    ]);
  });

  it('resolves a reference to a panel as "Figure 1a"', () => {
    const prose = bundle.nodes.find((node) => node.kind === 'prose');
    expect(prose?.markdown).toContain('as Figure 1a shows');
    expect(prose?.markdown).toContain('rejoins in Figure 1b');
    expect(bundle.warnings).toEqual([]);
  });

  it('resolves a reference written the way MyST spells it', () => {
    const mystStyle = buildManuscriptBundle({
      ...input,
      sections: [
        {
          ...input.sections[0],
          content: 'See [#fig:plume-a] and [#fig:plume-b].',
        },
      ],
    });
    const prose = mystStyle.nodes.find((node) => node.kind === 'prose');
    expect(prose?.markdown).toBe('See Figure 1a and Figure 1b.');
  });

  it('leaves a figure with no panels rendering exactly as before', () => {
    const flat = buildManuscriptBundle({
      ...input,
      figures: input.figures.filter(
        (figure) => figure.parentFigureId === undefined,
      ),
      sections: [{ ...input.sections[0], content: 'See [#fig:budget].' }],
    });
    const figureNodes = flat.nodes.filter((node) => node.kind === 'figure');
    expect(figureNodes.map((node) => node.figure.label)).toEqual([
      'Figure 1',
      'Figure 2',
    ]);
    expect(figureNodes.every((node) => node.figure.panels === undefined)).toBe(
      true,
    );
    expect(flat.mainMarkdown).toContain('**Figure 2.** Mass budget.');
  });

  it('places the whole figure when a marker names one of its panels', () => {
    const marked = buildManuscriptBundle({
      ...input,
      sections: [
        {
          ...input.sections[0],
          content: 'Before.\n\n[[asset:fig:plume-left]]\n\nAfter.',
        },
      ],
    });
    const kinds = marked.nodes.map((node) => node.kind);
    expect(kinds.filter((kind) => kind === 'figure')).toHaveLength(2);
    expect(marked.warnings).toEqual([]);
  });
});

describe('each exporter’s panel construct', () => {
  it('LaTeX writes subcaption subfigures and lets \\ref print "1a"', () => {
    const tex = textOf(
      buildManuscriptLatexFiles(bundleWith()),
      'panelled-paper.tex',
    );
    expect(tex).toContain('\\usepackage{subcaption}');
    expect(tex).toContain('\\begin{subfigure}[t]{0.480\\textwidth}');
    expect(tex).toContain('\\caption{Northbound leg.}');
    expect(tex).toContain('\\label{fig:plume-left}');
    expect(tex).toContain('\\hfill');
    // subcaption's own counter prints "1a" for this label, so the reference is
    // as live as the figure's own number.
    expect(tex).toContain('as Figure~\\ref{fig:plume-left} shows');
  });

  it('LaTeX leaves the package out of a paper with no panels', () => {
    const tex = textOf(
      buildManuscriptLatexFiles(
        bundleWith({
          figures: input.figures.filter(
            (figure) => figure.parentFigureId === undefined,
          ),
          sections: [{ ...input.sections[0], content: 'See [#fig:budget].' }],
        }),
      ),
      'panelled-paper.tex',
    );
    expect(tex).not.toContain('subcaption');
  });

  it('Typst lays the panels out in a grid and refs the parent plus a letter', () => {
    const typ = textOf(
      buildManuscriptTypstFiles(bundleWith()),
      'panelled-paper.typ',
    );
    expect(typ).toContain('grid(');
    expect(typ).toContain('columns: 2,');
    expect(typ).toContain('*(a)* Northbound leg.');
    // Typst has no subfigure, so the number is the parent's live reference and
    // the letter is text beside it.
    expect(typ).toContain('#ref(<fig:plume>)#text[a]');
    expect(typ).toContain('#ref(<fig:plume>)#text[b]');
  });

  it('JATS writes a <fig-group> whose children carry their own ids', async () => {
    const jats = buildJatsArticle(buildManuscriptBundle(input));
    expect(jats).toContain('<fig-group id="fig:plume">');
    expect(jats).toContain('<label>Figure 1</label>');
    expect(jats).toContain('<fig id="fig:plume-left">');
    expect(jats).toContain('<label>(a)</label>');
    expect(jats).toContain('</fig-group>');
  });

  it('HTML lays the panels out in a grid, each its own link target', async () => {
    const html = await exportManuscriptToHtml(buildManuscriptBundle(input));
    expect(html).toContain(
      '<div class="panel-row" style="grid-template-columns:repeat(2,1fr)">',
    );
    expect(html).toContain('<figure class="panel" id="asset-fig-plume-left">');
    expect(html).toContain('<figcaption>(a) Northbound leg.</figcaption>');
    expect(html).toContain(
      '<a class="crossref" href="#asset-fig-plume-left">Figure 1a</a>',
    );
  });

  it('Markdown draws each panel under its letter and captions the figure once', () => {
    expect(buildManuscriptBundle(input).mainMarkdown).toContain(
      '**(a)** Northbound leg.',
    );
    expect(buildManuscriptBundle(input).mainMarkdown).toContain(
      '**Figure 1.** Transport of the March plume.',
    );
  });
});
