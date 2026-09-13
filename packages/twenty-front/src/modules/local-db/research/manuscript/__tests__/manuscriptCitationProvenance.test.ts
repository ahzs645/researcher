import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  createCiteprocEngine,
  formatCslBibliography,
  formatCslCitations,
} from '@/local-db/research/manuscript/manuscriptCiteproc';
import { wrapCitationAnchor } from '@/local-db/research/manuscript/manuscriptCitations';
import { citationFormattingErrorMessage } from '@/local-db/research/manuscript/manuscriptCitationProvenance';
import { prepareManuscriptBundleWithCsl } from '@/local-db/research/manuscript/manuscriptCslIntegration';
import { withCitationFormattingReport } from '@/local-db/research/manuscript/manuscriptExportProvenance';
import { validateSubmission } from '@/local-db/research/manuscript/manuscriptSubmission';
import type * as ManuscriptCiteprocModule from '@/local-db/research/manuscript/manuscriptCiteproc';
import { citationProvenanceInput } from './fixtures/citationProvenanceInput';

jest.mock('@/local-db/research/manuscript/manuscriptCiteproc', () => ({
  ...jest.requireActual<typeof ManuscriptCiteprocModule>(
    '@/local-db/research/manuscript/manuscriptCiteproc',
  ),
  createCiteprocEngine: jest.fn(),
  formatCslCitations: jest.fn(),
  formatCslBibliography: jest.fn(),
}));

const engine = {} as NonNullable<
  Awaited<ReturnType<typeof createCiteprocEngine>>
>;
const citationCheck = (bundle: ReturnType<typeof buildManuscriptBundle>) =>
  validateSubmission(bundle, {}).checks.find(
    (check) => check.id === 'citation-style',
  );

