import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { buildJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsExport';

const input: BuildBundleInput = {
  manuscript: {
    id: 'm1',
    name: 'Test article',
    targetVenue: 'Journal of Tests',
    doi: '10.1000/test',
  },
  style: { citationMode: 'NUMERIC' },
  authors: 'Smith, Jane; Doe, John',
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
      content: 'testing; xml',
    },
    {
      id: 'res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content: 'It works [@smith2020], see [#fig:plot].',
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
      caption: 'A plot.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      sectionId: 'res',
      imageUrl: 'https://example.org/p.png',
      imageSource: 'URL',
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
      volume: '4',
      pages: '10-20',
      doi: '10.1000/ref',
      cslType: 'ARTICLE_JOURNAL',
    },
  ],
};

describe('buildJatsArticle', () => {
  const bundle = buildManuscriptBundle(input);
  const jats = buildJatsArticle(bundle);

  it('produces well-formed XML with the JATS doctype', () => {
    const parsed = new DOMParser().parseFromString(jats, 'text/xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(jats).toContain('JATS-archivearticle1-3.dtd');
  });

  it('carries front-matter metadata', () => {
    expect(jats).toContain('<article-title>Test article</article-title>');
    expect(jats).toContain('<journal-title>Journal of Tests</journal-title>');
    expect(jats).toContain('<article-id pub-id-type="doi">10.1000/test</article-id>');
    expect(jats).toContain('<string-name>Smith, Jane</string-name>');
    expect(jats).toContain('<kwd>testing</kwd>');
    expect(jats).toContain('<abstract>');
  });

  it('renders sections, figures, tables and equations as JATS elements', () => {
    expect(jats).toContain('<title>Results</title>');
    expect(jats).toContain('<fig id="plot">');
    expect(jats).toContain('<graphic xlink:href="https://example.org/p.png"/>');
    expect(jats).toContain('<table-wrap id="grid">');
    expect(jats).toContain('<td>1</td>');
    expect(jats).toContain('<disp-formula id="eq1">');
    expect(jats).toContain('<tex-math>E = mc^2</tex-math>');
  });

  it('emits structured element-citations with DOIs', () => {
    expect(jats).toContain('<ref id="smith2020">');
    expect(jats).toContain('<element-citation publication-type="journal">');
    expect(jats).toContain('<article-title>A study</article-title>');
    expect(jats).toContain('<pub-id pub-id-type="doi">10.1000/ref</pub-id>');
    expect(jats).toContain('<fpage>10</fpage>');
    expect(jats).toContain('<lpage>20</lpage>');
  });

  it('separates the supplement into supplementary-material', () => {
    expect(jats).toContain('<supplementary-material>');
    expect(jats.indexOf('<supplementary-material>')).toBeGreaterThan(
      jats.indexOf('</body>'),
    );
  });

  it('escapes XML in prose', () => {
    const escaped = buildJatsArticle(
      buildManuscriptBundle({
        ...input,
        sections: [
          {
            id: 's',
            name: 'R & D <raw>',
            sectionType: 'RESULTS',
            placement: 'MAIN',
            orderIndex: 0,
            content: 'A & B < C.',
          },
        ],
        figures: [],
        references: [],
      }),
    );
    expect(escaped).toContain('A &amp; B &lt; C.');
    expect(escaped).toContain('<title>R &amp; D &lt;raw&gt;</title>');
    expect(new DOMParser().parseFromString(escaped, 'text/xml').querySelector('parsererror')).toBeNull();
  });
});
