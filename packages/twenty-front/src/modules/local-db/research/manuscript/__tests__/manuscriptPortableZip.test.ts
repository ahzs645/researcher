import { zipSync } from 'fflate';

import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  buildPortableResearchPaperManifest,
  parsePortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_FILENAME,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';
import {
  portableManuscriptRecordUpdate,
  preparePortableResearchPaperImport,
} from '@/local-db/research/manuscript/manuscriptPortableImport';
import {
  addPortableResearchPaperFiles,
  readPortableResearchPaperZip,
} from '@/local-db/research/manuscript/manuscriptPortableZip';
import { createPortableResearchPackage } from '@/local-db/research/manuscript/manuscriptSubmissionPackage';

jest.mock('@/local-db/research/manuscript/manuscriptDocxExport', () => ({
  exportManuscriptToDocxBlob: jest.fn(),
  exportStandaloneMarkdownToDocxBlob: jest.fn(),
}));

const source: PortableManuscriptSource = {
  manuscript: {
    title: 'Portable aerosol paper',
    manuscriptType: 'JOURNAL_PAPER',
    status: 'DRAFTING',
    targetVenue: 'Example Journal',
    authorLine: 'Alice Example [1]; Bob Example [2*]',
    affiliations: '1 Lab A\n2 Lab B',
    titlePageExtraLines: ['A thesis submitted for the degree of PhD', '2026'],
    correspondingAuthor: 'Bob Example, bob@example.org',
    supplementTitle: 'Supplemental Information for Portable aerosol paper',
  },
  sections: [
    {
      id: 'introduction-id',
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'See [#absorption-plot] and [@smith2024].',
      status: 'IN_REVIEW',
      orderIndex: 0,
      level: 2,
      wordCount: 3,
      includeInExport: true,
    },
    {
      id: 'supplement-id',
      name: 'S1 Methods',
      sectionType: 'SUPPLEMENT',
      placement: 'SUPPLEMENT',
      content: 'Supplemental method.',
      status: 'DRAFTING',
      orderIndex: 1,
      wordCount: 2,
      includeInExport: true,
    },
  ],
  figures: [
    {
      id: 'figure-id',
      name: 'Absorption plot',
      refKey: 'absorption-plot',
      sourceLabel: '9',
      caption: 'Measured absorption.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      imageSource: 'UPLOAD',
      imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      altText: 'Absorption over time',
      credit: 'CC BY 4.0',
      widthPercent: 80,
      orderIndex: 0,
      sectionId: 'introduction-id',
    },
    {
      id: 'diagram-id',
      name: 'Sampling workflow',
      refKey: 'sampling-workflow',
      caption: 'How a filter becomes a number.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      imageSource: 'DIAGRAM',
      diagramSource: 'flowchart TD\n  A[Collect] --> B[Digest]',
      orderIndex: 1,
      sectionId: 'introduction-id',
    },
  ],
  references: [
    {
      id: 'reference-id',
      name: 'A referenced study',
      citationKey: 'smith2024',
      cslType: 'ARTICLE_JOURNAL',
      authors: 'Smith, Alex',
      year: 2024,
      doi: '10.1000/example',
      cslJson: '{"id":"smith2024","type":"article-journal"}',
    },
  ],
};

