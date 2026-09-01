import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { exportManuscriptToHtml } from '@/local-db/research/manuscript/manuscriptHtmlExport';

const CENSORED_TABLE = [
  '|  | Percent of Data Censored | < | < |',
  '| Sample Size | <50% | 50-80% | >80% |',
  '| --- | --- | --- | --- |',
  '| n<50 | Robust ROS | Robust ROS | Too censored |',
].join('\n');

const input: BuildBundleInput = {
  manuscript: {
    id: 'm1',
    name: 'Particulate bound metals downtown',
    authorLine: 'Jalil, A.',
    affiliations: '1 University of Northern British Columbia',
  },
  style: {
    name: 'Journal of Air Quality',
    citationMode: 'NUMERIC',
    figureLabelFormat: 'Figure {n}',
    tableLabelFormat: 'Table {n}',
    tableStyle: 'ACADEMIC',
  },
  authors: 'Jalil, A.',
  sections: [
    {
      id: 's-abs',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'Metals in urban air [@mcmichael2000].',
    },
    {
      id: 's-methods',
      name: 'Methods',
      sectionType: 'METHODS',
      placement: 'MAIN',
      orderIndex: 1,
      content: [
        '### Hazard Index',
        '',
        'Summing per-metal quotients [@mcmichael2000; @li2017] gives:',
        '',
        '$$HI=\\sum_{i=1}^{n} HQ_{i}$$',
        '',
        'Imputation follows [#tab:censored], and levels under 50% are fine.',
      ].join('\n'),
    },
    {
      id: 's-results',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content: 'Copper dominated [@li2017].',
    },
  ],
  figures: [
    {
      id: 'f-tab',
      refKey: 'tab:censored',
      name: 'Imputation guidance',
      caption: 'Guidelines for data imputation.',
      assetKind: 'TABLE',
      placement: 'MAIN',
      sectionId: 's-methods',
      tableData: CENSORED_TABLE,
    },
  ],
  references: [
    {
      id: 'r1',
      citationKey: 'mcmichael2000',
      name: 'The urban environment and health',
      authors: 'McMichael, A. J.',
      year: 2000,
      containerTitle: 'Bulletin of the WHO',
    },
    {
      id: 'r2',
      citationKey: 'li2017',
      name: 'Identifying the main contributors of air pollution in Beijing',
      authors: 'Li, S.',
      year: 2017,
      containerTitle: 'Journal of Cleaner Production',
    },
  ],
};

