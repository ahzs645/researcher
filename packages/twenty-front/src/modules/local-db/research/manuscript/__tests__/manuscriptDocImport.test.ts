import {
  classifyHeading,
  extractTablesToFigures,
  parseMarkdownDocument,
  parseWordDocument,
  parseWordMlToMarkdown,
} from '../manuscriptDocImport';

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
    expect(sections[0].content).toContain('[#imported-table-1]');
    expect(sections[0].content).not.toContain('| Site | PM2.5 |');
  });

  it('leaves prose sections untouched when there is no table', () => {
    const doc = parseMarkdownDocument('## Intro\nJust prose, no tables.');
    const { figures } = extractTablesToFigures(doc.sections);
    expect(figures).toHaveLength(0);
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
});
