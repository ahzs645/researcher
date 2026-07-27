import {
  REFERENCES_EXCLUSION_REASON,
  SOURCE_EXCLUSION_REASON,
  TITLE_PAGE_EXCLUSION_REASON,
  buildManuscriptImportSummary,
} from '@/local-db/research/import-wizard/utils/buildManuscriptImportSummary';
import {
  type ImportedDocument,
  type ImportedFigureDraft,
  type ImportedSectionDraft,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';
import {
  PORTABLE_MANUSCRIPT_FORMAT,
  PORTABLE_MANUSCRIPT_VERSION,
  type PortableResearchPaperManifest,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';

const section = (
  overrides: Partial<ImportedSectionDraft> & { name: string },
): ImportedSectionDraft => ({
  sectionType: 'OTHER',
  placement: 'MAIN',
  content: '',
  orderIndex: 0,
  wordCount: 0,
  includeInExport: true,
  ...overrides,
});

const figure = (
  overrides: Partial<ImportedFigureDraft> & { refKey: string },
): ImportedFigureDraft => ({
  name: overrides.refKey,
  assetKind: 'FIGURE',
  placement: 'MAIN',
  caption: '',
  imageSource: 'NONE',
  orderIndex: 0,
  ...overrides,
});

const portablePrepared = (
  sections: ImportedSectionDraft[],
  figures: ImportedFigureDraft[] = [],
) => ({
  sections,
  references: [],
  linkedCount: 0,
  figures,
  linkedAssetCount: 0,
  tableCount: 0,
  imageCount: 0,
  portable: true as const,
});

describe('buildManuscriptImportSummary', () => {
  it('groups sections by placement in reading order with counts and names', () => {
    const summary = buildManuscriptImportSummary({
      preparedImport: portablePrepared([
        section({
          name: 'Results',
          placement: 'MAIN',
          sectionType: 'RESULTS',
          wordCount: 400,
        }),
        section({
          name: 'Appendix A',
          placement: 'SUPPLEMENT',
          wordCount: 50,
        }),
        section({
          name: 'Abstract',
          placement: 'FRONT_MATTER',
          sectionType: 'ABSTRACT',
          wordCount: 120,
        }),
        section({
          name: 'Introduction',
          placement: 'MAIN',
          sectionType: 'INTRODUCTION',
          wordCount: 300,
        }),
        section({ name: 'Funding', placement: 'BACK_MATTER', wordCount: 20 }),
      ]),
    });

    expect(summary.sectionCount).toBe(5);
    expect(summary.wordCount).toBe(890);
    expect(summary.groups).toEqual([
      {
        placement: 'FRONT_MATTER',
        label: 'Front matter',
        sectionCount: 1,
        wordCount: 120,
        sectionNames: ['Abstract'],
      },
      {
        placement: 'MAIN',
        label: 'Main',
        sectionCount: 2,
        wordCount: 700,
        sectionNames: ['Results', 'Introduction'],
      },
      {
        placement: 'BACK_MATTER',
        label: 'Back matter',
        sectionCount: 1,
        wordCount: 20,
        sectionNames: ['Funding'],
      },
      {
        placement: 'SUPPLEMENT',
        label: 'Supplement',
        sectionCount: 1,
        wordCount: 50,
        sectionNames: ['Appendix A'],
      },
    ]);
  });

  it('buckets unrecognised placements into an Other group', () => {
    const summary = buildManuscriptImportSummary({
      preparedImport: portablePrepared([
        section({ name: 'Stray', placement: 'NOWHERE' }),
      ]),
    });

    expect(summary.groups).toMatchObject([
      { placement: 'OTHER', label: 'Other' },
    ]);
  });

  it('splits assets by kind and adds inline math to equation assets', () => {
    const summary = buildManuscriptImportSummary({
      preparedImport: {
        ...portablePrepared(
          [section({ name: 'Results' })],
          [
            figure({ refKey: 'fig-1' }),
            figure({ refKey: 'fig-2' }),
            figure({ refKey: 'tab-1', assetKind: 'TABLE' }),
            figure({ refKey: 'eq-1', assetKind: 'EQUATION' }),
            figure({ refKey: 'box-1', assetKind: 'BOX' }),
          ],
        ),
        linkedAssetCount: 3,
      },
      inlineEquationCount: 2,
    });

    expect(summary).toMatchObject({
      figureCount: 2,
      tableCount: 1,
      equationAssetCount: 1,
      inlineEquationCount: 2,
      equationCount: 3,
      otherAssetCount: 1,
      assetCount: 5,
      linkedAssetCount: 3,
    });
    // Asset kinds must add up to the asset total; inline math is separate.
    expect(
      summary.figureCount +
        summary.tableCount +
        summary.equationAssetCount +
        summary.otherAssetCount,
    ).toBe(summary.assetCount);
  });

  it('explains why a title page and a references section stay out of the export', () => {
    const summary = buildManuscriptImportSummary({
      preparedImport: {
        ...portablePrepared([
          section({
            name: 'Title page',
            sectionType: 'TITLE_PAGE',
            placement: 'FRONT_MATTER',
            includeInExport: false,
          }),
          section({ name: 'Introduction', sectionType: 'INTRODUCTION' }),
          section({
            name: 'References',
            sectionType: 'REFERENCES',
            placement: 'BACK_MATTER',
          }),
        ]),
        references: [{ name: 'A cited work', citationKey: 'work2026' }],
      },
    });

    expect(summary.exclusions).toEqual([
      {
        sectionName: 'Title page',
        reason: TITLE_PAGE_EXCLUSION_REASON,
      },
      {
        sectionName: 'References',
        reason: REFERENCES_EXCLUSION_REASON,
      },
    ]);
    // Excluding from the export never removes a section from the import.
    expect(summary.sectionCount).toBe(3);
  });

  it('falls back to the source manuscript flag for other excluded sections', () => {
    const summary = buildManuscriptImportSummary({
      preparedImport: portablePrepared([
        section({
          name: 'Scratch notes',
          sectionType: 'OTHER',
          includeInExport: false,
        }),
      ]),
    });

    expect(summary.exclusions).toEqual([
      { sectionName: 'Scratch notes', reason: SOURCE_EXCLUSION_REASON },
    ]);
  });

  it('keeps a references section exportable when nothing was imported to render it from', () => {
    const summary = buildManuscriptImportSummary({
      preparedImport: portablePrepared([
        section({ name: 'References', sectionType: 'REFERENCES' }),
      ]),
    });

    expect(summary.exclusions).toEqual([]);
  });
});

describe('portable vs raw preparation branch', () => {
  const portableManifest: PortableResearchPaperManifest = {
    format: PORTABLE_MANUSCRIPT_FORMAT,
    schemaVersion: PORTABLE_MANUSCRIPT_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    metadata: { title: 'Portable paper' },
    contributors: { affiliations: [], authors: [] },
    sections: [
      {
        key: 'section-1',
        name: 'Results',
        sectionType: 'RESULTS',
        placement: 'MAIN',
        content: 'Portable result.',
        status: 'DRAFTING',
        orderIndex: 0,
        wordCount: 2,
        includeInExport: true,
      },
    ],
    figures: [],
    references: [],
    exportStyle: {},
    submissionMaterials: {},
  };

  it('marks a portable package import as portable so the summary view is used', () => {
    const document: ImportedDocument = {
      title: 'Portable paper',
      authorLine: 'Alice Example',
      sections: [
        section({
          name: 'Title page',
          sectionType: 'TITLE_PAGE',
          placement: 'FRONT_MATTER',
          includeInExport: false,
        }),
        section({
          name: 'Results',
          sectionType: 'RESULTS',
          content: 'Portable result.',
          orderIndex: 1,
          wordCount: 2,
        }),
      ],
      portablePackage: portableManifest,
    };

    const prepared = prepareManuscriptImport(document, false);

    expect(prepared.portable).toBe(true);
    const summary = buildManuscriptImportSummary({ preparedImport: prepared });
    expect(summary.sectionCount).toBe(2);
    expect(summary.exclusions).toEqual([
      { sectionName: 'Title page', reason: TITLE_PAGE_EXCLUSION_REASON },
    ]);
  });

  it('marks a raw document import as not portable so the per-section review is used', () => {
    const document: ImportedDocument = {
      authorLine: 'Alice Example',
      sections: [
        section({
          name: 'Title page',
          sectionType: 'TITLE_PAGE',
          placement: 'FRONT_MATTER',
          content: 'Alice Example',
        }),
        section({
          name: 'Introduction',
          sectionType: 'INTRODUCTION',
          content: 'Body.',
          orderIndex: 1,
          wordCount: 1,
        }),
      ],
    };

    const prepared = prepareManuscriptImport(document, false);

    expect(prepared.portable).toBe(false);
  });
});
