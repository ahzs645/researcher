import {
  chunkDoisForCrossref,
  countReferencesWithoutDoi,
  crossrefRetractionBatchUrl,
  crossrefWorkUrl,
  isBatchableDoi,
  readCrossrefRetraction,
  readCrossrefRetractionBatch,
  referencesToCheck,
  retractionSubmissionChecks,
  summarizeRetractionScan,
  type ReferenceRetractionResult,
} from '@/local-db/research/manuscript/manuscriptRetraction';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

import {
  CROSSREF_BATCH_PAYLOAD,
  CROSSREF_CLEAN_PAYLOAD,
  CROSSREF_CORRECTED_THEN_RETRACTED_PAYLOAD,
  CROSSREF_EXPRESSION_OF_CONCERN_PAYLOAD,
  CROSSREF_RETRACTED_PAYLOAD,
} from './fixtures/referenceIdentifierPayloads';

describe('crossrefWorkUrl', () => {
  it('normalizes the DOI and leaves its slashes unescaped', () => {
    expect(crossrefWorkUrl('https://doi.org/10.1038/Nature12373')).toBe(
      'https://api.crossref.org/works/10.1038/nature12373',
    );
  });

  it('escapes characters that would break the path', () => {
    expect(crossrefWorkUrl('10.1000/a b')).toBe(
      'https://api.crossref.org/works/10.1000/a%20b',
    );
  });
});

describe('crossrefRetractionBatchUrl', () => {
  it('asks for many DOIs in one filtered request, selecting only what it reads', () => {
    const url = crossrefRetractionBatchUrl(['10.1/A', 'doi:10.2/b']);
    expect(url).toContain('https://api.crossref.org/works?filter=');
    expect(decodeURIComponent(url)).toContain('doi:10.1/a,doi:10.2/b');
    expect(url).toContain('select=DOI,update-to,title');
    expect(url).toContain('rows=2');
  });

  it('can drop `select` for the retry when Crossref rejects the field list', () => {
    expect(
      crossrefRetractionBatchUrl(['10.1/a'], { select: false }),
    ).not.toContain('select=');
  });
});

describe('isBatchableDoi / chunkDoisForCrossref', () => {
  it('excludes a DOI containing a comma, which would split the filter', () => {
    expect(isBatchableDoi('10.1038/nature12373')).toBe(true);
    expect(isBatchableDoi('10.1000/odd,doi')).toBe(false);
  });

  it('splits a long bibliography into batches', () => {
    const dois = Array.from({ length: 5 }, (_unused, index) => `10.1/${index}`);
    expect(chunkDoisForCrossref(dois, 2)).toEqual([
      ['10.1/0', '10.1/1'],
      ['10.1/2', '10.1/3'],
      ['10.1/4'],
    ]);
    expect(chunkDoisForCrossref([], 2)).toEqual([]);
  });
});

describe('readCrossrefRetraction', () => {
  it('reports a retraction with the notice label, date and DOI', () => {
    const verdict = readCrossrefRetraction(CROSSREF_RETRACTED_PAYLOAD);
    expect(verdict.status).toBe('RETRACTED');
    expect(verdict.notices).toEqual([
      {
        type: 'RETRACTION',
        label: 'Retraction',
        doi: '10.1016/j.jinf.2020.05.062',
        date: '2020-06-04',
      },
    ]);
    expect(verdict.summary).toBe('Retraction (2020-06-04)');
  });

  it('lets the worst notice win when a paper was corrected and then retracted', () => {
    const verdict = readCrossrefRetraction(
      CROSSREF_CORRECTED_THEN_RETRACTED_PAYLOAD,
    );
    expect(verdict.status).toBe('RETRACTED');
    expect(verdict.notices).toHaveLength(2);
    expect(verdict.summary).toBe(
      'Retraction (2021-11-30) · 1 further notice(s)',
    );
  });

  it('reports an expression of concern, labelling it when Crossref did not', () => {
    const verdict = readCrossrefRetraction(
      CROSSREF_EXPRESSION_OF_CONCERN_PAYLOAD,
    );
    expect(verdict.status).toBe('CONCERN');
    expect(verdict.summary).toBe('Expression of concern (2023-01-09)');
  });

  it('reports a correction as CORRECTED, not as a retraction', () => {
    const verdict = readCrossrefRetraction({
      message: {
        DOI: '10.1000/x',
        'update-to': [{ type: 'erratum', label: 'Erratum', DOI: '10.1000/e' }],
      },
    });
    expect(verdict.status).toBe('CORRECTED');
    expect(verdict.notices[0].type).toBe('CORRECTION');
    expect(verdict.notices[0].date).toBeNull();
  });

  it('reports a work with no update-to as CLEAN', () => {
    const verdict = readCrossrefRetraction(CROSSREF_CLEAN_PAYLOAD);
    expect(verdict.status).toBe('CLEAN');
    expect(verdict.notices).toEqual([]);
    expect(verdict.summary).toBe('No retraction or correction on record');
  });

  it('reports an empty update-to array as CLEAN', () => {
    expect(
      readCrossrefRetraction({ message: { DOI: '10.1/a', 'update-to': [] } })
        .status,
    ).toBe('CLEAN');
  });

  it('reports UNKNOWN — never CLEAN — when there is no data to read', () => {
    // The distinction the whole feature rests on: no answer is not an all-clear.
    for (const payload of [
      null,
      undefined,
      '',
      {},
      { status: 'error' },
      { message: 'Resource not found.' },
      [1, 2, 3],
    ]) {
      const verdict = readCrossrefRetraction(payload);
      expect(verdict.status).toBe('UNKNOWN');
      expect(verdict.summary).toBe('Not checked — no data from Crossref');
    }
  });

  it('accepts an already-unwrapped work, as a batch row supplies', () => {
    expect(
      readCrossrefRetraction({ DOI: '10.1038/s41586-020-2649-2' }).status,
    ).toBe('CLEAN');
  });

  it('keeps an unrecognised update type rather than dropping it', () => {
    const verdict = readCrossrefRetraction({
      message: { DOI: '10.1/a', 'update-to': [{ type: 'something_new' }] },
    });
    expect(verdict.status).toBe('CORRECTED');
    expect(verdict.notices[0]).toEqual({
      type: 'OTHER',
      label: 'Update',
      doi: null,
      date: null,
    });
  });
});

