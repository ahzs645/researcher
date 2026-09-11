import { strFromU8, unzipSync } from 'fflate';
import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  createCiteprocEngine,
  formatCslCitations,
  formatCslBibliography,
} from '@/local-db/research/manuscript/manuscriptCiteproc';
import { exportManuscriptToDocxBlob } from '@/local-db/research/manuscript/manuscriptDocxExport';
import { parsePortableResearchPaperManifest } from '@/local-db/research/manuscript/manuscriptPortableManifest';
import {
  createSubmissionPackage,
  createPortableResearchPackage,
} from '@/local-db/research/manuscript/manuscriptSubmissionPackage';
import type * as ManuscriptCiteprocModule from '@/local-db/research/manuscript/manuscriptCiteproc';
import { citationProvenanceInput } from './fixtures/citationProvenanceInput';

jest.mock('@/local-db/research/manuscript/manuscriptDocxExport', () => ({
  exportManuscriptToDocxBlob: jest.fn(async () => new Blob(['document'])),
  exportStandaloneMarkdownToDocxBlob: jest.fn(
    async () => new Blob(['companion']),
  ),
}));
jest.mock('@/local-db/research/manuscript/manuscriptCiteproc', () => ({
  ...jest.requireActual<typeof ManuscriptCiteprocModule>(
    '@/local-db/research/manuscript/manuscriptCiteproc',
  ),
  createCiteprocEngine: jest.fn(),
  formatCslCitations: jest.fn(),
  formatCslBibliography: jest.fn(),
}));
const portableSource = () => {
  const input = citationProvenanceInput();
  return {
    ...input,
    manuscript: { title: 'Citation outcome fixture', authorLine: 'A. Author' },
  };
};
const readZip = async (blob: Blob) => {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return unzipSync(new Uint8Array(buffer));
};

describe('submission citation formatting gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['not-vendored', 'apa-null', 'apa-error'])(
    'blocks %s before document rendering',
    async (failure) => {
      jest.mocked(createCiteprocEngine).mockImplementation(async () => {
        if (failure === 'apa-error') throw new Error('CSL XML failed');
        return null;
      });
      const bundle = buildManuscriptBundle(
        citationProvenanceInput(failure === 'not-vendored' ? failure : 'apa'),
      );
      await expect(createSubmissionPackage(bundle, {})).rejects.toThrow(
        /Submission package blocked.*Citation formatting/,
      );
      expect(exportManuscriptToDocxBlob).not.toHaveBeenCalled();
    },
  );

  it('retains the engine error reason in the package rejection', async () => {
    jest
      .mocked(createCiteprocEngine)
      .mockRejectedValue(new Error('specific load failure'));
    await expect(
      createSubmissionPackage(
        buildManuscriptBundle(citationProvenanceInput('apa')),
        {},
      ),
    ).rejects.toThrow('specific load failure');
  });

  it('allows deliberately generic formatting and serializes the outcome in both manifests', async () => {
    const result = await createSubmissionPackage(
      buildManuscriptBundle(citationProvenanceInput()),
      {},
      portableSource(),
    );
    const files = await readZip(result.blob);
    const metadata = JSON.parse(strFromU8(files['metadata.json']));
    const portable = JSON.parse(strFromU8(files['research-paper.json']));
    expect(result.readiness.ready).toBe(true);
    expect(result.citationProvenance.engineOutcome).toBe('not-requested');
    expect(metadata.citationProvenance).toEqual(result.citationProvenance);
    expect(portable.citationProvenance).toEqual(result.citationProvenance);
    expect(createCiteprocEngine).not.toHaveBeenCalled();
    const legacy = { ...portable };
    delete legacy.citationProvenance;
    expect(
      parsePortableResearchPaperManifest(JSON.stringify(legacy)),
    ).not.toBeNull();
    expect(
      parsePortableResearchPaperManifest(JSON.stringify(portable))
        ?.citationProvenance,
    ).toEqual(result.citationProvenance);
  });

  it('allows a portable backup of a failed request, without weakening submission readiness', async () => {
    const bundle = buildManuscriptBundle(
      citationProvenanceInput('not-vendored'),
    );
    const result = await createPortableResearchPackage(
      bundle,
      {},
      portableSource(),
    );
    const files = await readZip(result.blob);
    const portable = JSON.parse(strFromU8(files['research-paper.json']));
    expect(portable.citationProvenance.engineOutcome).toBe(
      'style-not-vendored',
    );
    expect(portable.exportStyle.citationStyleId).toBe('not-vendored');
    expect(portable.sections[0].content).toContain('[@li2017, p. 42]');
    await expect(createSubmissionPackage(bundle, {})).rejects.toThrow(
      'Submission package blocked',
    );
  });

  it('uses the successful prepared bundle for package readiness and every rendered member', async () => {
    const engine = {} as NonNullable<
      Awaited<ReturnType<typeof createCiteprocEngine>>
    >;
    jest.mocked(createCiteprocEngine).mockResolvedValue(engine);
    jest.mocked(formatCslCitations).mockReturnValue(['CSL-OK']);
    jest.mocked(formatCslBibliography).mockReturnValue([]);
    const result = await createSubmissionPackage(
      buildManuscriptBundle(citationProvenanceInput('apa')),
      {},
    );
    const files = await readZip(result.blob);
    const rendered = jest.mocked(exportManuscriptToDocxBlob).mock.calls[0][0];
    expect(rendered.citationProvenance).toEqual({
      requestedStyleId: 'apa',
      appliedStyleId: 'apa',
      engineOutcome: 'applied',
    });
    expect(rendered.fullMarkdown).toContain('CSL-OK');
    expect(strFromU8(files['citation-outcome-fixture.jats.xml'])).toContain(
      'CSL-OK',
    );
    expect(
      JSON.parse(strFromU8(files['metadata.json'])).citationProvenance,
    ).toEqual(rendered.citationProvenance);
    expect(createCiteprocEngine).toHaveBeenCalledTimes(1);
  });

  it('keeps other hard errors enforced for generic templates too', async () => {
    const input = citationProvenanceInput();
    input.manuscript.authorLine = '';
    await expect(
      createSubmissionPackage(buildManuscriptBundle(input), {}),
    ).rejects.toThrow('Authors');
    expect(exportManuscriptToDocxBlob).not.toHaveBeenCalled();
  });
});
