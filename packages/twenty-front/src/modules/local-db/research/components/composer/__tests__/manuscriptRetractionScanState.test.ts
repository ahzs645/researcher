import {
  retractionReadinessChecks,
  type ManuscriptRetractionScan,
} from '@/local-db/research/components/composer/references/manuscriptRetractionScanState';
import {
  summarizeRetractionScan,
  type ReferenceRetractionResult,
  type RetractionScanState,
} from '@/local-db/research/manuscript/manuscriptRetraction';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

const WITH_DOI: ReferenceLike[] = [
  { id: 'ref-1', citationKey: 'smith2019', doi: '10.1000/abc' },
  { id: 'ref-2', citationKey: 'jones2020', doi: '10.1000/def' },
];

const RETRACTED_RESULT: ReferenceRetractionResult = {
  referenceId: 'ref-1',
  citationKey: 'smith2019',
  title: 'A retracted paper',
  doi: '10.1000/abc',
  verdict: {
    status: 'RETRACTED',
    notices: [
      {
        type: 'RETRACTION',
        label: 'Retraction',
        doi: '10.1000/retraction',
        date: '2021-04-01',
      },
    ],
    summary: 'Retraction (2021-04-01)',
  },
};

const scanOf = (
  state: RetractionScanState,
  results: ReferenceRetractionResult[] = [],
): ManuscriptRetractionScan => ({
  manuscriptId: 'paper-1',
  summary: summarizeRetractionScan({
    state,
    results,
    withoutDoiCount: 0,
    uncheckedCount: 0,
  }),
  checkedReferenceIds: ['ref-1', 'ref-2'],
});

describe('retractionReadinessChecks', () => {
  it('carries a finished scan into the readiness list', () => {
    const checks = retractionReadinessChecks({
      scan: scanOf('DONE', [RETRACTED_RESULT]),
      manuscriptId: 'paper-1',
      references: WITH_DOI,
    });

    expect(checks).toHaveLength(1);
    expect(checks[0].severity).toBe('ERROR');
    expect(checks[0].label).toBe('Retracted reference');
    expect(checks[0].detail).toContain('smith2019');
    expect(checks[0].target).toBe('references');
  });

  it('nags without blocking when no scan has been run', () => {
    const checks = retractionReadinessChecks({
      scan: null,
      manuscriptId: 'paper-1',
      references: [...WITH_DOI, { id: 'ref-3', name: 'A book' }],
    });

    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe('retraction-scan-not-run');
    expect(checks[0].severity).toBe('WARNING');
    expect(checks[0].target).toBe('references');
    expect(checks[0].detail).toContain('Crossref');
    expect(checks[0].detail).toContain('1 without a DOI');
  });

  // Nothing carries a DOI, so there is no check to run and nothing to nag
  // about — a warning here would be a chore the author cannot complete.
  it('says nothing when there is nothing Crossref could answer for', () => {
    expect(
      retractionReadinessChecks({
        scan: null,
        manuscriptId: 'paper-1',
        references: [{ id: 'ref-3', name: 'A book' }],
      }),
    ).toEqual([]);
  });

  it('says nothing when the manuscript has no references at all', () => {
    expect(
      retractionReadinessChecks({
        scan: null,
        manuscriptId: 'paper-1',
        references: [],
      }),
    ).toEqual([]);
  });

  it('ignores a scan that belongs to another manuscript', () => {
    const checks = retractionReadinessChecks({
      scan: scanOf('DONE', [RETRACTED_RESULT]),
      manuscriptId: 'paper-2',
      references: WITH_DOI,
    });

    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe('retraction-scan-not-run');
  });

  // The References tab parks a retired scan back at IDLE when the reference
  // list changes underneath it, and an IDLE scan is no scan.
  it.each(['IDLE', 'CHECKING'] as RetractionScanState[])(
    'asks for a scan while one is %s',
    (state) => {
      const checks = retractionReadinessChecks({
        scan: scanOf(state),
        manuscriptId: 'paper-1',
        references: WITH_DOI,
      });

      expect(checks).toHaveLength(1);
      expect(checks[0].id).toBe('retraction-scan-not-run');
    },
  );

  // A scan that could not reach Crossref already reports itself as unavailable,
  // so it must not also be reported as never run.
  it.each(['OFFLINE', 'FAILED'] as RetractionScanState[])(
    'reports a %s scan as unavailable, not as unrun',
    (state) => {
      const checks = retractionReadinessChecks({
        scan: scanOf(state),
        manuscriptId: 'paper-1',
        references: WITH_DOI,
      });

      expect(checks).toHaveLength(1);
      expect(checks[0].id).toBe('retraction-scan-unavailable');
      expect(checks[0].severity).toBe('WARNING');
    },
  );
});
