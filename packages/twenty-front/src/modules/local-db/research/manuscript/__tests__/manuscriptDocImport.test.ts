import {
  classifyHeading,
  extractCaptionOnlyFigures,
  extractImagesToFigures,
  extractTablesToFigures,
  linkImportedAssetReferences,
  parseMarkdownDocument,
  parseWordDocument,
  parseWordMlToMarkdown,
  parseWordStyleDefinitions,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { stripManuscriptScriptMarkers } from '@/local-db/research/manuscript/manuscriptScripts';

describe('classifyHeading', () => {
  it('classifies common IMRaD headings regardless of numbering/case', () => {
    expect(classifyHeading('Abstract')).toEqual({
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
    });
    expect(classifyHeading('1. Introduction')).toEqual({
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
    });
    expect(classifyHeading('2. Materials and Methods')).toEqual({
      sectionType: 'METHODS',
      placement: 'MAIN',
    });
    expect(classifyHeading('IV. Results and Discussion')).toEqual({
      sectionType: 'RESULTS',
      placement: 'MAIN',
    });
    expect(classifyHeading('Conclusions')).toEqual({
      sectionType: 'CONCLUSION',
      placement: 'MAIN',
    });
  });

  it('routes back-matter sections to BACK_MATTER / SUPPLEMENT', () => {
    expect(classifyHeading('References').placement).toBe('BACK_MATTER');
    expect(classifyHeading('Acknowledgements').sectionType).toBe(
      'ACKNOWLEDGMENTS',
    );
    expect(classifyHeading('Data and code availability').sectionType).toBe(
      'DATA_AVAILABILITY',
    );
    expect(classifyHeading('Conflicts of Interest').sectionType).toBe(
      'CONFLICTS',
    );
    expect(classifyHeading('Supplementary Material').placement).toBe(
      'SUPPLEMENT',
    );
    expect(
      classifyHeading(
        'S2.1: Details about the methodology of Positive Matrix Factorization (PMF) analysis',
      ),
    ).toEqual({ sectionType: 'SUPPLEMENT', placement: 'SUPPLEMENT' });
  });

  it('falls back to OTHER for unrecognized headings', () => {
    expect(classifyHeading('A Personal Anecdote')).toEqual({
      sectionType: 'OTHER',
      placement: 'MAIN',
    });
  });
});

describe('parseMarkdownDocument', () => {
  it('splits a headed document into a title + classified sections', () => {
    const doc = parseMarkdownDocument(
      [
        '# Air quality in schools',
        '',
        '## Abstract',
        'We measured PM2.5 across twelve classrooms.',
        '',
        '## 1. Introduction',
        'Indoor air quality affects learning.',
        '',
        '## Methods',
        'Sensors logged hourly.',
        '',
        '## References',
        '1. Bertasson et al. 2023.',
      ].join('\n'),
    );

    expect(doc.title).toBe('Air quality in schools');
    expect(doc.sections.map((section) => section.sectionType)).toEqual([
      'ABSTRACT',
      'INTRODUCTION',
      'METHODS',
      'REFERENCES',
    ]);
    expect(doc.sections[0].content).toContain('PM2.5');
    expect(doc.sections[0].wordCount).toBeGreaterThan(0);
    expect(doc.sections.map((section) => section.orderIndex)).toEqual([
      0, 1, 2, 3,
    ]);
    // The references section is back matter.
    expect(doc.sections[3].placement).toBe('BACK_MATTER');
  });

  it('treats opening prose as the title when there is no leading heading', () => {
    const doc = parseMarkdownDocument(
      ['My Thesis Title', '', '## Introduction', 'Body text here.'].join('\n'),
    );
    expect(doc.title).toBe('My Thesis Title');
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].sectionType).toBe('INTRODUCTION');
  });

  it('recognizes bold-only lines as headings (pasted Word text)', () => {
    const doc = parseMarkdownDocument(
      ['**Abstract**', 'Short summary.', '**Methods**', 'We did things.'].join(
        '\n',
      ),
    );
    expect(doc.sections.map((section) => section.sectionType)).toEqual([
      'ABSTRACT',
      'METHODS',
    ]);
  });

  it('keeps third-level headings inside their parent section', () => {
    const doc = parseMarkdownDocument(
      ['## Methods', 'Overview.', '### Study site', 'Downtown station.'].join(
        '\n',
      ),
    );
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].sectionType).toBe('METHODS');
    expect(doc.sections[0].content).toContain('### Study site');
  });

  it('wraps an unstructured document in a single Body section', () => {
    const doc = parseMarkdownDocument('Just one paragraph of text.');
    expect(doc.title).toBe('Just one paragraph of text.');
    expect(doc.sections).toHaveLength(0);
  });

  it('keeps a Markdown table inline in its section body', () => {
    const doc = parseMarkdownDocument(
      [
        '## Results',
        'See the table.',
        '',
        '| Site | PM2.5 |',
        '| --- | --- |',
        '| A | 12 |',
      ].join('\n'),
    );
    expect(doc.sections[0].content).toContain('| Site | PM2.5 |');
  });
});

