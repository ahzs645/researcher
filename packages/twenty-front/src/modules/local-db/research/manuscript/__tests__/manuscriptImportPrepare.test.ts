import {
  PORTABLE_MANUSCRIPT_FORMAT,
  PORTABLE_MANUSCRIPT_VERSION,
  type PortableResearchPaperManifest,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';
import {
  type ImportedDocument,
  type ImportedSectionDraft,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';

const section = (
  sectionType: string,
  name: string,
  content: string,
  orderIndex: number,
): ImportedSectionDraft => ({
  name,
  sectionType,
  placement:
    sectionType === 'TITLE_PAGE'
      ? 'FRONT_MATTER'
      : sectionType === 'REFERENCES'
        ? 'BACK_MATTER'
        : 'MAIN',
  content,
  orderIndex,
  wordCount: content.split(/\s+/).filter(Boolean).length,
  includeInExport: true,
});

describe('prepareManuscriptImport', () => {
  it('demotes an imported title page when author metadata was extracted', () => {
    const document: ImportedDocument = {
      authorLine: 'Alice Example; Bob Example',
      sections: [
        section(
          'TITLE_PAGE',
          'Title page',
          'Alice Example; Bob Example\nExample Institute',
          0,
        ),
        section('INTRODUCTION', 'Introduction', 'Body.', 1),
      ],
    };

    const prepared = prepareManuscriptImport(document, false);

    expect(prepared.sections[0]).toMatchObject({
      sectionType: 'TITLE_PAGE',
      includeInExport: false,
    });
    expect(prepared.sections[1].includeInExport).toBe(true);
  });

  it('demotes journal-instructions references with no parsed references', () => {
    const document: ImportedDocument = {
      sections: [
        section('INTRODUCTION', 'Introduction', 'Body.', 0),
        section(
          'REFERENCES',
          'References — see the journal submission instructions',
          '',
          1,
        ),
      ],
    };

    const prepared = prepareManuscriptImport(document, true);

    expect(prepared.references).toHaveLength(0);
    expect(prepared.sections[1]).toMatchObject({
      sectionType: 'REFERENCES',
      includeInExport: false,
    });
  });

  it('passes portable sections and records through the portable preparation path', () => {
    const portablePackage: PortableResearchPaperManifest = {
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
      figures: [
        {
          key: 'figure-1',
          name: 'Portable figure',
          refKey: 'portable-figure',
          caption: 'Portable caption.',
          assetKind: 'FIGURE',
          placement: 'MAIN',
          imageSource: 'NONE',
          orderIndex: 0,
          sectionKey: 'section-1',
        },
      ],
      references: [
        {
          key: 'reference-1',
          name: 'Portable reference',
          citationKey: 'portable2026',
          cslType: 'ARTICLE_JOURNAL',
        },
      ],
      exportStyle: {},
      submissionMaterials: {},
    };
    const sections = [section('RESULTS', 'Edited results', 'Edited.', 0)];
    const document: ImportedDocument = {
      title: 'Portable paper',
      sections,
      portablePackage,
    };

    const prepared = prepareManuscriptImport(document, false);

    expect(prepared).toMatchObject({
      portable: true,
      sections,
      references: [{ citationKey: 'portable2026' }],
      figures: [
        {
          refKey: 'portable-figure',
          sectionOrderIndex: 0,
        },
      ],
    });
  });
});
