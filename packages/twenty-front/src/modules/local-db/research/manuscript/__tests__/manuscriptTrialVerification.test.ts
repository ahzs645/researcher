import {
  clinicalTrialsRecordUrl,
  clinicalTrialsStudyUrl,
  isProspectiveRegistration,
  readClinicalTrialsStudy,
  registeredTrial,
  splitTrialIdentifiers,
  summarizeTrialVerification,
  uncheckedTrial,
  unresolvedTrial,
} from '@/local-db/research/manuscript/screening/trialVerification';

// Recorded from clinicaltrials.gov/api/v2/studies/NCT04280705, trimmed to the
// three modules the verdict reads.
const ACTT_PAYLOAD = {
  protocolSection: {
    identificationModule: {
      nctId: 'NCT04280705',
      briefTitle: 'Adaptive COVID-19 Treatment Trial (ACTT)',
      officialTitle:
        'A Multicenter, Adaptive, Randomized Blinded Controlled Trial of the Safety and Efficacy of Investigational Therapeutics for the Treatment of COVID-19 in Hospitalized Adults',
    },
    statusModule: {
      statusVerifiedDate: '2020-04',
      overallStatus: 'COMPLETED',
      startDateStruct: { date: '2020-02-21', type: 'ACTUAL' },
      studyFirstSubmitDate: '2020-02-20',
    },
    designModule: {
      studyType: 'INTERVENTIONAL',
      phases: ['PHASE3'],
      designInfo: {
        allocation: 'RANDOMIZED',
        maskingInfo: { masking: 'DOUBLE', whoMasked: ['PARTICIPANT'] },
      },
      enrollmentInfo: { count: 1062, type: 'ACTUAL' },
    },
  },
};

describe('clinicalTrialsStudyUrl', () => {
  it('asks the v2 endpoint for only the modules the verdict reads', () => {
    expect(clinicalTrialsStudyUrl('nct04280705')).toBe(
      'https://clinicaltrials.gov/api/v2/studies/NCT04280705' +
        '?fields=protocolSection.identificationModule,protocolSection.statusModule,protocolSection.designModule',
    );
    expect(clinicalTrialsRecordUrl('NCT04280705')).toBe(
      'https://clinicaltrials.gov/study/NCT04280705',
    );
  });
});

describe('readClinicalTrialsStudy', () => {
  it('reads the registered record out of a v2 payload', () => {
    expect(readClinicalTrialsStudy(ACTT_PAYLOAD)).toEqual({
      nctId: 'NCT04280705',
      title: 'Adaptive COVID-19 Treatment Trial (ACTT)',
      overallStatus: 'COMPLETED',
      studyType: 'INTERVENTIONAL',
      allocation: 'RANDOMIZED',
      masking: 'DOUBLE',
      enrollmentCount: 1062,
      startDate: '2020-02-21',
      firstSubmitDate: '2020-02-20',
      isProspective: true,
    });
  });

  it('refuses a payload that is not a study rather than inventing one', () => {
    for (const payload of [null, 'NCT04280705', {}, { protocolSection: {} }]) {
      expect(readClinicalTrialsStudy(payload)).toBeNull();
    }
  });

  it('falls back to the official title when there is no brief one', () => {
    expect(
      readClinicalTrialsStudy({
        protocolSection: {
          identificationModule: {
            nctId: 'NCT00000001',
            officialTitle: 'A long official title',
          },
        },
      }),
    ).toMatchObject({
      title: 'A long official title',
      overallStatus: 'UNKNOWN',
      isProspective: null,
    });
  });
});

describe('isProspectiveRegistration', () => {
  // Registry dates come at whatever precision the sponsor knew, so the
  // comparison drops to the coarser of the two rather than pretending.
  it('compares at the precision both dates have', () => {
    expect(isProspectiveRegistration('2020-02-20', '2020-02-21')).toBe(true);
    expect(isProspectiveRegistration('2021-06-01', '2020-02')).toBe(false);
    expect(isProspectiveRegistration('2020-02-20', '2020-02')).toBe(true);
  });

  it('is unknown rather than false when a date is missing', () => {
    expect(isProspectiveRegistration(null, '2020-02-21')).toBeNull();
    expect(isProspectiveRegistration('2020-02-20', null)).toBeNull();
  });
});