describe('extractTablesToFigures', () => {
  it('lifts a standalone table into a figure and leaves a cross-ref', () => {
    const doc = parseMarkdownDocument(
      [
        '## Results',
        'Table 1. Growth parameters',
        '| Site | PM2.5 |',
        '| --- | --- |',
        '| A | 12 |',
      ].join('\n'),
    );
    const { sections, figures } = extractTablesToFigures(doc.sections);
    expect(figures).toHaveLength(1);
    expect(figures[0].assetKind).toBe('TABLE');
    expect(figures[0].refKey).toBe('imported-table-1');
    expect(figures[0].caption).toBe('Growth parameters');
    expect(figures[0].tableData).toContain('| Site | PM2.5 |');
    // The table is replaced by a resolvable cross-ref, not duplicated.
    expect(sections[0].content).toContain('[[asset:imported-table-1]]');
    expect(sections[0].content).not.toContain('| Site | PM2.5 |');
  });

  it('leaves prose sections untouched when there is no table', () => {
    const doc = parseMarkdownDocument('## Intro\nJust prose, no tables.');
    const { figures } = extractTablesToFigures(doc.sections);
    expect(figures).toHaveLength(0);
  });

  it('prefers an explicit caption over an earlier narrative table mention', () => {
    const doc = parseMarkdownDocument(
      [
        '## Background',
        'Table 1 summarizes representative tools.',
        '| Tool | Scope |',
        '| --- | --- |',
        '| A | Analysis |',
        'Table 1. Representative related tools and scope',
      ].join('\n'),
    );
    const extracted = extractTablesToFigures(doc.sections);

    expect(extracted.figures[0].caption).toBe(
      'Representative related tools and scope',
    );
    expect(extracted.sections[0].content).toContain(
      'Table 1 summarizes representative tools.',
    );
  });
});

describe('extractCaptionOnlyFigures', () => {
  it('creates a linked placeholder while keeping narrative references live', () => {
    const sections = parseMarkdownDocument(
      [
        '## Software overview',
        'Figure 1 outlines the modular architecture.',
        'Figure 1. Modular architecture of the proposed framework.',
      ].join('\n'),
    ).sections;
    const extracted = extractCaptionOnlyFigures(sections);
    const linked = linkImportedAssetReferences(
      extracted.sections,
      extracted.figures,
    );

    expect(extracted.figures).toHaveLength(1);
    expect(extracted.figures[0]).toMatchObject({
      assetKind: 'FIGURE',
      refKey: 'imported-figure-1',
      caption: 'Modular architecture of the proposed framework.',
      imageSource: 'NONE',
      sectionOrderIndex: 0,
    });
    expect(linked.sections[0].content).toContain(
      '[#imported-figure-1] outlines the modular architecture.',
    );
    expect(linked.sections[0].content).toContain('[[asset:imported-figure-1]]');
  });
});