describe('readCrossrefRetractionBatch', () => {
  it('keys a verdict per DOI, lower-cased to match how we store them', () => {
    const verdicts = readCrossrefRetractionBatch(CROSSREF_BATCH_PAYLOAD);
    expect(verdicts.size).toBe(2);
    expect(verdicts.get('10.1016/j.jinf.2020.03.062')?.status).toBe(
      'RETRACTED',
    );
    expect(verdicts.get('10.1038/s41586-020-2649-2')?.status).toBe('CLEAN');
  });

  it('omits DOIs Crossref did not answer for, rather than calling them clean', () => {
    const verdicts = readCrossrefRetractionBatch(CROSSREF_BATCH_PAYLOAD);
    expect(verdicts.has('10.9999/never-heard-of-it')).toBe(false);
  });

  it('returns an empty map for a shape it cannot read', () => {
    expect(readCrossrefRetractionBatch(null).size).toBe(0);
    expect(readCrossrefRetractionBatch({ message: {} }).size).toBe(0);
  });
});

const reference = (
  id: string,
  doi: string | null,
  citationKey = id,
): ReferenceLike => ({
  id,
  doi,
  citationKey,
  name: `Title ${id}`,
});

describe('referencesToCheck / countReferencesWithoutDoi', () => {
  it('normalizes DOIs and checks each distinct one only once', () => {
    const checkable = referencesToCheck([
      reference('a', 'https://doi.org/10.1/A'),
      reference('b', 'DOI: 10.1/a'),
      reference('c', '10.2/b'),
    ]);
    expect(checkable.map((entry) => entry.doi)).toEqual(['10.1/a', '10.2/b']);
    expect(checkable[0].citationKey).toBe('a');
    expect(checkable[0].title).toBe('Title a');
  });

  it('skips references with no DOI and counts them', () => {
    const references = [
      reference('a', '10.1/a'),
      reference('b', null),
      reference('c', '   '),
    ];
    expect(referencesToCheck(references)).toHaveLength(1);
    expect(countReferencesWithoutDoi(references)).toBe(2);
  });
});

const result = (
  id: string,
  status: 'RETRACTED' | 'CONCERN' | 'CORRECTED' | 'CLEAN' | 'UNKNOWN',
): ReferenceRetractionResult => ({
  referenceId: id,
  citationKey: id,
  title: `Title ${id}`,
  doi: `10.1/${id}`,
  verdict: { status, notices: [], summary: `${status} summary` },
});

