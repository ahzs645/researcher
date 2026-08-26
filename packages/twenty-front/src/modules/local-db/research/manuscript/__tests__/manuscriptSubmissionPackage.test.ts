import { strFromU8, unzipSync } from 'fflate';

import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  createSubmissionPackage,
  manuscriptSubmissionFigures,
} from '@/local-db/research/manuscript/manuscriptSubmissionPackage';

jest.mock('@/local-db/research/manuscript/manuscriptDocxExport', () => ({
  exportManuscriptToDocxBlob: jest.fn(
    async () => new Blob(['manuscript'], { type: 'application/docx' }),
  ),
  exportStandaloneMarkdownToDocxBlob: jest.fn(
    async () => new Blob(['companion'], { type: 'application/docx' }),
  ),
}));

describe('createSubmissionPackage', () => {
  it('creates an editable journal package with companion files', async () => {
    const bundle = buildManuscriptBundle({
      manuscript: {
        id: 'paper-1',
        name: 'Reusable air-quality paper',
        authorLine: 'A. Researcher; B. Scientist',
        affiliations: '1 Example University',
        correspondingAuthor: 'A. Researcher, a@example.edu',
      },
      sections: [
        {
          id: 'abstract',
          name: 'Abstract',
          sectionType: 'ABSTRACT',
          placement: 'FRONT_MATTER',
          content: 'A concise abstract for package verification.',
          includeInExport: true,
        },
        {
          id: 'methods',
          name: 'Methods',
          sectionType: 'METHODS',
          placement: 'MAIN',
          content: 'We used a reproducible method.',
          includeInExport: true,
        },
      ],
      figures: [],
      references: [],
      style: {
        id: 'test-journal-id',
        name: 'Test journal',
        profileKey: 'test-journal',
        lineNumbering: true,
        pageNumbering: true,
        twoColumn: true,
        sectionNumbering: true,
        requiredArtifacts: ['COVER_LETTER'],
      },
    });

    const result = await createSubmissionPackage(
      bundle,
      {
        coverLetter: 'Please consider this manuscript.',
        submissionExtras: JSON.stringify({
          'test-journal': {
            FUNDING: 'Funded by Example Council.',
            EMPTY_FIELD: '   ',
          },
        }),
      },
      {
        manuscript: {
          title: 'Reusable air-quality paper',
          authorLine: 'A. Researcher; B. Scientist',
          affiliations: '1 Example University',
        },
        sections: [
          {
            id: 'methods',
            name: 'Methods',
            sectionType: 'METHODS',
            placement: 'MAIN',
            content: 'We used a reproducible method.',
            includeInExport: true,
          },
        ],
        figures: [],
        references: [],
      },
    );
    const packageBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(result.blob);
    });
    const packageFiles = unzipSync(new Uint8Array(packageBuffer));

    expect(result.includedFiles).toEqual(
      expect.arrayContaining([
        'cover-letter.docx',
        'manifest.xml',
        'metadata.json',
        'references.json',
        'research-paper.json',
        'submission-readiness.txt',
        'submission-extras/FUNDING.txt',
      ]),
    );
    expect(strFromU8(packageFiles['metadata.json'])).toContain(
      'Reusable air-quality paper',
    );
    expect(strFromU8(packageFiles['submission-extras/FUNDING.txt'])).toBe(
      'Funded by Example Council.',
    );
    expect(strFromU8(packageFiles['submission-readiness.txt'])).toContain(
      'submission-extras/FUNDING.txt',
    );

    // The JATS article and the MECA manifest are well-formed XML, and the
    // manifest types the manuscript, JATS, extras and metadata correctly.
    const jatsFilename = result.includedFiles.find((filename) =>
      filename.endsWith('.jats.xml'),
    );
    expect(jatsFilename).toBeDefined();
    const manifest = strFromU8(packageFiles['manifest.xml']);
    for (const xml of [manifest, strFromU8(packageFiles[jatsFilename!])]) {
      expect(
        new DOMParser()
          .parseFromString(xml, 'text/xml')
          .querySelector('parsererror'),
      ).toBeNull();
    }
    expect(manifest).toContain('type="manuscript"');
    expect(manifest).toContain('type="cover-letter"');
    expect(manifest).toContain('href="submission-extras/FUNDING.txt"');

    expect(
      result.includedFiles.some((filename) =>
        filename.endsWith('-manuscript.docx'),
      ),
    ).toBe(true);
  });
});

