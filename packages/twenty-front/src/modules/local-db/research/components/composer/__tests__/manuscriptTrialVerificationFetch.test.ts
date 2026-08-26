import { runTrialVerification } from '@/local-db/research/components/composer/references/manuscriptTrialVerificationFetch';
import {
  manuscriptTrialVerificationSummary,
  trialVerificationSignature,
} from '@/local-db/research/components/composer/references/manuscriptTrialVerificationState';
import { summarizeTrialVerification } from '@/local-db/research/manuscript/screening/trialVerification';

const ACTT_PAYLOAD = {
  protocolSection: {
    identificationModule: {
      nctId: 'NCT04280705',
      briefTitle: 'Adaptive COVID-19 Treatment Trial (ACTT)',
    },
    statusModule: {
      overallStatus: 'COMPLETED',
      startDateStruct: { date: '2020-02-21' },
      studyFirstSubmitDate: '2020-02-20',
    },
    designModule: { enrollmentInfo: { count: 1062 } },
  },
};

const respondWith = (
  responses: { status: number; body?: unknown }[],
): jest.Mock => {
  const fetchMock = jest.fn();
  for (const { status, body } of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const setOnLine = (onLine: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', {
    value: onLine,
    configurable: true,
  });
};

describe('runTrialVerification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setOnLine(true);
  });

  it('confirms an identifier the registry knows', async () => {
    const fetchMock = respondWith([{ status: 200, body: ACTT_PAYLOAD }]);
    const summary = await runTrialVerification(['NCT04280705']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'clinicaltrials.gov/api/v2/studies/NCT04280705',
    );
    expect(summary.state).toBe('DONE');
    expect(summary.verifications[0].status).toBe('REGISTERED');
    expect(summary.verifications[0].record?.enrollmentCount).toBe(1062);
    expect(summary.message).toBe('1 identifier resolved to a registered study');
  });

  // A 404 is the registry answering, and the answer is that this number was
  // never issued. That is a finding, not a failure.
  it('reports a 404 as not found rather than as unchecked', async () => {
    respondWith([{ status: 404 }]);
    const summary = await runTrialVerification(['NCT99999999']);

    expect(summary.state).toBe('DONE');
    expect(summary.verifications[0].status).toBe('NOT_FOUND');
    expect(summary.message).toBe(
      '1 identifier not found in ClinicalTrials.gov',
    );
  });

  it('reports a server error as unchecked, never as a confirmation', async () => {
    respondWith([{ status: 503 }]);
    const summary = await runTrialVerification(['NCT04280705']);

    expect(summary.state).toBe('FAILED');
    expect(summary.verifications[0].status).toBe('UNKNOWN');
    expect(summary.message).toContain('This is not a confirmation.');
  });

  it('survives a blocked request rather than throwing', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('Failed'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const summary = await runTrialVerification(['NCT04280705']);

    expect(summary.state).toBe('FAILED');
    expect(summary.verifications[0].summary).toContain(
      'Could not reach ClinicalTrials.gov',
    );
  });

  it('keeps checking the rest when one identifier fails', async () => {
    respondWith([{ status: 500 }, { status: 200, body: ACTT_PAYLOAD }]);
    const summary = await runTrialVerification(['NCT00000001', 'NCT04280705']);

    expect(summary.state).toBe('DONE');
    expect(summary.verifications.map(({ status }) => status)).toEqual([
      'UNKNOWN',
      'REGISTERED',
    ]);
    expect(summary.message).toBe(
      '1 identifier resolved to a registered study · 1 identifier could not be checked',
    );
  });

  // This app runs offline by design, so being offline is an outcome with its
  // own message rather than an error.
  it('does not reach the network at all when the browser is offline', async () => {
    const fetchMock = respondWith([{ status: 200, body: ACTT_PAYLOAD }]);
    setOnLine(false);
    const summary = await runTrialVerification(['NCT04280705']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.state).toBe('OFFLINE');
    expect(summary.message).toContain('Offline');
    expect(summary.message).toContain('This is not a confirmation.');
  });

  it('makes no request for a registry it cannot verify', async () => {
    const fetchMock = respondWith([]);
    const summary = await runTrialVerification(['ISRCTN12345678']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.state).toBe('DONE');
    expect(summary.unsupported).toEqual(['ISRCTN12345678']);
    expect(summary.message).toContain('cannot be checked here');
  });
});

describe('manuscriptTrialVerificationSummary', () => {
  const doneSummary = summarizeTrialVerification({
    state: 'DONE',
    verifications: [],
    unsupported: [],
  });

  it('returns a finished run that covers exactly these identifiers', () => {
    expect(
      manuscriptTrialVerificationSummary({
        verification: {
          identifiers: ['NCT04280705', 'ISRCTN12345678'],
          summary: doneSummary,
        },
        identifiers: ['ISRCTN12345678', 'NCT04280705'],
      }),
    ).toBe(doneSummary);
  });

  // A verdict is only true of the identifiers it ran over, so an edited
  // registration number retires the run rather than inheriting its answer.
  it('retires a run once the identifiers change', () => {
    expect(
      manuscriptTrialVerificationSummary({
        verification: { identifiers: ['NCT04280705'], summary: doneSummary },
        identifiers: ['NCT00000001'],
      }),
    ).toBeNull();
  });

  it('withholds a run that has not finished', () => {
    expect(
      manuscriptTrialVerificationSummary({
        verification: {
          identifiers: ['NCT04280705'],
          summary: summarizeTrialVerification({
            state: 'CHECKING',
            verifications: [],
            unsupported: [],
          }),
        },
        identifiers: ['NCT04280705'],
      }),
    ).toBeNull();
  });

  it('is order-insensitive', () => {
    expect(trialVerificationSignature(['b', 'a'])).toBe(
      trialVerificationSignature(['a', 'b']),
    );
  });
});
