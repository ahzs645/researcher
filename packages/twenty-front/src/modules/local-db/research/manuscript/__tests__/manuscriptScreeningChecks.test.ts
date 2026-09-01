import {
  screenManuscript,
  type ScreeningFinding,
} from '@/local-db/research/manuscript/manuscriptScreening';
import {
  buildScreeningReport,
  screeningSubmissionChecks,
} from '@/local-db/research/manuscript/manuscriptScreeningChecks';

const finding = (
  overrides: Partial<ScreeningFinding> & Pick<ScreeningFinding, 'key'>,
): ScreeningFinding => ({
  label: 'Open data statement',
  tool: 'ODDPub',
  verdict: 'PRESENT',
  evidence: '',
  detail: 'Detail',
  ...overrides,
});

describe('screeningSubmissionChecks', () => {
  it('says nothing at all when nothing was screened', () => {
    expect(screeningSubmissionChecks([])).toEqual([]);
  });

  it('warns once, naming what is missing and what is thin', () => {
    const checks = screeningSubmissionChecks([
      finding({ key: 'OPEN_DATA', label: 'Open data statement' }),
      finding({
        key: 'OPEN_CODE',
        label: 'Open code statement',
        verdict: 'ABSENT',
      }),
      finding({
        key: 'FUNDING',
        label: 'Funding statement',
        verdict: 'WEAK',
      }),
      finding({
        key: 'LIMITATIONS',
        label: 'Limitations acknowledged',
        verdict: 'ABSENT',
      }),
    ]);

    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe('automated-screening');
    expect(checks[0].label).toBe('Automated screening');
    expect(checks[0].severity).toBe('WARNING');
    expect(checks[0].target).toBe('submission');
    expect(checks[0].detail).toContain('Open code statement');
    expect(checks[0].detail).toContain('Limitations acknowledged');
    expect(checks[0].detail).toContain('Funding statement');
    expect(checks[0].detail).not.toContain('Open data statement');
  });

  it('is ready when every check found a statement', () => {
    const checks = screeningSubmissionChecks([
      finding({ key: 'OPEN_DATA' }),
      finding({ key: 'FUNDING', label: 'Funding statement' }),
    ]);

    expect(checks).toHaveLength(1);
    expect(checks[0].severity).toBe('READY');
  });

  // The screening panel promises the author that no finding blocks an export.
  // A heuristic that raised an ERROR would strand a finished paper on a false
  // negative, so this holds even for a manuscript with nothing in it.
  it('never raises an error, whatever the manuscript says', () => {
    for (const manuscript of [
      { sections: [] },
      {
        sections: [
          {
            id: 'methods',
            name: 'Methods',
            sectionType: 'METHODS',
            content: 'We measured things.',
          },
        ],
      },
      {
        sections: [
          {
            id: 'availability',
            name: 'Data availability',
            sectionType: 'DATA_AVAILABILITY',
            content:
              'All data are deposited in Zenodo at https://doi.org/10.5281/zenodo.1234567.',
          },
        ],
        competingInterests: 'The authors declare no competing interests.',
      },
    ]) {
      const checks = screeningSubmissionChecks(screenManuscript(manuscript));

      expect(checks).toHaveLength(1);
      expect(checks[0].severity).not.toBe('ERROR');
    }
  });
});

describe('buildScreeningReport', () => {
  it('reports every check with its tool, question, verdict and evidence', () => {
    const findings = screenManuscript({
      sections: [
        {
          id: 'availability',
          name: 'Data availability',
          sectionType: 'DATA_AVAILABILITY',
          content:
            'All data are deposited in Zenodo at https://doi.org/10.5281/zenodo.1234567.',
        },
      ],
    });
    const report = buildScreeningReport(findings, 'A screened manuscript');

    expect(report).toContain('A screened manuscript');
    // Every check appears, whatever its verdict.
    for (const label of [
      'Open data statement',
      'Open code statement',
      'Limitations acknowledged',
      'Trial registration',
      'Competing interests statement',
      'Funding statement',
      'Protocol registration',
      'Ethics approval',
      'Informed consent',
    ]) {
      expect(report).toContain(label);
    }
    expect(report).toContain('ODDPub');
    expect(report).toContain('Does the paper say where the data are?');
    expect(report).toContain('[ABSENT] Open code statement');
    expect(report).toContain('zenodo.1234567');
  });
});