describe('figures in a submission package', () => {
  const figuresFor = (figures: unknown[]) =>
    manuscriptSubmissionFigures(
      buildManuscriptBundle({
        manuscript: { id: 'p', name: 'Diagram paper' },
        sections: [
          {
            id: 'methods',
            name: 'Methods',
            sectionType: 'METHODS',
            placement: 'MAIN',
            content: 'Method text.',
            includeInExport: true,
          },
        ],
        figures: figures as never,
        references: [],
        style: { name: 'Test journal' },
      }),
    );

  it('ships an uploaded figure as a real file', () => {
    const { files, linked } = figuresFor([
      {
        id: 'f1',
        refKey: 'plot',
        name: 'Plot',
        caption: 'A plot.',
        assetKind: 'FIGURE',
        placement: 'MAIN',
        imageSource: 'UPLOAD',
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);

    expect(Object.keys(files)).toEqual(['figures/Figure-1.png']);
    expect(linked).toEqual([]);
  });

  // Off-browser Mermaid cannot draw, so the figure has no pixels to ship —
  // but it must not vanish from the package without a word.
  it('records a diagram it could not draw instead of dropping it', () => {
    const { files, linked } = figuresFor([
      {
        id: 'f2',
        refKey: 'workflow',
        name: 'Workflow',
        caption: 'Sampling workflow.',
        assetKind: 'FIGURE',
        placement: 'MAIN',
        imageSource: 'DIAGRAM',
        diagramSource: 'flowchart TD\\n  A --> B',
      },
    ]);

    expect(files).toEqual({});
    expect(linked).toEqual([
      'Figure 1: Mermaid diagram, not rendered — source in the portable package',
    ]);
  });

  it('ships a drawn diagram as a file like any other figure', () => {
    const { files } = figuresFor([
      {
        id: 'f3',
        refKey: 'workflow',
        name: 'Workflow',
        caption: 'Sampling workflow.',
        assetKind: 'FIGURE',
        placement: 'MAIN',
        imageSource: 'DIAGRAM',
        diagramSource: 'flowchart TD\\n  A --> B',
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);

    expect(Object.keys(files)).toEqual(['figures/Figure-1.png']);
  });
});
// Screening produced rows on a tab and nothing else; the package is where it
// becomes something a coauthor or an editor can be handed.
describe('screening in a submission package', () => {
  const SECTIONS = [
    {
      id: 'abstract',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      content: 'A concise abstract for screening verification.',
      includeInExport: true,
    },
    {
      id: 'availability',
      name: 'Data availability',
      sectionType: 'DATA_AVAILABILITY',
      placement: 'BACK_MATTER',
      content:
        'All data are deposited in Zenodo at https://doi.org/10.5281/zenodo.1234567.',
      includeInExport: true,
    },
  ];

  const screenedBundle = () =>
    buildManuscriptBundle({
      manuscript: {
        id: 'paper-2',
        name: 'A screened manuscript',
        authorLine: 'A. Researcher',
      },
      sections: SECTIONS,
      figures: [],
      references: [],
      style: { name: 'Test journal' },
    });

  const unzipPackageBlob = async (blob: Blob) => {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    return unzipSync(new Uint8Array(buffer));
  };

  it('ships a screening report and says the same thing the panel said', async () => {
    const result = await createSubmissionPackage(
      screenedBundle(),
      { competingInterests: 'The authors declare no competing interests.' },
      {
        manuscript: { title: 'A screened manuscript' },
        sections: SECTIONS,
        figures: [],
        references: [],
      },
      [
        {
          id: 'retraction-scan-not-run',
          label: 'Retraction check',
          detail:
            '3 reference(s) with a DOI have not been checked against Crossref',
          severity: 'WARNING',
          target: 'references',
        },
      ],
    );
    const packageFiles = await unzipPackageBlob(result.blob);
    const report = strFromU8(packageFiles['screening-report.txt']);
    const manifest = strFromU8(packageFiles['submission-readiness.txt']);

    expect(result.includedFiles).toContain('screening-report.txt');
    expect(report).toContain('A screened manuscript');
    expect(report).toContain('[PRESENT] Open data statement');
    expect(report).toContain('[ABSENT] Open code statement');
    expect(report).toContain('Does the paper say where the analysis code is?');
    expect(report).toContain('zenodo.1234567');

    // The manifest carries both the screening line and the check the caller
    // computed for the panel, so the ZIP and the screen agree.
    expect(manifest).toContain('Automated screening');
    expect(manifest).toContain('Open code statement');
    expect(manifest).toContain('[WARNING] Retraction check');
    expect(
      result.readiness.checks.find(
        (check) => check.id === 'automated-screening',
      )?.severity,
    ).toBe('WARNING');
    // Screening reports; it never blocks.
    expect(result.readiness.errorCount).toBe(0);
  });

  it('screens nothing when there is no manuscript source to screen', async () => {
    const result = await createSubmissionPackage(screenedBundle(), {});

    expect(result.includedFiles).not.toContain('screening-report.txt');
    expect(
      result.readiness.checks.some(
        (check) => check.id === 'automated-screening',
      ),
    ).toBe(false);
  });
});