describe('summarizeRetractionScan', () => {
  it('flags retracted, concerning and corrected references, worst first', () => {
    const summary = summarizeRetractionScan({
      state: 'DONE',
      results: [
        result('corrected', 'CORRECTED'),
        result('clean', 'CLEAN'),
        result('retracted', 'RETRACTED'),
        result('concern', 'CONCERN'),
      ],
      withoutDoiCount: 0,
      uncheckedCount: 0,
    });
    expect(summary.flagged.map((entry) => entry.referenceId)).toEqual([
      'retracted',
      'concern',
      'corrected',
    ]);
    expect(summary.checkedCount).toBe(4);
    expect(summary.message).toBe(
      '1 retracted reference, 2 with a correction or concern',
    );
  });

  it('says plainly that nothing was found when everything checked out', () => {
    const summary = summarizeRetractionScan({
      state: 'DONE',
      results: [result('a', 'CLEAN'), result('b', 'CLEAN')],
      withoutDoiCount: 0,
      uncheckedCount: 0,
    });
    expect(summary.flagged).toEqual([]);
    expect(summary.message).toBe(
      'No retractions or corrections found in 2 references',
    );
  });

  it('names the gaps so a clean result is never overstated', () => {
    const summary = summarizeRetractionScan({
      state: 'DONE',
      results: [result('a', 'CLEAN')],
      withoutDoiCount: 3,
      uncheckedCount: 2,
    });
    expect(summary.message).toBe(
      'No retractions or corrections found in 1 reference · not checked: 2 DOIs not found in Crossref, 3 references without a DOI',
    );
  });

  it('says offline rather than implying the bibliography is clean', () => {
    const summary = summarizeRetractionScan({
      state: 'OFFLINE',
      results: [],
      withoutDoiCount: 0,
      uncheckedCount: 4,
    });
    expect(summary.flagged).toEqual([]);
    expect(summary.checkedCount).toBe(0);
    expect(summary.message).toContain('Offline');
    expect(summary.message).toContain('not a clean result');
  });

  it('says the same when the request failed', () => {
    expect(
      summarizeRetractionScan({
        state: 'FAILED',
        results: [],
        withoutDoiCount: 0,
        uncheckedCount: 4,
      }).message,
    ).toContain('not a clean result');
  });

  it('says nothing has been checked yet before the author asks', () => {
    expect(
      summarizeRetractionScan({
        state: 'IDLE',
        results: [],
        withoutDoiCount: 0,
        uncheckedCount: 0,
      }).message,
    ).toBe('References have not been checked yet.');
  });

  it('does not count an UNKNOWN verdict as checked', () => {
    const summary = summarizeRetractionScan({
      state: 'DONE',
      results: [result('a', 'CLEAN'), result('b', 'UNKNOWN')],
      withoutDoiCount: 0,
      uncheckedCount: 1,
    });
    expect(summary.checkedCount).toBe(1);
    expect(summary.flagged).toEqual([]);
  });
});

describe('retractionSubmissionChecks', () => {
  const scan = (
    state: 'DONE' | 'IDLE' | 'OFFLINE' | 'FAILED',
    results: ReferenceRetractionResult[],
  ) =>
    summarizeRetractionScan({
      state,
      results,
      withoutDoiCount: 0,
      uncheckedCount: 0,
    });

  it('raises a retracted reference as an ERROR aimed at the references tab', () => {
    const [check] = retractionSubmissionChecks(
      scan('DONE', [result('bad', 'RETRACTED')]),
    );
    expect(check.severity).toBe('ERROR');
    expect(check.label).toBe('Retracted reference');
    expect(check.target).toBe('references');
    expect(check.detail).toBe('[@bad] Title bad — RETRACTED summary');
    expect(check.id).toBe('retraction-bad');
  });

  it('raises a correction or a concern as a WARNING', () => {
    const checks = retractionSubmissionChecks(
      scan('DONE', [result('c', 'CORRECTED'), result('e', 'CONCERN')]),
    );
    expect(checks.map((check) => check.severity)).toEqual([
      'WARNING',
      'WARNING',
    ]);
    expect(checks.map((check) => check.label)).toEqual([
      'Reference under expression of concern',
      'Corrected reference',
    ]);
  });

  it('emits nothing for a clean scan and nothing before one has run', () => {
    expect(
      retractionSubmissionChecks(scan('DONE', [result('a', 'CLEAN')])),
    ).toEqual([]);
    expect(retractionSubmissionChecks(scan('IDLE', []))).toEqual([]);
  });

  it('warns that the check could not run rather than staying silent', () => {
    for (const state of ['OFFLINE', 'FAILED'] as const) {
      const [check] = retractionSubmissionChecks(scan(state, []));
      expect(check.severity).toBe('WARNING');
      expect(check.label).toBe('Retraction check');
      expect(check.detail).toContain('not a clean result');
    }
  });

  it('falls back to the DOI when a reference has no citation key', () => {
    const [check] = retractionSubmissionChecks(
      scan('DONE', [{ ...result('x', 'RETRACTED'), citationKey: '' }]),
    );
    expect(check.detail).toContain('[@10.1/x]');
  });
});
