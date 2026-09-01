import { strFromU8, unzipSync } from 'fflate';

import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { createSubmissionPackage } from '@/local-db/research/manuscript/manuscriptSubmissionPackage';

jest.mock('@/local-db/research/manuscript/manuscriptDocxExport', () => ({
  exportManuscriptToDocxBlob: jest.fn(
    async () => new Blob(['manuscript'], { type: 'application/docx' }),
  ),
  exportStandaloneMarkdownToDocxBlob: jest.fn(
    async (title: string) => new Blob([title], { type: 'application/docx' }),
  ),
}));

const bundle = () =>
  buildManuscriptBundle({
    manuscript: {
      id: 'paper-1',
      name: 'Reusable air-quality paper',
      authorLine: 'A. Researcher',
      affiliations: '1 Example University',
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
    ],
    figures: [],
    references: [],
    style: { id: 'journal-id', name: 'Test journal' },
  });

// jsdom's Blob has no arrayBuffer(), so the package is read back the way the
// other package tests read it.
const unzipPackageBlob = async (blob: Blob) => {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  return unzipSync(new Uint8Array(buffer));
};

describe('createSubmissionPackage with a response to reviewers', () => {
  it('ships the response document and types it in the MECA manifest', async () => {
    const result = await createSubmissionPackage(bundle(), {
      responseToReviewers: '**Comment 1**\n\n> Shorten the introduction.',
    });

    expect(result.includedFiles).toContain('response-to-reviewers.docx');
    const files = await unzipPackageBlob(result.blob);
    expect(strFromU8(files['response-to-reviewers.docx'])).toBe(
      'Response to reviewers',
    );
    expect(strFromU8(files['manifest.xml'])).toContain(
      'type="response-to-reviewer">\n   <instance href="response-to-reviewers.docx"',
    );
  });

  it('ships no response document for a manuscript that has none', async () => {
    const result = await createSubmissionPackage(bundle(), {});

    expect(result.includedFiles).not.toContain('response-to-reviewers.docx');
  });
});
