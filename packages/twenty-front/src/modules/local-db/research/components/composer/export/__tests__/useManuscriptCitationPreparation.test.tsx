import { act, renderHook, waitFor } from '@testing-library/react';
import * as assembly from '@/local-db/research/manuscript/manuscriptAssembly';
import { prepareManuscriptBundleWithCsl } from '@/local-db/research/manuscript/manuscriptCslIntegration';
import { citationProvenanceInput } from '@/local-db/research/manuscript/__tests__/fixtures/citationProvenanceInput';
import { useManuscriptCitationPreparation } from '@/local-db/research/components/composer/export/useManuscriptCitationPreparation';

jest.mock('@/local-db/research/manuscript/manuscriptAssembly', () => {
  const actual = jest.requireActual<typeof assembly>(
    '@/local-db/research/manuscript/manuscriptAssembly',
  );
  return {
    ...actual,
    buildManuscriptBundle: jest.fn(actual.buildManuscriptBundle),
  };
});
jest.mock('@/local-db/research/manuscript/manuscriptCslIntegration', () => ({
  prepareManuscriptBundleWithCsl: jest.fn(),
}));
const deferredBundle = () => {
  let resolve!: (bundle: assembly.ManuscriptBundle) => void;
  const promise = new Promise<assembly.ManuscriptBundle>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};
const applied = (
  source: assembly.ManuscriptBundle,
): assembly.ManuscriptBundle => ({
  ...source,
  citationProvenance: {
    requestedStyleId: source.style.citationStyleId!,
    appliedStyleId: source.style.citationStyleId!,
    engineOutcome: 'applied',
  },
});

describe('citation preparation bound to the selected input', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prepareManuscriptBundleWithCsl).mockReset();
    const actual = jest.requireActual<typeof assembly>(
      '@/local-db/research/manuscript/manuscriptAssembly',
    );
    jest
      .mocked(assembly.buildManuscriptBundle)
      .mockImplementation(actual.buildManuscriptBundle);
  });

  it('does not enable a newly selected journal using an older asynchronous result', async () => {
    const oldRequest = deferredBundle();
    const newRequest = deferredBundle();
    const oldSource = assembly.buildManuscriptBundle(
      citationProvenanceInput('apa'),
    );
    const newSource = assembly.buildManuscriptBundle(
      citationProvenanceInput('nature'),
    );
    jest
      .mocked(prepareManuscriptBundleWithCsl)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const { result, rerender } = renderHook(
      ({ source }) => useManuscriptCitationPreparation(source),
      { initialProps: { source: oldSource } },
    );
    expect(result.current.isPreparing).toBe(true);
    await waitFor(() =>
      expect(prepareManuscriptBundleWithCsl).toHaveBeenCalledTimes(1),
    );
    rerender({ source: newSource });
    await waitFor(() =>
      expect(prepareManuscriptBundleWithCsl).toHaveBeenCalledTimes(2),
    );
    await act(async () => {
      oldRequest.resolve(applied(oldSource));
    });
    expect(result.current.isPreparing).toBe(true);
    expect(result.current.bundle).toBe(newSource);
    await act(async () => {
      newRequest.resolve(applied(newSource));
    });
    expect(result.current.isPreparing).toBe(false);
    expect(result.current.bundle.citationProvenance.requestedStyleId).toBe(
      'nature',
    );
  });

  it('retries from an unprepared fresh bundle and clears old readiness immediately', async () => {
    const source = assembly.buildManuscriptBundle(
      citationProvenanceInput('apa'),
    );
    const request = deferredBundle();
    jest
      .mocked(prepareManuscriptBundleWithCsl)
      .mockResolvedValueOnce({
        ...source,
        citationProvenance: {
          requestedStyleId: 'apa',
          appliedStyleId: 'built-in',
          engineOutcome: 'engine-unavailable',
        },
      })
      .mockReturnValueOnce(request.promise);
    const { result } = renderHook(() =>
      useManuscriptCitationPreparation(source),
    );
    await waitFor(() => expect(result.current.isPreparing).toBe(false));
    act(() => result.current.retry());
    expect(result.current.isPreparing).toBe(true);
    await waitFor(() =>
      expect(prepareManuscriptBundleWithCsl).toHaveBeenCalledTimes(2),
    );
    expect(
      jest.mocked(prepareManuscriptBundleWithCsl).mock.calls[1][0]
        .citationProvenance.engineOutcome,
    ).toBe('not-prepared');
    await act(async () => {
      request.resolve(applied(source));
    });
    expect(result.current.bundle.citationProvenance.engineOutcome).toBe(
      'applied',
    );
  });

  it('surfaces unexpected construction errors rather than spinning indefinitely', async () => {
    const source = assembly.buildManuscriptBundle(
      citationProvenanceInput('apa'),
    );
    jest.mocked(assembly.buildManuscriptBundle).mockImplementation(() => {
      throw new Error('invalid source');
    });
    const { result } = renderHook(() =>
      useManuscriptCitationPreparation(source),
    );
    await waitFor(() =>
      expect(result.current.preparationError).toBe('invalid source'),
    );
    expect(result.current.isPreparing).toBe(false);
    expect(prepareManuscriptBundleWithCsl).not.toHaveBeenCalled();
  });
});
