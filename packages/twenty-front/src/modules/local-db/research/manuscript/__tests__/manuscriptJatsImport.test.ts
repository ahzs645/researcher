import { parseJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsImport';
import { buildPortableResearchPaperManifest } from '@/local-db/research/manuscript/manuscriptPortableManifest';
import { preparePortableResearchPaperImport } from '@/local-db/research/manuscript/manuscriptPortableImport';

// A publisher-shaped article: typed sections, a numbered figure and equation,
// a table, xrefs of both kinds, back matter statements and a reference list.
const ARTICLE = `<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article">
 <front>
  <journal-meta><journal-title>Atmospheric Measurement Techniques</journal-title></journal-meta>
  <article-meta>
   <article-id pub-id-type="doi">10.5194/amt-2026-1</article-id>
   <title-group>
    <article-title>Quantifying temporal aggregation bias</article-title>
    <subtitle>The AETH Modular framework</subtitle>
   </title-group>
   <contrib-group>
    <contrib contrib-type="author" corresp="yes">
     <name><surname>Jalil</surname><given-names>Ahmad</given-names></name>
     <email>ajalil@unbc.ca</email>
    </contrib>
    <contrib contrib-type="author">
     <name><surname>Kazemian</surname><given-names>Hossein</given-names></name>
    </contrib>
   </contrib-group>
   <aff id="aff1">University of Northern British Columbia</aff>
   <abstract><p>Filter-based and aethalometer measurements are integrated.</p></abstract>
   <kwd-group><kwd>black carbon</kwd><kwd>aethalometer</kwd></kwd-group>
  </article-meta>
 </front>
 <body>
  <sec id="s1" sec-type="intro">
   <title>Introduction</title>
   <p>Earlier work established the method <xref ref-type="bibr" rid="bond2013">Bond et al.</xref>.</p>
   <p>The mean <inline-formula><tex-math>\\bar{x}_j</tex-math></inline-formula> is reported.</p>
  </sec>
  <sec id="s2">
   <title>Formal temporal-alignment method</title>
   <p>Alignment follows <xref ref-type="disp-formula" rid="eq7">Eq. (7)</xref>.</p>
   <disp-formula id="eq7">
    <label>(7)</label>
    <tex-math>\\bar{x}_{j,time} = \\sum_i w_{ij} x_i / \\sum_i w_{ij}</tex-math>
   </disp-formula>
   <sec id="s2-1">
    <title>Completeness</title>
    <p>See <xref ref-type="table" rid="tbl1">Table 1</xref>.</p>
    <table-wrap id="tbl1">
     <label>Table 1</label>
     <caption><p>Measurement quantities.</p></caption>
     <table>
      <thead><tr><th>Quantity</th><th>Unit</th></tr></thead>
      <tbody><tr><td>ATN</td><td>-</td></tr><tr><td>b<sub>abs</sub></td><td>Mm<sup>-1</sup></td></tr></tbody>
     </table>
    </table-wrap>
   </sec>
  </sec>
  <sec id="s3">
   <title>Results</title>
   <fig id="fig1">
    <label>Figure 1</label>
    <caption><p>Absorption over time.</p></caption>
    <graphic xlink:href="figure1.png"/>
   </fig>
  </sec>
 </body>
 <back>
  <sec sec-type="data-availability"><title>Code and data availability</title><p>Code is at https://github.com/example/aeth.</p></sec>
  <ack><title>Acknowledgements</title><p>We thank the operators.</p></ack>
  <ref-list>
   <ref id="bond2013">
    <element-citation publication-type="journal">
     <name><surname>Bond</surname><given-names>T. C.</given-names></name>
     <name><surname>Doherty</surname><given-names>S. J.</given-names></name>
     <article-title>Bounding the role of black carbon</article-title>
     <source>J. Geophys. Res.-Atmos.</source>
     <year>2013</year><volume>118</volume><fpage>5380</fpage><lpage>5552</lpage>
     <pub-id pub-id-type="doi">10.1002/jgrd.50171</pub-id>
    </element-citation>
   </ref>
  </ref-list>
 </back>
</article>`;

const parsed = () => parseJatsArticle(ARTICLE);

describe('parseJatsArticle', () => {
  it('reads the front matter a journal published the paper under', () => {
    const { manuscript } = parsed();

    // A JATS subtitle is its own element; the composer's title is one string.
    expect(manuscript.title).toBe(
      'Quantifying temporal aggregation bias: The AETH Modular framework',
    );
    expect(manuscript.authorLine).toBe('Ahmad Jalil, Hossein Kazemian');
    expect(manuscript.affiliations).toBe(
      'University of Northern British Columbia',
    );
    expect(manuscript.doi).toBe('10.5194/amt-2026-1');
    expect(manuscript.targetVenue).toBe('Atmospheric Measurement Techniques');
  });

  it('keeps the section hierarchy and types it', () => {
    const outline = parsed().sections.map(
      (section) => `${section.level}:${section.sectionType}:${section.name}`,
    );

    expect(outline).toEqual([
      '1:ABSTRACT:Abstract',
      '1:KEYWORDS:Keywords',
      '1:INTRODUCTION:Introduction',
      '1:OTHER:Formal temporal-alignment method',
      '2:OTHER:Completeness',
      '1:RESULTS:Results',
      '1:DATA_AVAILABILITY:Code and data availability',
      '1:ACKNOWLEDGMENTS:Acknowledgements',
    ]);
  });

  it('turns the published labels back into tokens the composer resolves', () => {
    const { sections } = parsed();
    const introduction = sections.find(
      (section) => section.name === 'Introduction',
    );
    const method = sections.find(
      (section) => section.name?.startsWith('Formal') === true,
    );
    const completeness = sections.find(
      (section) => section.name === 'Completeness',
    );

    // "Eq. (7)" was the number that journal printed. Imported as a token, it
    // renumbers with the paper instead of staying frozen.
    expect(method?.content).toContain('[#eq7]');
    expect(method?.content).toContain('[[asset:eq7]]');
    expect(completeness?.content).toContain('[#tbl1]');
    expect(introduction?.content).toContain('[@bond2013]');
    expect(introduction?.content).toContain('$\\bar{x}_j$');
  });

  it('reads figures, tables and equations as assets', () => {
    const { figures } = parsed();
    const byKey = new Map(figures.map((figure) => [figure.refKey, figure]));

    expect(byKey.get('eq7')).toMatchObject({
      assetKind: 'EQUATION',
      sourceLabel: '7',
      equationLatex: '\\bar{x}_{j,time} = \\sum_i w_{ij} x_i / \\sum_i w_{ij}',
    });
    expect(byKey.get('tbl1')).toMatchObject({
      assetKind: 'TABLE',
      sourceLabel: '1',
      caption: 'Measurement quantities.',
    });
    // Sub- and superscripts inside cells survive as the composer's own marks.
    expect(byKey.get('tbl1')?.tableData).toContain('| b~abs~ | Mm^-1^ |');
    expect(byKey.get('tbl1')?.tableData?.split('\n')[1]).toBe('| --- | --- |');
    expect(byKey.get('fig1')).toMatchObject({
      assetKind: 'FIGURE',
      caption: 'Absorption over time.',
      // The artwork lives beside the XML, not in it: the figure arrives
      // without pixels and says where they were rather than inventing them.
      imageSource: 'NONE',
    });
    // A package-relative filename is not something the composer can load,
    // so it does not become an image URL that would render broken.
    expect(byKey.get('fig1')?.imageUrl).toBeUndefined();
  });

  it('reads the reference list into fields, not one blob', () => {
    expect(parsed().references[0]).toMatchObject({
      citationKey: 'bond2013',
      name: 'Bounding the role of black carbon',
      authors: 'Bond, T. C.; Doherty, S. J.',
      containerTitle: 'J. Geophys. Res.-Atmos.',
      year: 2013,
      volume: '118',
      pages: '5380–5552',
      doi: '10.1002/jgrd.50171',
    });
  });

  it('restores through the portable path, so nothing needs its own importer', () => {
    const manifest = buildPortableResearchPaperManifest(parsed(), {}, {});
    const prepared = preparePortableResearchPaperImport(
      manifest,
      manifest.sections.map((section) => ({
        name: section.name ?? '',
        sectionType: section.sectionType,
        placement: section.placement === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'MAIN',
        content: section.content,
        orderIndex: section.orderIndex,
        wordCount: section.wordCount,
        includeInExport: section.includeInExport,
      })),
    );

    expect(prepared.sections).toHaveLength(8);
    expect(prepared.references).toHaveLength(1);
    expect(prepared.figures.map((figure) => figure.assetKind).sort()).toEqual([
      'EQUATION',
      'FIGURE',
      'TABLE',
    ]);
    expect(prepared.linkedCount).toBe(1);
    // The contributors parser reads the byline the front matter gave us.
    expect(manifest.contributors.authors[0]).toMatchObject({
      name: 'Ahmad Jalil',
    });
  });

  it('refuses a file that is not a JATS article', () => {
    expect(() => parseJatsArticle('<<<not xml')).toThrow(/readable XML/i);
    expect(() => parseJatsArticle('<notes><p>hello</p></notes>')).toThrow(
      /not JATS/,
    );
  });
});
