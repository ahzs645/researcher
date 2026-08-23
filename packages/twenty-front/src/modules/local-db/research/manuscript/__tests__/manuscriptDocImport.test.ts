import {
  classifyHeading,
  extractCaptionOnlyFigures,
  extractImagesToFigures,
  extractTablesToFigures,
  linkImportedAssetReferences,
  parseMarkdownDocument,
  parseWordDocument,
  parseWordMlToMarkdown,
  parseWordMlToMarkdownBlocks,
  parseWordStyleDefinitions,
  serializeWordMarkdownBlocks,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { COMMAND_TEXT } from '@/local-db/research/manuscript/manuscriptDocxMath';
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

  it('classifies both consent statements as ethics back matter', () => {
    expect(classifyHeading('Consent for publication')).toEqual({
      sectionType: 'ETHICS',
      placement: 'BACK_MATTER',
    });
    expect(classifyHeading('Consent to participate')).toEqual({
      sectionType: 'ETHICS',
      placement: 'BACK_MATTER',
    });
    expect(classifyHeading('Informed consent statement')).toEqual({
      sectionType: 'ETHICS',
      placement: 'BACK_MATTER',
    });
  });

  it('classifies "study site" alongside "study area" as methods', () => {
    expect(classifyHeading('2.1 Study site')).toEqual({
      sectionType: 'METHODS',
      placement: 'MAIN',
    });
    expect(classifyHeading('Study area').sectionType).toBe('METHODS');
    expect(classifyHeading('Study location').sectionType).toBe('METHODS');
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

  it('anchors the shallowest heading at level 1 and lets subsections inherit their parent type', () => {
    const doc = parseMarkdownDocument(
      [
        '## Methods',
        'Overview.',
        '### Study site',
        'Downtown station.',
        '#### Participants',
        'Twenty volunteers.',
      ].join('\n'),
    );
    // The document's own top level is `##`, so that is level 1 — a Word file
    // whose sections are all "Heading 2" must not export a level deeper than
    // the one its author wrote.
    // "Study site" matches the METHODS rule directly; "Participants" matches no
    // rule and inherits METHODS from its ancestor instead of falling to OTHER.
    expect(doc.sections).toMatchObject([
      { name: 'Methods', sectionType: 'METHODS', placement: 'MAIN', level: 1 },
      {
        name: 'Study site',
        sectionType: 'METHODS',
        placement: 'MAIN',
        level: 2,
      },
      {
        name: 'Participants',
        sectionType: 'METHODS',
        placement: 'MAIN',
        level: 3,
      },
    ]);
  });

  it('keeps relative depth when a document starts below the title', () => {
    const doc = parseMarkdownDocument(
      [
        '# Metals downtown',
        '',
        '## Results',
        'Numbers.',
        '### Metals',
        'Cu.',
      ].join('\n'),
    );

    expect(doc.title).toBe('Metals downtown');
    expect(doc.sections.map((section) => section.level)).toEqual([1, 2]);
  });

  it('inherits SUPPLEMENT for supplement subsections but not across front matter', () => {
    const doc = parseMarkdownDocument(
      [
        '## Supplementary Material',
        'Extra detail.',
        '### Instrument drift',
        'Daily zero checks.',
        '## References',
        '1. Bertasson et al. 2023.',
        '### Reading notes',
        'Kept out of the reference list.',
      ].join('\n'),
    );

    expect(doc.sections).toMatchObject([
      { name: 'Supplementary Material', sectionType: 'SUPPLEMENT' },
      {
        name: 'Instrument drift',
        sectionType: 'SUPPLEMENT',
        placement: 'SUPPLEMENT',
      },
      { name: 'References', sectionType: 'REFERENCES' },
      { name: 'Reading notes', sectionType: 'OTHER', placement: 'MAIN' },
    ]);
  });

  it('moves short leading OTHER sections before structure into front matter', () => {
    const longContent = Array.from(
      { length: 500 },
      (_, index) => `word${index}`,
    ).join(' ');
    const doc = parseMarkdownDocument(
      [
        '## by',
        'Jane Researcher',
        '## Student # (230235918)',
        '',
        '## BHSc., University of Northern British Columbia',
        Array.from({ length: 22 }, (_, index) => `detail${index}`).join(' '),
        '## Abstract',
        'Summary.',
        '## Short note after abstract',
        'Keep this in main text.',
      ].join('\n'),
    );

    expect(doc.sections).toMatchObject([
      {
        name: 'by',
        sectionType: 'OTHER',
        placement: 'FRONT_MATTER',
        wordCount: 2,
      },
      {
        name: 'Student # (230235918)',
        sectionType: 'OTHER',
        placement: 'FRONT_MATTER',
        wordCount: 0,
      },
      {
        name: 'BHSc., University of Northern British Columbia',
        sectionType: 'OTHER',
        placement: 'FRONT_MATTER',
        wordCount: 22,
      },
      { name: 'Abstract', sectionType: 'ABSTRACT' },
      {
        name: 'Short note after abstract',
        sectionType: 'OTHER',
        placement: 'MAIN',
      },
    ]);

    const longPreface = parseMarkdownDocument(
      ['## Long preface', longContent, '## Abstract', 'Summary.'].join('\n'),
    );
    expect(longPreface.sections[0]).toMatchObject({
      sectionType: 'OTHER',
      placement: 'MAIN',
      wordCount: 500,
    });
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

  it('links every number in a multi-number cross-reference', () => {
    const figures = [
      {
        name: 'a',
        assetKind: 'FIGURE' as const,
        placement: 'MAIN' as const,
        refKey: 'imported-figure-8',
        caption: '',
        imageSource: 'NONE' as const,
        orderIndex: 0,
        sourceLabel: '8',
      },
      {
        name: 'b',
        assetKind: 'FIGURE' as const,
        placement: 'MAIN' as const,
        refKey: 'imported-figure-9',
        caption: '',
        imageSource: 'NONE' as const,
        orderIndex: 1,
        sourceLabel: '9',
      },
      {
        name: 'c',
        assetKind: 'FIGURE' as const,
        placement: 'MAIN' as const,
        refKey: 'imported-figure-10',
        caption: '',
        imageSource: 'NONE' as const,
        orderIndex: 2,
        sourceLabel: '10',
      },
    ];
    const sections = [
      {
        name: 'Results',
        sectionType: 'RESULTS',
        placement: 'MAIN',
        content:
          'Presented in Figures 8 & 9. More in Figures 8, 9, and 10. Unknown in Figures 8 & 99. Plain Figure 8 here.',
        orderIndex: 0,
        wordCount: 0,
        includeInExport: true,
      },
    ];
    const linked = linkImportedAssetReferences(sections, figures);

    expect(linked.sections[0].content).toContain(
      'Presented in [#imported-figure-8] & [#imported-figure-9].',
    );
    expect(linked.sections[0].content).toContain(
      'More in [#imported-figure-8], [#imported-figure-9], and [#imported-figure-10].',
    );
    expect(linked.sections[0].content).toContain(
      'Unknown in [#imported-figure-8] & 99.',
    );
    expect(linked.sections[0].content).toContain(
      'Plain [#imported-figure-8] here.',
    );
    expect(linked.linkedCount).toBe(7);
  });

  it('expands an en-dash range only when every number in it resolves', () => {
    const figure = (label: string) => ({
      name: label,
      assetKind: 'FIGURE' as const,
      placement: 'MAIN' as const,
      refKey: `imported-figure-${label}`,
      caption: '',
      imageSource: 'NONE' as const,
      orderIndex: Number(label),
      sourceLabel: label,
    });
    const sections = (content: string) => [
      {
        name: 'Results',
        sectionType: 'RESULTS',
        placement: 'MAIN',
        content,
        orderIndex: 0,
        wordCount: 0,
        includeInExport: true,
      },
    ];

    const full = linkImportedAssetReferences(
      sections('Compare Figures 8–10 side by side.'),
      [figure('8'), figure('9'), figure('10')],
    );
    expect(full.sections[0].content).toContain(
      'Compare [#imported-figure-8]–[#imported-figure-9]–[#imported-figure-10] side by side.',
    );

    const gappy = linkImportedAssetReferences(
      sections('Compare Figures 8–10 side by side.'),
      [figure('8'), figure('10')],
    );
    expect(gappy.sections[0].content).toContain(
      'Compare [#imported-figure-8]–[#imported-figure-10] side by side.',
    );
    expect(gappy.sections[0].content).not.toContain('imported-figure-9]');
  });

  it('keeps refKeys unique across embedded and caption-only extractors', () => {
    const sections = parseMarkdownDocument(
      [
        '## Results',
        '![Map](data:image/png;base64,AAAA)',
        'Figure 1. Sampling locations',
        'Figure 1. Planned follow-up figure',
      ].join('\n'),
    ).sections;
    const usedRefKeys = new Set<string>();
    const embeddedFigures = extractImagesToFigures(sections, 0, usedRefKeys);
    const captionOnlyFigures = extractCaptionOnlyFigures(
      embeddedFigures.sections,
      embeddedFigures.figures.length,
      usedRefKeys,
    );

    expect([
      ...embeddedFigures.figures.map((figure) => figure.refKey),
      ...captionOnlyFigures.figures.map((figure) => figure.refKey),
    ]).toEqual(['imported-figure-1', 'imported-figure-1-2']);
  });
});

describe('parseWordMlToMarkdown', () => {
  const para = (text: string, style?: string): string =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;

  it('preserves the complete normalized output for mixed Word content', () => {
    const cell = (text: string): string =>
      `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
    const row = (cells: string[]): string =>
      `<w:tr>${cells.map(cell).join('')}</w:tr>`;
    const abstract =
      'This study evaluates indoor air quality across classrooms using calibrated sensors and repeated observations collected throughout the academic year. The analysis compares ventilation conditions, occupancy patterns, particulate matter, and carbon dioxide concentrations while accounting for seasonal changes. Results provide a reproducible baseline for interpreting exposure patterns and planning practical improvements in school environments.';
    const boilerplateCaption =
      'Figure 1. Type your caption here. Obtain permission and include the acknowledgement required by the copyright holder if a figure is being reproduced from another source.';
    const xml = [
      '<w:document><w:body>',
      '<w:p w:rsidR="1"/>',
      para('A Study', 'Title'),
      '<w:p></w:p>',
      para('A Study'),
      para(abstract),
      para('Keywords: air quality; classrooms'),
      `<w:tbl>${row(['Site', 'Value'])}${row(['A', '12'])}</w:tbl>`,
      '<w:p><w:r><w:t>Figure 2. Observed sites</w:t></w:r><w:r><w:drawing><a:blip r:embed="rIdPlot"/></w:drawing></w:r></w:p>',
      para(boilerplateCaption),
      '<w:p/>',
      '</w:body></w:document>',
    ].join('\n');

    expect(
      parseWordMlToMarkdown(xml, {
        imageByRelationshipId: {
          rIdPlot: {
            dataUrl: 'data:image/png;base64,AAAA',
            altText: 'Plot',
          },
        },
      }),
    ).toBe(
      [
        '# A Study',
        '',
        '## Abstract',
        abstract,
        '',
        '## Keywords',
        '',
        'air quality; classrooms',
        '',
        '| Site | Value |',
        '| --- | --- |',
        '| A | 12 |',
        '',
        'Figure 2. Observed sites',
        '',
        '![Plot](data:image/png;base64,AAAA)',
      ].join('\n'),
    );
  });

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
      'Prior tools',
      'References',
    ]);
    expect(doc.sections[5]).toMatchObject({
      name: 'Prior tools',
      level: 2,
      content: 'Background prose.',
    });
    expect(doc.sections[6].sectionType).toBe('REFERENCES');
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

  it('exposes token provenance and serializes blocks without output drift', () => {
    const styles = parseWordStyleDefinitions(
      '<w:styles><w:style w:styleId="CustomHead"><w:name w:val="Heading 2"/></w:style></w:styles>',
    );
    const xml = `<w:body>${para('Methods', 'CustomHead')}${para(
      'Results',
    )}<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Sensor calibration</w:t></w:r></w:p></w:body>`;
    const blocks = parseWordMlToMarkdownBlocks(xml, { styles });

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        markdown: '\n## Methods\n',
        styleId: 'CustomHead',
        styleName: 'Heading 2',
        sourceHeadingLevel: 2,
        headingSource: 'style',
      },
      {
        kind: 'paragraph',
        markdown: '\n## Results\n',
        sourceHeadingLevel: 2,
        headingSource: 'semantic',
      },
      {
        kind: 'paragraph',
        markdown: '\n### Sensor calibration\n',
        sourceHeadingLevel: 3,
        headingSource: 'bold',
      },
    ]);
    expect(serializeWordMarkdownBlocks(blocks)).toBe(
      parseWordMlToMarkdown(xml, { styles }),
    );
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

    // The `_` in the literal run text "C_d=" is a literal underscore in Word, so
    // it has to be escaped or LaTeX would silently turn "d=" into a subscript.
    expect(doc.sections[0].content).toContain(
      String.raw`C\_d=\sum_{i=1}^{n} C_{f}`,
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

describe('Word merged table cells', () => {
  const cell = (text: string, properties = ''): string =>
    `<w:tc><w:tcPr>${properties}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const row = (cells: string, properties = ''): string =>
    `<w:tr>${properties ? `<w:trPr>${properties}</w:trPr>` : ''}${cells}</w:tr>`;

  it('turns w:gridSpan into continuation markers', () => {
    const xml = [
      '<w:body><w:tbl>',
      row(
        cell('') + cell('Percent of Data Censored', '<w:gridSpan w:val="3"/>'),
        '<w:tblHeader/>',
      ),
      row(
        cell('Sample Size') + cell('<50%') + cell('50-80%') + cell('>80%'),
        '<w:tblHeader/>',
      ),
      row(cell('n<50') + cell('Robust ROS') + cell('MLE') + cell('High')),
      '</w:tbl></w:body>',
    ].join('');

    const markdown = parseWordMlToMarkdown(xml);

    expect(markdown).toContain('| Percent of Data Censored | < | < |');
    // The separator lands after both header rows, so the deck survives.
    expect(
      markdown.split('\n').findIndex((line) => /^\|\s*---/.test(line)),
    ).toBe(
      markdown.split('\n').findIndex((line) => line.includes('Sample Size')) +
        1,
    );
  });

  it('turns a continued w:vMerge into an upward marker', () => {
    const xml = [
      '<w:body><w:tbl>',
      row(cell('Metal', '<w:vMerge w:val="restart"/>') + cell('Rural')),
      row(cell('', '<w:vMerge/>') + cell('Urban')),
      '</w:tbl></w:body>',
    ].join('');

    expect(parseWordMlToMarkdown(xml)).toContain('| ^ | Urban |');
  });
});

describe('Word line breaks and tabs', () => {
  const body = (paragraphs: string): string => `<w:body>${paragraphs}</w:body>`;
  const run = (text: string, bold = false): string =>
    `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t>${text}</w:t></w:r>`;

  it('keeps a <w:br/> as a line break instead of fusing the two runs', () => {
    const markdown = parseWordMlToMarkdown(
      body(
        `<w:p>${run('The sensors ran continuously.')}<w:br/>${run('A second observation period followed in the spring.')}</w:p>`,
      ),
    );

    expect(markdown).toBe(
      'The sensors ran continuously.\nA second observation period followed in the spring.',
    );
    expect(markdown).not.toContain('continuously.A second');
  });

  it('keeps a <w:tab/> as a tab and ignores pPr tab stops', () => {
    const markdown = parseWordMlToMarkdown(
      body(
        `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>${run('Site A')}<w:tab/>${run('12.4')}</w:p>`,
      ),
    );

    expect(markdown).toBe('Site A\t12.4');
  });

  it('splits a fully bold run after a break into its own heading', () => {
    const doc = parseWordDocument(
      body(
        `<w:p>${run('We thank the field crew for their patient sampling work.')}<w:br/>${run('Acknowledgment', true)}</w:p>` +
          `<w:p>${run('The station operators supported every campaign.')}<w:br/>${run('Data Availability', true)}</w:p>` +
          `<w:p>${run('Data are available from the corresponding author on request.')}</w:p>`,
      ),
    );

    expect(
      doc.sections.map((section) => [section.name, section.sectionType]),
    ).toEqual([
      ['Acknowledgment', 'ACKNOWLEDGMENTS'],
      ['Data Availability', 'DATA_AVAILABILITY'],
    ]);
    expect(doc.sections[1].content).toContain('available from the');
  });

  it('does not split a trailing bold run that is emphasis, not a heading', () => {
    const afterBreak = parseWordMlToMarkdownBlocks(
      body(
        `<w:p>${run('Concentrations rose sharply.')}<w:br/>${run('All differences were significant at the ninety-five percent level.', true)}</w:p>`,
      ),
    );
    const withoutBreak = parseWordMlToMarkdownBlocks(
      body(
        `<w:p>${run('Effects were significant at ')}${run('p&lt;0.05', true)}</w:p>`,
      ),
    );

    // A sentence-shaped trailing run stays in the paragraph, and with no break
    // there is nothing to split: one block out either way.
    expect(afterBreak).toHaveLength(1);
    expect(afterBreak[0].markdown).toContain('\nAll differences');
    expect(afterBreak[0].sourceHeadingLevel).toBeUndefined();
    expect(withoutBreak).toHaveLength(1);
  });
});

describe('OMML → LaTeX', () => {
  const mathOf = (omml: string): string => {
    const markdown = parseWordMlToMarkdown(
      `<w:body><w:p><m:oMath>${omml}</m:oMath></w:p></w:body>`,
    );
    return /\$\$([\s\S]*)\$\$/.exec(markdown)?.[1] ?? markdown;
  };
  const mRun = (text: string): string => `<m:r><m:t>${text}</m:t></m:r>`;
  const mSub = (base: string, subscript: string): string =>
    `<m:sSub><m:e>${base}</m:e><m:sub>${subscript}</m:sub></m:sSub>`;
  const mFrac = (numerator: string, denominator: string): string =>
    `<m:f><m:num>${numerator}</m:num><m:den>${denominator}</m:den></m:f>`;
  const mDelimiter = (inner: string, properties = ''): string =>
    `<m:d>${properties}<m:e>${inner}</m:e></m:d>`;

  it('keeps the outer script of a nested subscript', () => {
    expect(mathOf(mSub(mSub(mRun('C'), mRun('i')), mRun('crustal')))).toBe(
      String.raw`{C_{i}}_{crustal}`,
    );
  });

  it('keeps the outer fraction of a nested fraction', () => {
    expect(mathOf(mFrac(mFrac(mRun('a'), mRun('b')), mRun('c')))).toBe(
      String.raw`\frac{\frac{a}{b}}{c}`,
    );
  });

  it('preserves the aerosol/crustal contrast of the enrichment factor', () => {
    const ratio = mDelimiter(
      `${mSub(mRun('C'), mRun('i'))}${mRun('/')}${mSub(mRun('C'), mRun('ref'))}`,
    );

    expect(
      mathOf(
        `${mRun('EF=')}${mFrac(
          mSub(ratio, mRun('aerosal')),
          mSub(ratio, mRun('crustal')),
        )}`,
      ),
    ).toBe(
      String.raw`EF=\frac{{\left(C_{i}/C_{ref}\right)}_{aerosal}}{{\left(C_{i}/C_{ref}\right)}_{crustal}}`,
    );
  });

  it('keeps the n-ary operator when Word omits the upper limit', () => {
    expect(
      mathOf(
        `<m:nary><m:naryPr><m:chr m:val="∑"/><m:supHide m:val="1"/></m:naryPr><m:sub>${mRun('i')}</m:sub><m:e>${mRun('x')}</m:e></m:nary>`,
      ),
    ).toBe(String.raw`\sum_{i} x`);
  });

  it('maps m:chr to the matching operator and defaults to \\sum', () => {
    const nary = (chr: string | null): string =>
      `<m:nary><m:naryPr>${chr === null ? '' : `<m:chr m:val="${chr}"/>`}</m:naryPr><m:sub>${mRun('a')}</m:sub><m:sup>${mRun('b')}</m:sup><m:e>${mRun('f')}</m:e></m:nary>`;

    expect(mathOf(nary('∫'))).toBe(String.raw`\int_{a}^{b} f`);
    expect(mathOf(nary('∏'))).toBe(String.raw`\prod_{a}^{b} f`);
    expect(mathOf(nary('∮'))).toBe(String.raw`\oint_{a}^{b} f`);
    // Word writes no m:chr at all for a summation.
    expect(mathOf(nary(null))).toBe(String.raw`\sum_{a}^{b} f`);
  });

  it('keeps delimiters, and honours custom delimiter characters', () => {
    expect(mathOf(mDelimiter(`${mRun('a')}${mRun('+')}${mRun('b')}`))).toBe(
      String.raw`\left(a+b\right)`,
    );
    expect(
      mathOf(
        mDelimiter(
          mRun('x'),
          '<m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr>',
        ),
      ),
    ).toBe(String.raw`\left[x\right]`);
  });

  it('converts sub-superscripts, radicals, functions, accents and limits', () => {
    expect(
      mathOf(
        `<m:sSubSup><m:e>${mRun('x')}</m:e><m:sub>${mRun('i')}</m:sub><m:sup>${mRun('2')}</m:sup></m:sSubSup>`,
      ),
    ).toBe(String.raw`x_{i}^{2}`);
    expect(mathOf(`<m:rad><m:e>${mRun('2')}</m:e></m:rad>`)).toBe(
      String.raw`\sqrt{2}`,
    );
    expect(
      mathOf(
        `<m:rad><m:deg>${mRun('3')}</m:deg><m:e>${mRun('x')}</m:e></m:rad>`,
      ),
    ).toBe(String.raw`\sqrt[3]{x}`);
    expect(
      mathOf(
        `<m:func><m:fName>${mRun('sin')}</m:fName><m:e>${mRun('x')}</m:e></m:func>`,
      ),
    ).toBe(String.raw`\sin x`);
    expect(mathOf(`<m:bar><m:e>${mRun('x')}</m:e></m:bar>`)).toBe(
      String.raw`\bar{x}`,
    );
    expect(mathOf(`<m:acc><m:e>${mRun('y')}</m:e></m:acc>`)).toBe(
      String.raw`\hat{y}`,
    );
    expect(
      mathOf(
        `<m:limLow><m:e>${mRun('max')}</m:e><m:lim>${mRun('n')}</m:lim></m:limLow>`,
      ),
    ).toBe(String.raw`\underset{n}{max}`);
    expect(
      mathOf(
        `<m:limUpp><m:e>${mRun('X')}</m:e><m:lim>${mRun('~')}</m:lim></m:limUpp>`,
      ),
    ).toBe(String.raw`\overset{\sim}{X}`);
  });

  it('escapes LaTeX control characters in literal run text', () => {
    // `%` would comment out the rest of the line and `$` would close the math
    // block early, truncating the equation in the composer.
    expect(mathOf(mRun('50% &amp; #1_x $'))).toBe(
      String.raw`50\% \& \#1\_x \$`,
    );
  });

  it('escapes only literal run text, never generated subscript markup', () => {
    // Escaping is applied to `m:t` text *before* it is composed into LaTeX, so a
    // real `m:sSub` keeps its `_{…}` while the literal `%`/`&`/`_` are escaped.
    expect(
      mathOf(
        `${mSub(mRun('C'), mRun('d'))}${mRun(' = 50% &amp; C_ref')}${mFrac(
          mSub(mRun('x'), mRun('i')),
          mRun('2'),
        )}`,
      ),
    ).toBe(String.raw`C_{d} = 50\% \& C\_ref\frac{x_{i}}{2}`);
  });

  it('maps Word operator glyphs to the commands the exporter round-trips', () => {
    expect(mathOf(`${mRun('3')}${mRun('×')}${mRun('10')}`)).toBe(
      String.raw`3\times 10`,
    );
    expect(mathOf(mRun('a≤b±c·d'))).toBe(String.raw`a\le b\pm c\cdot d`);
    // The commands come from the exporter's own table, so export writes the
    // same glyphs back out.
    expect(COMMAND_TEXT.times).toBe('×');
    expect(COMMAND_TEXT.le).toBe('≤');
  });
});

describe('title page metadata', () => {
  const para = (text: string, style?: string): string =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const boldPara = (text: string): string =>
    `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;

  it('routes thesis title-page furniture into titlePageExtraLines', () => {
    const doc = parseWordDocument(
      `<w:body>${para('Airborne trace metals in a northern airshed')}${boldPara(
        'by',
      )}${boldPara('Jane Researcher')}${boldPara(
        'Student # (230235918)',
      )}${boldPara(
        'BHSc., University of Northern British Columbia, 2019',
      )}${boldPara(
        'A thesis submitted in partial fulfillment of the requirements for the degree of Master of Science',
      )}${boldPara('April 2026')}${para('Abstract', 'Heading1')}${para(
        'We measured trace metals.',
      )}</w:body>`,
    );

    expect(doc.title).toBe('Airborne trace metals in a northern airshed');
    expect(doc.authorLine).toBe('Jane Researcher');
    expect(doc.affiliations).toBe(
      'BHSc., University of Northern British Columbia, 2019',
    );
    expect(doc.titlePageExtraLines).toEqual([
      'by',
      'Student # (230235918)',
      'A thesis submitted in partial fulfillment of the requirements for the degree of Master of Science',
      'April 2026',
    ]);
    // Each of those lines used to import as its own empty junk section.
    expect(doc.sections.map((section) => section.name)).toEqual(['Abstract']);
    expect(doc.sections.map((section) => section.orderIndex)).toEqual([0]);
  });

  it('keeps the title page at the top level of the outline', () => {
    const doc = parseWordDocument(
      `<w:body>${para('Paper title')}${para('Jane Researcher')}${para(
        'Introduction',
        'Heading1',
      )}${para('Body prose.')}</w:body>`,
    );

    expect(doc.sections[0]).toMatchObject({ name: 'Title page', level: 1 });
  });
});

describe('author contributions', () => {
  const para = (text: string, style?: string): string =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const statement =
    'All authors contributed to the study conception, data collection and analysis.';

  it('synthesizes a heading only when the statement has none', () => {
    const doc = parseWordDocument(
      `<w:body>${para('Paper title')}${para('Introduction', 'Heading1')}${para(
        'Body prose.',
      )}${para(statement)}</w:body>`,
    );
    const contributions = doc.sections.filter(
      (section) => section.sectionType === 'AUTHOR_CONTRIBUTIONS',
    );

    expect(contributions).toHaveLength(1);
    expect(contributions[0].content).toContain('All authors contributed');
  });

  it('does not duplicate a real Author contributions heading', () => {
    const doc = parseWordDocument(
      `<w:body>${para('Paper title')}${para('Introduction', 'Heading1')}${para(
        'Body prose.',
      )}${para('Author contributions', 'Heading1')}${para(statement)}</w:body>`,
    );
    const contributions = doc.sections.filter(
      (section) => section.sectionType === 'AUTHOR_CONTRIBUTIONS',
    );

    expect(contributions).toHaveLength(1);
    expect(contributions[0].content).toContain('All authors contributed');
  });
});