describe('extractImagesToFigures', () => {
  it('lifts an embedded data URL and its following caption into a figure', () => {
    const sections = parseMarkdownDocument(
      [
        '## Results',
        '![Map](data:image/png;base64,AAAA)',
        'Figure 1. Sampling locations',
      ].join('\n'),
    ).sections;
    const { sections: nextSections, figures } =
      extractImagesToFigures(sections);

    expect(figures).toHaveLength(1);
    expect(figures[0]).toMatchObject({
      assetKind: 'FIGURE',
      caption: 'Sampling locations',
      imageSource: 'UPLOAD',
      refKey: 'imported-figure-1',
    });
    expect(nextSections[0].content).toContain('[[asset:imported-figure-1]]');
    expect(nextSections[0].content).not.toContain('data:image/png');
  });

  it('links source figure labels and preserves panels and supplement ownership', () => {
    const sections = parseMarkdownDocument(
      [
        '## Results',
        'The wood-burning factor had sharp peaks (Fig. 2.6b).',
        'The same composite is also called Fig. 6 in the source.',
        '![Factors](data:image/png;base64,AAAA)',
        'Figure 2.6. Factor profiles',
        '## Supplementary Material',
        'The seasonal behavior is shown in Fig. S2.18.',
        'The abbreviated source label is Fig. S18.',
        '![Seasonal](data:image/png;base64,BBBB)',
        'Fig. 10. S2.18: Seasonal behavior',
      ].join('\n'),
    ).sections;
    const extracted = extractImagesToFigures(sections);
    const linked = linkImportedAssetReferences(
      extracted.sections,
      extracted.figures,
    );

    expect(linked.figures[0]).toMatchObject({
      sourceLabel: '2.6',
      refKey: 'imported-figure-2-6',
      placement: 'MAIN',
      sectionOrderIndex: 0,
    });
    expect(linked.figures[1]).toMatchObject({
      sourceLabel: 'S2.18',
      refKey: 'imported-figure-s2-18',
      placement: 'SUPPLEMENT',
      sectionOrderIndex: 1,
    });
    expect(linked.sections[0].content).toContain('([#imported-figure-2-6]b)');
    expect(linked.sections[0].content).toContain(
      '[#imported-figure-2-6] in the source',
    );
    expect(linked.sections[1].content).toContain('[#imported-figure-s2-18]');
    expect(linked.linkedCount).toBe(4);
  });
});