describe('exportManuscriptToHtml', () => {
  let html = '';

  beforeAll(async () => {
    html = await exportManuscriptToHtml(buildManuscriptBundle(input));
  });

  it('is self-contained: nothing to fetch from another host', () => {
    expect(html).not.toMatch(/<link\b[^>]*\bhref=["']https?:/i);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
    // The only <script> in the file is the JSON-LD metadata block, which is
    // data a harvester reads rather than code a browser runs; the reader
    // controls stay pure CSS.
    expect(
      [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]),
    ).toEqual(['<script type="application/ld+json">']);
    const remoteUrls = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)];
    expect(remoteUrls).toHaveLength(0);
  });

  it('typesets equations as MathML rather than raw LaTeX', () => {
    expect(html).toContain('<math');
    expect(html).toContain('munderover');
    // No raw LaTeX left in the flow: the source survives only inside the
    // MathML annotation, which browsers do not paint.
    expect(html).not.toContain('\\[HI=');
    expect(html).not.toContain('$$');
    const visible = html.replace(/<annotation[\s\S]*?<\/annotation>/g, '');
    expect(visible).not.toContain('\\sum_{i=1}');
  });

  it('numbers each reference exactly once', () => {
    // The entries carry their own "1." / "2." marker, so the list must not be
    // an <ol> that would print a second one.
    expect(html).toContain('<ul class="references">');
    expect(html).not.toContain('<ol class="references">');
    expect(html).toMatch(/<li id="reference-mcmichael2000">1\.\s/);
    expect(html).toMatch(/<li id="reference-li2017">2\.\s/);
  });

  it('links in-text citations to their reference entry', () => {
    expect(html).toContain('href="#reference-mcmichael2000"');
    expect(html).toContain('href="#reference-li2017"');
    // A two-key cluster links each number separately.
    expect(html).toMatch(
      /<a class="citation" id="cite-\d+" href="#reference-mcmichael2000">1<\/a>/,
    );
  });

  it('gives every reference a backlink to where it was cited', () => {
    expect(html).toContain('class="reference-backlinks"');
    expect(html).toMatch(/href="#cite-\d+"/);
  });

  it('links a resolved cross-reference to its asset', () => {
    expect(html).toContain('<a class="crossref" href="#asset-tab-censored">');
    expect(html).toContain('id="asset-tab-censored"');
  });

  it('renders merged table cells as real spans', () => {
    expect(html).toContain('<th colspan="3">Percent of Data Censored</th>');
    // Two header rows, not one.
    expect(
      html.match(/<thead>[\s\S]*?<\/thead>/)?.[0].match(/<tr>/g),
    ).toHaveLength(2);
    // A value that only looks like a marker stays content.
    expect(html).toContain('&lt;50%');
  });

  it('makes the heading hierarchy visible and navigable', () => {
    expect(html).toContain('data-outline-level="2"');
    expect(html).toContain('data-outline-level="3"');
    expect(html).toContain(
      '<span class="heading-level-tag" aria-hidden="true">H2</span>',
    );
    expect(html).toContain('class="outline"');
    expect(html).toContain('<li class="depth-3">');
    expect(html).toContain('id="view-structure"');
  });

  it("styles the abstract with the journal's abstract spacing", () => {
    // The stylesheet gives .abstract its own line height; without the class the
    // journal's abstract setting would silently do nothing in HTML.
    expect(html).toContain('<div class="abstract">');
    expect(html).toMatch(/\.abstract \{ line-height: [\d.]+; \}/);
    // Body prose is not wrapped.
    expect(html).toContain('<p>Copper dominated');
  });

  it('offers every table design as a reader-switchable variant', () => {
    for (const id of [
      'view-table-academic',
      'view-table-grid',
      'view-table-shaded',
      'view-table-borderless',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    // The journal's own style is the one selected on open.
    expect(html).toMatch(/id="view-table-academic"\s+checked/);
  });

  it('keeps a hostile style value out of the stylesheet', async () => {
    // `fontFamily` is restored verbatim from an imported package's exportStyle,
    // so it must not be able to close the CSS string and reopen the sheet. The
    // attacker's characters are neutralised, not their letters: what matters is
    // that nothing functional survives.
    const injected = await exportManuscriptToHtml(
      buildManuscriptBundle({
        ...input,
        style: {
          ...input.style,
          fontFamily:
            'Times"; } body { background: url("https://evil.example/x',
          bodyFontSize: '12; } body { color: red' as unknown as number,
        },
      }),
    );
    const stylesheet = /<style>([\s\S]*?)<\/style>/.exec(injected)?.[1] ?? '';

    // The declaration is still one well-formed quoted font stack.
    expect(stylesheet).toContain(
      '--body-font: "Times body background url https evil.example x", "Times New Roman", Times, serif;',
    );
    // Nothing that would fetch, and no escape from the literal. (The only
    // remaining `http://` in the file is the MathML namespace declaration,
    // which names a spec rather than requesting anything.)
    expect(stylesheet).not.toContain('url(');
    expect(stylesheet).not.toMatch(/https?:\/\//);
    expect(injected).not.toMatch(/(?:src|href)="https?:\/\//);
    // A non-numeric size falls back rather than injecting a declaration.
    expect(stylesheet).toContain('--body-size: 12pt;');
    expect(stylesheet).not.toContain('color: red');
  });

  it('indents the first line of body prose, and nothing else', async () => {
    const indented = await exportManuscriptToHtml(
      buildManuscriptBundle({
        ...input,
        style: { ...input.style, paragraphFirstLineIndent: 36 },
      }),
    );
    const stylesheet = /<style>([\s\S]*?)<\/style>/.exec(indented)?.[1] ?? '';

    expect(stylesheet).toContain('text-indent: 36pt;');
    // Indented copy runs on: the blank line between paragraphs is what the
    // indent replaces, so keeping both would double the separation.
    expect(stylesheet).toMatch(/p \{\s*margin: 0 0 0;/);
    expect(stylesheet).toContain('.abstract p,');
    // Off by default, and then paragraphs are separated by space instead.
    const plain = await exportManuscriptToHtml(buildManuscriptBundle(input));
    const plainStylesheet = /<style>([\s\S]*?)<\/style>/.exec(plain)?.[1] ?? '';

    expect(plainStylesheet).toContain('text-indent: 0pt;');
    expect(plainStylesheet).toMatch(/p \{\s*margin: 0 0 0.75em;/);
  });

  it('turns a title-page rule into the vertical space it stands for', async () => {
    const withCover = await exportManuscriptToHtml(
      buildManuscriptBundle({
        ...input,
        manuscript: {
          ...input.manuscript,
          titlePageExtraLines: ['by', '--- 6', 'MARCH 2023'],
        },
        style: { ...input.style, titlePageTemplate: 'THESIS' },
      }),
    );

    expect(withCover).toContain('<p class="title-extra">by</p>');
    expect(withCover.match(/<p class="title-space"><\/p>/g)).toHaveLength(6);
    // The rule is spacing, never a printed line of dashes.
    expect(withCover).not.toContain('>--- 6<');
    expect(withCover).toContain('.title-space { height: 1em;');
  });

  it('escapes prose that looks like markup', async () => {
    const withMarkup = await exportManuscriptToHtml(
      buildManuscriptBundle({
        ...input,
        sections: [
          {
            id: 's1',
            name: 'Results',
            sectionType: 'RESULTS',
            placement: 'MAIN',
            orderIndex: 0,
            content: 'Values <50% and <img src=x onerror=alert(1)> stayed low.',
          },
        ],
        figures: [],
      }),
    );

    expect(withMarkup).toContain('&lt;50%');
    expect(withMarkup).not.toContain('onerror=alert(1)>');
  });
});