describe('citation formatting provenance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(createCiteprocEngine).mockResolvedValue(engine);
    jest
      .mocked(formatCslCitations)
      .mockImplementation((_engine, clusters) =>
        clusters.map(() => '(CSL result)'),
      );
    jest.mocked(formatCslBibliography).mockReturnValue([]);
  });

  it.each([undefined, null, '', '   '])(
    'treats %s as deliberate generic formatting',
    async (styleId) => {
      const prepared = await prepareManuscriptBundleWithCsl(
        buildManuscriptBundle(citationProvenanceInput(styleId)),
      );
      expect(prepared.citationProvenance).toEqual({
        requestedStyleId: null,
        appliedStyleId: 'built-in',
        engineOutcome: 'not-requested',
      });
      expect(createCiteprocEngine).not.toHaveBeenCalled();
      expect(citationCheck(prepared)).toMatchObject({ severity: 'READY' });
      expect(validateSubmission(prepared, {}).ready).toBe(true);
      expect(prepared.fullMarkdown).toContain('[1, p. 42]');
    },
  );

  it('does not label an unprepared requested style as applied', () => {
    const bundle = buildManuscriptBundle(citationProvenanceInput('apa'));
    expect(bundle.citationProvenance.engineOutcome).toBe('not-prepared');
    expect(citationCheck(bundle)).toMatchObject({ severity: 'ERROR' });
  });

  it('reports a nonempty unsupported request instead of calling it generic by configuration', async () => {
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(citationProvenanceInput('not-vendored')),
    );
    expect(prepared.citationProvenance).toEqual({
      requestedStyleId: 'not-vendored',
      appliedStyleId: 'built-in',
      engineOutcome: 'style-not-vendored',
    });
    expect(createCiteprocEngine).not.toHaveBeenCalled();
    expect(citationCheck(prepared)).toMatchObject({ severity: 'ERROR' });
    expect(validateSubmission(prepared, {}).ready).toBe(false);
  });

  it('records an unavailable engine and retains requested HTML anchors', async () => {
    jest.mocked(createCiteprocEngine).mockResolvedValue(null);
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(citationProvenanceInput('apa')),
      { citationAnchors: true },
    );
    expect(prepared.citationProvenance).toEqual({
      requestedStyleId: 'apa',
      appliedStyleId: 'built-in',
      engineOutcome: 'engine-unavailable',
    });
    expect(prepared.fullMarkdown).toContain(
      wrapCitationAnchor(['li2017'], '[1, p. 42]'),
    );
    expect(citationCheck(prepared)).toMatchObject({ severity: 'ERROR' });
  });

  it.each(['engine', 'citations', 'bibliography'])(
    'captures a failure during %s rather than certifying partial formatting',
    async (stage) => {
      const failure = new Error(`${stage} failed`);
      if (stage === 'engine')
        jest.mocked(createCiteprocEngine).mockRejectedValue(failure);
      if (stage === 'citations')
        jest.mocked(formatCslCitations).mockImplementation(() => {
          throw failure;
        });
      if (stage === 'bibliography')
        jest.mocked(formatCslBibliography).mockImplementation(() => {
          throw failure;
        });
      const prepared = await prepareManuscriptBundleWithCsl(
        buildManuscriptBundle(citationProvenanceInput('apa')),
      );
      expect(prepared.citationProvenance).toEqual({
        requestedStyleId: 'apa',
        appliedStyleId: 'built-in',
        engineOutcome: 'engine-error',
        errorMessage: `${stage} failed`,
      });
      expect(prepared.fullMarkdown).toContain('[1, p. 42]');
      expect(prepared.fullMarkdown).not.toContain('(CSL result)');
      expect(citationCheck(prepared)).toMatchObject({ severity: 'ERROR' });
    },
  );

  it('preserves a non-Error thrown reason', async () => {
    jest.mocked(createCiteprocEngine).mockRejectedValue('asset load failed');
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(citationProvenanceInput('apa')),
    );
    expect(prepared.citationProvenance).toMatchObject({
      engineOutcome: 'engine-error',
      errorMessage: 'asset load failed',
    });
    expect(
      citationFormattingErrorMessage({ reason: 'XML unavailable' }),
    ).toContain('XML unavailable');
  });

  it('reports normalized requested == applied only after successful formatting', async () => {
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(citationProvenanceInput('  apa  ')),
    );
    expect(createCiteprocEngine).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: 'apa' }),
    );
    expect(prepared.citationProvenance).toEqual({
      requestedStyleId: 'apa',
      appliedStyleId: 'apa',
      engineOutcome: 'applied',
    });
    expect(prepared.fullMarkdown).toContain('(CSL result)');
    expect(validateSubmission(prepared, {}).ready).toBe(true);
  });

  it('includes captions and table grids in the CSL pass and ignores code tokens', async () => {
    const input = citationProvenanceInput('apa');
    input.sections[0].content = 'Literal `[@phantom]`.';
    input.figures = [
      {
        id: 'table',
        assetKind: 'TABLE',
        caption: 'Caption [see @li2017].',
        tableData: '| Source |\n| --- |\n| [@li2017, p. 42] |',
      },
    ];
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(input),
    );
    const clusters = jest.mocked(formatCslCitations).mock.calls[0][1];
    expect(clusters).toHaveLength(2);
    expect(JSON.stringify(clusters)).not.toContain('phantom');
    expect(prepared.fullMarkdown).toContain('Caption (CSL result)');
    expect(prepared.fullMarkdown).toContain('| (CSL result) |');
  });

  it('reuses the checked result through an anchor rebuild rather than rerunning a failing engine', async () => {
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(citationProvenanceInput('apa')),
    );
    jest
      .mocked(createCiteprocEngine)
      .mockRejectedValue(new Error('second attempt fails'));
    expect(await prepareManuscriptBundleWithCsl(prepared)).toBe(prepared);
    const anchored = await prepareManuscriptBundleWithCsl(prepared, {
      citationAnchors: true,
    });
    expect(anchored.citationProvenance).toEqual(prepared.citationProvenance);
    expect(anchored.fullMarkdown).toContain(
      wrapCitationAnchor(['li2017'], '(CSL result)'),
    );
    expect(createCiteprocEngine).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed result until an explicit fresh-input retry', async () => {
    jest.mocked(createCiteprocEngine).mockResolvedValueOnce(null);
    const source = buildManuscriptBundle(citationProvenanceInput('apa'));
    const failed = await prepareManuscriptBundleWithCsl(source);
    expect(await prepareManuscriptBundleWithCsl(failed)).toBe(failed);
    expect(
      (
        await prepareManuscriptBundleWithCsl(
          buildManuscriptBundle(source.sourceInput),
        )
      ).citationProvenance.engineOutcome,
    ).toBe('applied');
    expect(createCiteprocEngine).toHaveBeenCalledTimes(2);
  });

  it('does not trust old success for a different selected style', async () => {
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(citationProvenanceInput('apa')),
    );
    const changed = {
      ...prepared,
      style: { ...prepared.style, citationStyleId: 'not-vendored' },
    };
    expect(citationCheck(changed)).toMatchObject({ severity: 'ERROR' });
    expect(
      (await prepareManuscriptBundleWithCsl(changed)).citationProvenance
        .engineOutcome,
    ).toBe('style-not-vendored');
  });

  it('ships requested, applied, reason and an explicit warning with a draft', async () => {
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(citationProvenanceInput('not-vendored')),
    );
    const files = withCitationFormattingReport(prepared, [
      {
        filename: 'draft.docx',
        mimeType: 'application/docx',
        content: 'unchanged bytes',
      },
    ]);
    expect(files[0].content).toBe('unchanged bytes');
    expect(
      files.every(
        (file) => file.citationProvenance === prepared.citationProvenance,
      ),
    ).toBe(true);
    const report = JSON.parse(String(files[1].content));
    expect(report).toMatchObject({
      requestedStyleId: 'not-vendored',
      appliedStyleId: 'built-in',
      engineOutcome: 'style-not-vendored',
    });
    expect(report.warnings.join(' ')).toContain(
      'submission package is blocked',
    );
  });

  it('does not add a failure warning to an intentionally generic draft', async () => {
    const prepared = await prepareManuscriptBundleWithCsl(
      buildManuscriptBundle(citationProvenanceInput()),
    );
    const [report] = withCitationFormattingReport(prepared, []);
    expect(JSON.parse(String(report.content)).warnings).toEqual(
      prepared.warnings,
    );
  });
});