describe('parseWordMlToMarkdown', () => {
  const para = (text: string, style?: string): string =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;

  it('maps heading styles to Markdown headings and keeps order', () => {
    const xml = `<w:document><w:body>${para('Air Quality', 'Title')}${para(
      'Abstract',
      'Heading1',
    )}${para('We measured PM2.5 &amp; CO2.')}</w:body></w:document>`;
    const md = parseWordMlToMarkdown(xml);
    expect(md).toContain('# Air Quality');
    expect(md).toContain('# Abstract');
    // XML entities are decoded.
    expect(md).toContain('We measured PM2.5 & CO2.');
  });

  it('converts Word tables to GFM Markdown tables', () => {
    const cell = (text: string): string =>
      `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
    const row = (cells: string[]): string =>
      `<w:tr>${cells.map(cell).join('')}</w:tr>`;
    const xml = `<w:body>${para('Results', 'Heading1')}<w:tbl>${row([
      'Site',
      'PM2.5',
    ])}${row(['A', '12'])}</w:tbl></w:body>`;
    const md = parseWordMlToMarkdown(xml);
    expect(md).toContain('| Site | PM2.5 |');
    expect(md).toContain('| A | 12 |');
  });

  it('keeps a table after a self-closing spacer paragraph', () => {
    const cell = (text: string): string =>
      `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
    const row = (cells: string[]): string =>
      `<w:tr>${cells.map(cell).join('')}</w:tr>`;
    const xml = `<w:body><w:p w:rsidR="1"/><w:tbl>${row([
      'Sample',
      'Value',
    ])}${row(['A', '12'])}</w:tbl></w:body>`;

    expect(parseWordMlToMarkdown(xml)).toContain('| Sample | Value |');
  });

  it('parses a whole Word document end to end', () => {
    const xml = `<w:body>${para('Thesis', 'Title')}${para(
      'Introduction',
      'Heading1',
    )}${para('Indoor air quality matters.')}</w:body>`;
    const doc = parseWordDocument(xml);
    expect(doc.title).toBe('Thesis');
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].sectionType).toBe('INTRODUCTION');
    expect(doc.sections[0].content).toContain('Indoor air quality matters.');
  });

  it('preserves numbered Word heading hierarchy without duplicating the abstract', () => {
    const xml = `<w:body>${para('Paper title')}${para(
      '[Author 1]1, [Author 2]2',
    )}${para('1 Institute A')}${para('2 Institute B')}${para(
      'Correspondence: Author 1 (author@example.org)',
    )}${para('Abstract', 'Heading1')}${para(
      'This abstract is intentionally long enough to trigger the fallback abstract detector when a Keywords heading follows it. It must still appear only once in the reconstructed manuscript and retain all of its source prose without an empty duplicate section.',
    )}${para('Keywords', 'Heading2')}${para(
      'aerosol; software',
    )}${para('1 Introduction', 'Heading1')}${para(
      'Introduction prose.',
    )}${para('2 Background', 'Heading1')}${para(
      '2.1 Prior tools',
      'Heading2',
    )}${para('Background prose.')}${para(
      '3 References',
      'Heading1',
    )}${para('Example reference.')}</w:body>`;
    const doc = parseWordDocument(xml);

    expect(
      doc.sections.filter((section) => section.sectionType === 'ABSTRACT'),
    ).toHaveLength(1);
    expect(doc.sections.map((section) => section.name)).toEqual([
      'Title page',
      'Abstract',
      'Keywords',
      'Introduction',
      'Background',
      'References',
    ]);
    expect(doc.sections[4].content).toContain('### Prior tools');
    expect(doc.sections[4].content).not.toContain('2.1 Prior tools');
    expect(doc.sections[5].sectionType).toBe('REFERENCES');
    expect(doc.affiliations).toBe('1 Institute A\n2 Institute B');
    expect(doc.correspondingAuthor).toBe(
      'Correspondence: Author 1 (author@example.org)',
    );
  });

  it('uses styles.xml definitions and semantic text for custom Word headings', () => {
    const styles = parseWordStyleDefinitions(
      '<w:styles><w:style w:styleId="CustomHead"><w:name w:val="Heading 2"/></w:style></w:styles>',
    );
    const xml = `<w:body>${para('Paper title')}${para(
      'Introduction',
      'CustomHead',
    )}${para('Body.')}</w:body>`;
    const doc = parseWordDocument(xml, { styles });

    expect(doc.title).toBe('Paper title');
    expect(doc.sections.map((section) => section.sectionType)).toEqual([
      'INTRODUCTION',
    ]);
  });

  it('preserves OMML equations and embedded image relationships', () => {
    const xml = `<w:body>${para('Paper title')}${para(
      'Methods',
      'Heading1',
    )}<w:p><m:oMath><m:r><m:t>C</m:t></m:r><m:sSub><m:e><m:r><m:t>f</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub></m:sSub></m:oMath></w:p><w:p><w:r><w:drawing><a:blip r:embed="rId9"/></w:drawing></w:r></w:p></w:body>`;
    const doc = parseWordDocument(xml, {
      imageByRelationshipId: {
        rId9: {
          dataUrl: 'data:image/png;base64,AAAA',
          altText: 'Sampling map',
        },
      },
    });

    expect(doc.sections[0].content).toContain('$$');
    expect(doc.sections[0].content).toContain('data:image/png;base64,AAAA');
    expect(doc.stats).toMatchObject({
      embeddedImageCount: 1,
      equationCount: 1,
    });
  });

  it('preserves summation limits and expressions from OMML equations', () => {
    const xml = `<w:body>${para('Paper title')}${para(
      'Methods',
      'Heading1',
    )}<w:p><m:oMath><m:r><m:t>C_d=</m:t></m:r><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:sSub><m:e><m:r><m:t>C</m:t></m:r></m:e><m:sub><m:r><m:t>f</m:t></m:r></m:sub></m:sSub></m:e></m:nary></m:oMath></w:p></w:body>`;
    const doc = parseWordDocument(xml);

    expect(doc.sections[0].content).toContain(
      String.raw`C_d=\sum_{i=1}^{n} C_{f}`,
    );
  });

  it('preserves Word superscript and subscript runs in imported prose', () => {
    const xml = `<w:body>${para('Paper title')}${para(
      'Introduction',
      'Heading1',
    )}<w:p><w:r><w:t>PM</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2.5</w:t></w:r><w:r><w:t> uses μg/m</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>3</w:t></w:r></w:p></w:body>`;
    const doc = parseWordDocument(xml);

    expect(doc.sections[0].content).not.toBe('PM2.5 uses μg/m3');
    expect(stripManuscriptScriptMarkers(doc.sections[0].content)).toBe(
      'PM2.5 uses μg/m3',
    );
  });
});
