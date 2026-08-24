// End-to-end: a real Copernicus/AMT manuscript, from the .docx body Word hands
// us to a formatted export.
//
// Every other importer test builds the document it wants to prove something
// about. This one starts from a paper that already exists (see the fixture) and
// asserts the whole chain: WordprocessingML → sections/figures/references →
// numbering and cross-references → the assembled export bundle, under the
// seeded Atmospheric Measurement Techniques journal template.

import {
  parseWordDocument,
  parseWordStyleDefinitions,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';
import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { buildJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsExport';
import { buildManuscriptImportSummary } from '@/local-db/research/import-wizard/utils/buildManuscriptImportSummary';
import {
  AMT_PAPER_IMAGES,
  AMT_PAPER_STYLES_XML,
  buildAmtPaperWordMl,
} from './fixtures/amtPaperWordMl';

const importAmtPaper = () => {
  const document = parseWordDocument(buildAmtPaperWordMl(), {
    styles: parseWordStyleDefinitions(AMT_PAPER_STYLES_XML),
    imageByRelationshipId: AMT_PAPER_IMAGES,
  });
  return { document, prepared: prepareManuscriptImport(document, true) };
};

// The seeded "Atmospheric Measurement Techniques (Copernicus)" template.
const AMT_STYLE = {
  name: 'Atmospheric Measurement Techniques (Copernicus)',
  citationMode: 'AUTHOR_DATE',
  citationStyleId: 'copernicus-publications',
  figureLabelFormat: 'Figure {n}',
  tableLabelFormat: 'Table {n}',
  crossRefFormat: 'Fig. {n}',
  supplementPrefix: 'S',
  numberingScope: 'CONTINUOUS',
  figureCaptionPosition: 'BELOW',
  tableCaptionPosition: 'ABOVE',
  abstractWordLimit: 350,
  sectionNumbering: true,
};

describe('AMT manuscript import (real Copernicus paper)', () => {
  it('reads the title block as metadata, not as sections', () => {
    const { document } = importAmtPaper();

    // The title runs over two centred lines and a subtitle line; all three are
    // the title, and none of them is the author list.
    expect(document.title).toBe(
      'Quantifying temporal aggregation and representativeness bias when integrating aethalometer and filter-based carbonaceous aerosol measurements The AETH Modular measurement-integration framework',
    );
    expect(document.authorLine).toBe('Ahmad Jalil and Hossein Kazemian');
    expect(document.affiliations).toContain(
      'University of Northern British Columbia',
    );
    expect(document.correspondingAuthor).toBe(
      'Correspondence: Ahmad Jalil (ajalil@unbc.ca)',
    );
    // The author line is centred and bold, exactly like a heading.
    expect(document.sections.map((section) => section.name)).not.toContain(
      'Ahmad Jalil and Hossein Kazemian',
    );
  });

  it('keeps the numbered section hierarchy the author wrote', () => {
    const { document } = importAmtPaper();
    const outline = document.sections.map(
      (section) => `${section.level}:${section.sectionType}:${section.name}`,
    );

    expect(outline).toEqual([
      '1:TITLE_PAGE:Title page',
      '1:KEYWORDS:Keywords',
      '1:ABSTRACT:Abstract',
      '1:INTRODUCTION:Introduction',
      '1:OTHER:Measurement framework',
      '2:INTRODUCTION:Quantities and terminology',
      '2:INTRODUCTION:Optical equations and correction terms',
      '2:INTRODUCTION:Sources of measurement bias',
      '1:OTHER:Formal temporal-alignment method',
      '2:INTRODUCTION:Interval representation and time standards',
      '2:INTRODUCTION:Exact overlap and aggregation operators',
      '2:INTRODUCTION:Completeness, gaps, and partial coverage',
      '2:INTRODUCTION:Naïve comparators and effect metrics',
      '2:INTRODUCTION:AAE-based source interpretation',
      '1:OTHER:Multi-site case study',
      '2:METHODS:Dataset and study design',
      '2:OTHER:Repository audit and required harmonization',
      '2:OTHER:Pre-specified result reporting',
      '1:DISCUSSION:Discussion',
      '2:DISCUSSION:What exact alignment can resolve',
      '1:OTHER:Limitations',
      '1:CONCLUSION:Conclusions',
      '1:DATA_AVAILABILITY:Code and data availability',
      '1:AUTHOR_CONTRIBUTIONS:Author contributions',
      '1:CONFLICTS:Competing interests',
      '1:ACKNOWLEDGMENTS:Acknowledgements',
      '1:REFERENCES:References',
      '1:APPENDIX:Appendix A: Algorithm pseudocode',
      '1:APPENDIX:Appendix B: Primary sensitivity grid',
    ]);
  });

  it('lifts numbered display equations out of their layout tables', () => {
    const { prepared } = importAmtPaper();
    const equations = prepared.figures.filter(
      (figure) => figure.assetKind === 'EQUATION',
    );

    expect(equations.map((equation) => equation.sourceLabel)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11a',
      '11b',
      '12',
      '13',
      '14',
    ]);
    expect(equations[6]).toMatchObject({
      refKey: 'eq-7',
      equationLatex: 'x̄j,time = Σi wij xi / Σi wij',
      imageSource: 'NONE',
    });
    // Each equation stays where the author put it.
    const overlap = prepared.sections.find((section) =>
      section.name.startsWith('Exact overlap'),
    );
    expect(overlap?.content).toContain('[[asset:eq-6]]');
    expect(overlap?.content).toContain('[[asset:eq-7]]');
  });

  it('numbers only the real tables, and reads the appendix label', () => {
    const { prepared } = importAmtPaper();
    const tables = prepared.figures.filter(
      (figure) => figure.assetKind === 'TABLE',
    );

    // Four numbered tables plus the appendix's "Table B1" — the fourteen
    // equations and the status callout are not tables.
    expect(tables.map((tableFigure) => tableFigure.sourceLabel)).toEqual([
      '1',
      '2',
      '3',
      '4',
      'B1',
    ]);
    expect(tables[0].caption).toBe(
      'Measurement quantities that should remain distinct in the manuscript and software outputs.',
    );
    expect(tables[4]).toMatchObject({
      refKey: 'imported-table-b1',
      placement: 'SUPPLEMENT',
    });

    // The shaded one-cell callout is prose, not a captionless table.
    expect(
      tables.some((tableFigure) =>
        (tableFigure.tableData ?? '').includes('Working-draft status'),
      ),
    ).toBe(false);
  });

  it('takes figure captions from under the artwork', () => {
    const { prepared } = importAmtPaper();
    const figures = prepared.figures.filter(
      (figure) => figure.assetKind === 'FIGURE',
    );

    expect(figures).toHaveLength(3);
    expect(figures.map((figure) => figure.sourceLabel)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(figures[1].caption).toContain('Exact 09:00–09:00 alignment');
    expect(figures[1].imageSource).toBe('UPLOAD');
  });

  it('reconciles author-date citations in every form the paper uses', () => {
    const { prepared } = importAmtPaper();
    const byKey = new Map(
      prepared.references.map((reference) => [
        reference.citationKey,
        reference,
      ]),
    );
    const introduction = prepared.sections.find(
      (section) => section.sectionType === 'INTRODUCTION',
    );

    expect(prepared.references).toHaveLength(12);
    // Narrative citation: the prose keeps the name, the token suppresses it.
    expect(introduction?.content).toContain(
      'recommended by Petzold et al. [-@petzold2013]',
    );
    // Grouped parenthetical citation.
    expect(introduction?.content).toContain(
      '[@weingartner2003; @drinovec2015]',
    );
    // "2018a, b" is two papers, and each keeps the source's own suffix.
    expect(introduction?.content).toContain(
      '[@weakley2018a; @weakley2018b; @takahama2019]',
    );
    expect(byKey.has('weakley2018a')).toBe(true);
    expect(byKey.has('weakley2018b')).toBe(true);
  });

  it('parses the reference entries without mangling names, DOIs or titles', () => {
    const { prepared } = importAmtPaper();
    const byKey = new Map(
      prepared.references.map((reference) => [
        reference.citationKey,
        reference,
      ]),
    );

    // Diacritics survive into the printed bibliography.
    expect(byKey.get('dusing2019')?.authors).toBe('Düsing');
    // A DOI whose suffix carries balanced parentheses is not truncated.
    expect(byKey.get('weingartner2003')?.doi).toBe(
      '10.1016/S0021-8502(03)00359-8',
    );
    // The year inside that DOI must not be mistaken for the entry's own year.
    expect(byKey.get('weakley2018b')).toMatchObject({
      year: 2018,
      name: expect.stringContaining('Thermal/optical reflectance equivalent'),
    });
  });

  it('links "Table 2" and "Eqs. (7) and (8)" to the assets they name', () => {
    const { prepared } = importAmtPaper();

    const dataset = prepared.sections.find(
      (section) => section.name === 'Dataset and study design',
    );
    expect(dataset?.content).toContain('[#imported-table-2]');

    const overlap = prepared.sections.find((section) =>
      section.name.startsWith('Exact overlap'),
    );
    expect(overlap?.content).toContain('Eqs. [#eq-7] and [#eq-8] coincide');

    const completeness = prepared.sections.find((section) =>
      section.name.startsWith('Completeness'),
    );
    expect(completeness?.content).toContain('Eq. [#eq-7] is calculated');
  });

  it('summarizes the import the way the wizard shows it', () => {
    const { prepared } = importAmtPaper();
    const summary = buildManuscriptImportSummary({ preparedImport: prepared });

    expect(summary).toMatchObject({
      figureCount: 3,
      tableCount: 5,
      equationAssetCount: 15,
      referenceCount: 12,
    });
    expect(summary.linkedCitationCount).toBeGreaterThanOrEqual(14);
    expect(summary.groups.map((group) => group.placement)).toEqual([
      'FRONT_MATTER',
      'MAIN',
      'BACK_MATTER',
      'SUPPLEMENT',
    ]);
  });

  it('exports under the AMT template with Copernicus numbering', () => {
    const { document, prepared } = importAmtPaper();
    const input: BuildBundleInput = {
      manuscript: {
        id: 'amt',
        name: document.title ?? '',
        targetVenue: 'Atmospheric Measurement Techniques',
        authorLine: document.authorLine,
        affiliations: document.affiliations,
        correspondingAuthor: document.correspondingAuthor,
      },
      style: AMT_STYLE,
      authors: document.authorLine ?? '',
      sections: prepared.sections.map((section, index) => ({
        id: `s${index}`,
        ...section,
      })),
      figures: prepared.figures.map((figure, index) => ({
        id: `f${index}`,
        ...figure,
      })),
      references: prepared.references.map((reference, index) => ({
        id: `r${index}`,
        ...reference,
      })),
    };

    const bundle = buildManuscriptBundle(input);

    // Equations, figures and tables each number in their own sequence.
    const numbered = new Map(
      bundle.numberedFigures.map((figure) => [figure.refKey, figure.label]),
    );
    expect(numbered.get('eq-7')).toBe('(7)');
    expect(numbered.get('imported-figure-2')).toBe('Figure 2');
    expect(numbered.get('imported-table-2')).toBe('Table 2');
    expect(numbered.get('imported-table-b1')).toBe('Table S1');

    // Cross-references render as the journal's labels.
    expect(bundle.mainMarkdown).toContain('Eqs. (7) and (8) coincide');
    expect(bundle.mainMarkdown).toContain('as summarized in Table 2');

    // Each equation is typeset where it stood, under its own number.
    expect(bundle.mainMarkdown).toContain(
      ['$$x̄j,time = Σi wij xi / Σi wij$$', '', '(7)'].join('\n'),
    );
    expect(bundle.warnings).not.toContain('(7) has no equation body yet');

    // The 361-word abstract exceeds the AMT limit — the export says so instead
    // of silently shipping it.
    expect(bundle.warnings).toContain('Abstract is 361 words (limit 350)');

    // Every reference the paper cites reaches the bibliography.
    expect(bundle.citedKeys).toContain('petzold2013');
    expect(bundle.citedKeys).toContain('weakley2018b');
    expect(bundle.bibliography.length).toBeGreaterThanOrEqual(10);

    // A narrative citation prints its year only; the prose already has the name.
    expect(bundle.mainMarkdown).toContain(
      'recommended by Petzold et al. (2013)',
    );

    const jats = buildJatsArticle(bundle);
    expect(jats).toContain('<article-title>');
    expect(jats).toContain('Atmospheric Measurement Techniques');
  });
});