describe('portable research-paper ZIP', () => {
  it('creates a standalone portable download from the export bundle', async () => {
    const bundle = buildManuscriptBundle({
      manuscript: {
        id: 'paper-1',
        name: source.manuscript.title,
      },
      sections: source.sections,
      figures: source.figures,
      references: source.references,
      style: { citationMode: 'AUTHOR_DATE' },
    });
    const portablePackage = await createPortableResearchPackage(
      bundle,
      { coverLetter: 'Please consider this manuscript.' },
      source,
    );
    const packageBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(portablePackage.blob);
    });
    const restored = readPortableResearchPaperZip(
      new Uint8Array(packageBuffer),
    );

    expect(portablePackage.filename).toBe(
      'portable-aerosol-paper-portable-research.zip',
    );
    expect(portablePackage.includedFiles).toEqual([
      'portable-assets/absorption-plot.png',
      'research-paper.json',
    ]);
    expect(restored.metadata.title).toBe('Portable aerosol paper');
    expect(restored.exportStyle.citationMode).toBe('AUTHOR_DATE');
  });

  it('round-trips structure, links, contributors, assets, and export settings', () => {
    const files: Record<string, Uint8Array> = {};
    addPortableResearchPaperFiles(
      files,
      source,
      {
        name: 'Scientific co-author review',
        citationMode: 'AUTHOR_DATE',
        sectionNumbering: true,
        affiliationNumberStyle: 'SUPERSCRIPT',
      },
      {
        coverLetter: 'Please consider this manuscript.',
        competingInterests: 'The authors declare no competing interests.',
      },
    );

    expect(files[PORTABLE_MANUSCRIPT_FILENAME]).toBeDefined();
    expect(files['portable-assets/absorption-plot.png']).toBeDefined();

    const restored = readPortableResearchPaperZip(zipSync(files));

    expect(restored.metadata.title).toBe('Portable aerosol paper');
    expect(restored.metadata.titlePageExtraLines).toEqual([
      'A thesis submitted for the degree of PhD',
      '2026',
    ]);
    expect(restored.contributors.authors[1]).toMatchObject({
      name: 'Bob Example',
      affiliationKeys: ['affiliation-2'],
      corresponding: true,
    });
    expect(restored.sections[0].content).toContain('[#absorption-plot]');
    expect(restored.sections[0].content).toContain('[@smith2024]');
    expect(restored.sections[0].level).toBe(2);
    expect(restored.figures[0]).toMatchObject({
      refKey: 'absorption-plot',
      sourceLabel: '9',
      sectionKey: 'section-1',
      altText: 'Absorption over time',
      widthPercent: 80,
    });
    expect(restored.figures[0].imageUrl).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
    expect(restored.references[0].citationKey).toBe('smith2024');
    expect(restored.exportStyle).toMatchObject({
      citationMode: 'AUTHOR_DATE',
      sectionNumbering: true,
      affiliationNumberStyle: 'SUPERSCRIPT',
    });
    expect(restored.submissionMaterials.coverLetter).toBe(
      'Please consider this manuscript.',
    );

    const prepared = preparePortableResearchPaperImport(
      restored,
      restored.sections,
    );
    expect(prepared.figures[0]).toMatchObject({
      refKey: 'absorption-plot',
      sourceLabel: '9',
      sectionOrderIndex: 0,
      imageSource: 'UPLOAD',
    });
    expect(prepared.references[0].citationKey).toBe('smith2024');
    expect(portableManuscriptRecordUpdate(restored)).toMatchObject({
      name: 'Portable aerosol paper',
      targetVenue: 'Example Journal',
      titlePageExtraLines: JSON.stringify([
        'A thesis submitted for the degree of PhD',
        '2026',
      ]),
      coverLetter: 'Please consider this manuscript.',
    });
  });

  it('round-trips a Mermaid diagram figure', () => {
    const manifest = buildPortableResearchPaperManifest(source, {}, {});
    const diagram = manifest.figures.find(
      (figure) => figure.refKey === 'sampling-workflow',
    );

    expect(diagram?.diagramSource).toBe(
      'flowchart TD\n  A[Collect] --> B[Digest]',
    );

    const prepared = preparePortableResearchPaperImport(manifest, []);
    const importedDiagram = prepared.figures.find(
      (figure) => figure.refKey === 'sampling-workflow',
    );

    expect(importedDiagram?.diagramSource).toBe(
      'flowchart TD\n  A[Collect] --> B[Digest]',
    );
    // The importer recognises it as a diagram rather than an image-less figure.
    expect(importedDiagram?.imageSource).toBe('DIAGRAM');
  });

  it('rejects a ZIP without the versioned research-paper manifest', () => {
    expect(() =>
      readPortableResearchPaperZip(zipSync({ 'notes.txt': new Uint8Array() })),
    ).toThrow(`ZIP does not contain ${PORTABLE_MANUSCRIPT_FILENAME}`);
  });

  it('keeps existing style overrides when the package carries no style', () => {
    const manifest = buildPortableResearchPaperManifest(source, {}, {});
    const update = portableManuscriptRecordUpdate(
      parsePortableResearchPaperManifest(JSON.stringify(manifest)),
    );

    expect(manifest.exportStyle).toEqual({});
    expect(update).not.toHaveProperty('exportStyleOverrides');

    const styled = portableManuscriptRecordUpdate(
      parsePortableResearchPaperManifest(
        JSON.stringify(
          buildPortableResearchPaperManifest(
            source,
            { citationMode: 'AUTHOR_DATE' },
            {},
          ),
        ),
      ),
    );
    expect(styled.exportStyleOverrides).toBeDefined();
  });

  it('defaults legacy section levels without changing explicit placements', () => {
    const manifest = buildPortableResearchPaperManifest(source, {}, {});
    const legacySections = manifest.sections.map(
      ({ level: _level, ...section }) => section,
    );
    const restored = parsePortableResearchPaperManifest(
      JSON.stringify({ ...manifest, sections: legacySections }),
    );

    expect(restored.sections[0]).toMatchObject({
      level: 1,
      placement: 'MAIN',
    });
    expect(restored.sections[1]).toMatchObject({
      level: 1,
      placement: 'SUPPLEMENT',
    });
  });
});