describe('splitTrialIdentifiers', () => {
  it('separates what ClinicalTrials.gov can answer for from what it cannot', () => {
    expect(
      splitTrialIdentifiers([
        'NCT04280705',
        'ISRCTN12345678',
        'NCT04280705',
        '  ',
        '2019-001234-12',
      ]),
    ).toEqual({
      verifiable: ['NCT04280705'],
      unsupported: ['ISRCTN12345678', '2019-001234-12'],
    });
  });
});

describe('summarizeTrialVerification', () => {
  const registered = registeredTrial(
    readClinicalTrialsStudy(ACTT_PAYLOAD) ?? {
      nctId: '',
      title: '',
      overallStatus: '',
      studyType: null,
      allocation: null,
      masking: null,
      enrollmentCount: null,
      startDate: null,
      firstSubmitDate: null,
      isProspective: null,
    },
  );

  it('reports a resolved identifier with the registry’s own record', () => {
    const summary = summarizeTrialVerification({
      state: 'DONE',
      verifications: [registered],
      unsupported: [],
    });

    expect(summary.message).toBe('1 identifier resolved to a registered study');
    expect(summary.verifications[0].summary).toContain(
      'Adaptive COVID-19 Treatment Trial',
    );
    expect(summary.verifications[0].summary).toContain('enrolment 1062');
  });

  it('is a much stronger finding when the number resolves to nothing', () => {
    const summary = summarizeTrialVerification({
      state: 'DONE',
      verifications: [unresolvedTrial('NCT99999999')],
      unsupported: [],
    });

    expect(summary.message).toBe(
      '1 identifier not found in ClinicalTrials.gov',
    );
    expect(summary.verifications[0].status).toBe('NOT_FOUND');
  });

  it('calls out a registration filed after the study started', () => {
    const retrospective = registeredTrial({
      nctId: 'NCT00000002',
      title: 'A retrospectively registered trial',
      overallStatus: 'COMPLETED',
      studyType: 'INTERVENTIONAL',
      allocation: null,
      masking: null,
      enrollmentCount: 40,
      startDate: '2018-01-01',
      firstSubmitDate: '2021-05-04',
      isProspective: false,
    });

    expect(retrospective.summary).toContain(
      'registered 2021-05-04 after the study started 2018-01-01',
    );
    expect(
      summarizeTrialVerification({
        state: 'DONE',
        verifications: [retrospective],
        unsupported: [],
      }).message,
    ).toContain('1 registration filed after the study started');
  });

  // The distinction the whole module exists to protect: not checked is not
  // clean.
  it('never lets "could not check" read as a confirmation', () => {
    for (const state of ['OFFLINE', 'FAILED'] as const) {
      expect(
        summarizeTrialVerification({
          state,
          verifications: [],
          unsupported: [],
        }).message,
      ).toContain('This is not a confirmation.');
    }
    expect(
      summarizeTrialVerification({
        state: 'DONE',
        verifications: [uncheckedTrial('NCT04280705', 'Offline')],
        unsupported: [],
      }).message,
    ).toBe('1 identifier could not be checked');
  });

  it('says plainly that other registries are outside what it can check', () => {
    expect(
      summarizeTrialVerification({
        state: 'DONE',
        verifications: [],
        unsupported: ['ISRCTN12345678'],
      }).message,
    ).toBe(
      'No ClinicalTrials.gov identifier to check · 1 identifier from another registry cannot be checked here (ISRCTN12345678)',
    );
  });

  it('has a message for a run that has not happened yet', () => {
    expect(
      summarizeTrialVerification({
        state: 'IDLE',
        verifications: [],
        unsupported: [],
      }).message,
    ).toContain('has not been checked');
    expect(
      summarizeTrialVerification({
        state: 'CHECKING',
        verifications: [],
        unsupported: [],
      }).message,
    ).toContain('Checking');
  });
});
