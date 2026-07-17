import { strFromU8, unzipSync } from 'fflate';

import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { createSubmissionPackage } from '@/local-db/research/manuscript/manuscriptSubmissionPackage';

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
        'metadata.json',
        'references.json',
        'research-paper.json',
        'submission-readiness.txt',
      ]),
    );
    expect(strFromU8(packageFiles['metadata.json'])).toContain(
      'Reusable air-quality paper',
    );

    expect(
      result.includedFiles.some((filename) =>
        filename.endsWith('-manuscript.docx'),
      ),
    ).toBe(true);
  });
});
