import {
  MANUSCRIPT_SCREENING_CHECKS,
  screenManuscript,
  summarizeScreeningFindings,
  type ScreeningCheckKey,
  type ScreeningFinding,
} from '@/local-db/research/manuscript/manuscriptScreening';
import {
  parseWordDocument,
  parseWordStyleDefinitions,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

import {
  AMT_PAPER_IMAGES,
  AMT_PAPER_STYLES_XML,
  buildAmtPaperWordMl,
} from './fixtures/amtPaperWordMl';

const section = (
  name: string,
  sectionType: string,
  content: string,
): SectionLike => ({
  id: name.toLocaleLowerCase().replace(/\W+/g, '-'),
  name,
  sectionType,
  content,
});

const screen = (sections: SectionLike[], competingInterests?: string) =>
  screenManuscript({ sections, competingInterests });

const finding = (
  sections: SectionLike[],
  key: ScreeningCheckKey,
  competingInterests?: string,
): ScreeningFinding => {
  const match = screen(sections, competingInterests).find(
    (candidate) => candidate.key === key,
  );
  if (match === undefined) throw new Error(`no ${key} finding`);
  return match;
};

const DISCUSSION = section(
  'Discussion',
  'DISCUSSION',
  'Exact alignment removes ambiguity about which high-frequency observations represent a filter sample.',
);

describe('manuscript screening', () => {
  it('reports one finding per catalogued check, in catalogue order', () => {
    const findings = screen([]);

    expect(findings.map(({ key }) => key)).toEqual(
      MANUSCRIPT_SCREENING_CHECKS.map(({ key }) => key),
    );
    expect(summarizeScreeningFindings(findings)).toEqual({
      present: 0,
      weak: 0,
      absent: MANUSCRIPT_SCREENING_CHECKS.length,
    });
  });

  describe('open data (ODDPub)', () => {
    it('accepts a repository DOI and names the section it came from', () => {
      const result = finding(
        [
          section(
            'Data availability',
            'DATA_AVAILABILITY',
            'The processed aethalometer time series and the paired filter dataset are archived in the Zenodo repository at https://doi.org/10.5281/zenodo.10473921 (Jalil and Kazemian, 2024).',
          ),
        ],
        'OPEN_DATA',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.sectionName).toBe('Data availability');
      expect(result.evidence).toContain('zenodo.10473921');
    });

    it('accepts a deposit with an accession number', () => {
      expect(
        finding(
          [
            section(
              'Data availability',
              'DATA_AVAILABILITY',
              'Raw sequencing reads were deposited in the Gene Expression Omnibus under accession number GSE145926 and are publicly available.',
            ),
          ],
          'OPEN_DATA',
        ).verdict,
      ).toBe('PRESENT');
    });

    it('treats "available from the corresponding author on reasonable request" as weak, not present', () => {
      const result = finding(
        [
          section(
            'Data availability',
            'DATA_AVAILABILITY',
            'The data that support the findings of this study are available from the corresponding author upon reasonable request.',
          ),
        ],
        'OPEN_DATA',
      );

      expect(result.verdict).toBe('WEAK');
      expect(result.detail).toContain('on request');
      expect(result.evidence).toContain('upon reasonable request');
    });

    it('treats a supplement-only pointer as weak', () => {
      expect(
        finding(
          [
            section(
              'Data availability',
              'DATA_AVAILABILITY',
              'All data generated during this study are included in the supplementary information files.',
            ),
          ],
          'OPEN_DATA',
        ).verdict,
      ).toBe('WEAK');
    });

    it('prefers a real deposit over a request-only sentence in the same section', () => {
      expect(
        finding(
          [
            section(
              'Data availability',
              'DATA_AVAILABILITY',
              'Individual participant data are available from the corresponding author on reasonable request. The aggregated site-level dataset is deposited in the PANGAEA repository.',
            ),
          ],
          'OPEN_DATA',
        ).verdict,
      ).toBe('PRESENT');
    });

    it('does not let a code repository stand in for a missing data statement', () => {
      const result = finding(
        [
          section(
            'Code and data availability',
            'DATA_AVAILABILITY',
            'The AETH Modular source code is available at https://github.com/ahzs645/aethmodular. The published analysis should archive an immutable release, commit hash, and environment lock file.',
          ),
        ],
        'OPEN_DATA',
      );

      expect(result.verdict).toBe('ABSENT');
      expect(result.detail).toContain('Code and data availability');
      expect(result.detail).toContain('no sentence in it names a repository');
    });
  });

  describe('open code (ODDPub)', () => {
    it('accepts a repository URL in an availability section', () => {
      const result = finding(
        [
          section(
            'Code and data availability',
            'DATA_AVAILABILITY',
            'The AETH Modular source code is available at https://github.com/ahzs645/aethmodular.',
          ),
        ],
        'OPEN_CODE',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.evidence).toContain('github.com/ahzs645/aethmodular');
    });

    it('accepts a language and an archive without the word "code"', () => {
      expect(
        finding(
          [
            section(
              'Code availability',
              'DATA_AVAILABILITY',
              'All Python analyses are archived on Software Heritage and released under an MIT licence.',
            ),
          ],
          'OPEN_CODE',
        ).verdict,
      ).toBe('PRESENT');
    });

    it('does not read a GitHub URL in the reference list as a code statement', () => {
      const result = finding(
        [
          DISCUSSION,
          section(
            'References',
            'REFERENCES',
            'Drinkwater, A., Robinson, N. H., and Hardy, A.: Report of the 2019 workshop on FAIR software, available at https://github.com/fair-software/report, 2019.',
          ),
        ],
        'OPEN_CODE',
      );

      expect(result.verdict).toBe('ABSENT');
      expect(result.evidence).toBe('');
    });

    it('does not read another group’s repository, cited in the introduction, as this paper’s code', () => {
      expect(
        finding(
          [
            section(
              'Introduction',
              'INTRODUCTION',
              'Wilkinson et al. (2016) released their FAIR assessment scripts at https://github.com/fair-metrics/checklist, and the community has largely converged on that framework.',
            ),
          ],
          'OPEN_CODE',
        ).verdict,
      ).toBe('ABSENT');
    });

    it('does not read the software named in the methods as a code statement', () => {
      expect(
        finding(
          [
            section(
              'Methods',
              'METHODS',
              'Absorption coefficients were fitted with the R package openair (version 2.11), and aggregation was performed with pandas in Python 3.11.',
            ),
          ],
          'OPEN_CODE',
        ).verdict,
      ).toBe('ABSENT');
    });

    it('treats code offered on request as weak', () => {
      expect(
        finding(
          [
            section(
              'Code availability',
              'DATA_AVAILABILITY',
              'The analysis scripts are available from the authors upon reasonable request.',
            ),
          ],
          'OPEN_CODE',
        ).verdict,
      ).toBe('WEAK');
    });
  });

  describe('limitations (limitation-recognizer)', () => {
    it('accepts a dedicated limitations section', () => {
      const result = finding(
        [
          DISCUSSION,
          section(
            'Limitations',
            'OTHER',
            'The case study is limited by the availability and reliability of filter start/end metadata.',
          ),
        ],
        'LIMITATIONS',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.sectionName).toBe('Limitations');
      expect(result.evidence).toContain('filter start/end metadata');
    });

    it('accepts an explicit sentence inside the discussion', () => {
      const result = finding(
        [
          section(
            'Discussion',
            'DISCUSSION',
            'Our interpretation is consistent with earlier campaigns. This study has several limitations: the sites are urban, the filters are 24-hour integrals, and no independent gravimetric reference was available.',
          ),
        ],
        'LIMITATIONS',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.evidence).toContain('This study has several limitations');
    });

    it('does not count a passing remark about a method’s limitation', () => {
      const result = finding(
        [
          section(
            'Discussion',
            'DISCUSSION',
            'A known limitation of thermal–optical protocols is that the split between organic and elemental carbon depends on the analysis atmosphere (Chow et al., 2001). We therefore report both protocols side by side, and the agreement between them is unchanged by the aggregation window.',
          ),
        ],
        'LIMITATIONS',
      );

      expect(result.verdict).toBe('ABSENT');
      expect(result.detail).toContain('passing mention');
    });

    it('reports a limitations heading with nothing under it as weak', () => {
      expect(
        finding(
          [DISCUSSION, section('Limitations', 'OTHER', '  ')],
          'LIMITATIONS',
        ).verdict,
      ).toBe('WEAK');
    });
  });

  describe('trial registration (TrialIdentifier)', () => {
    it('surfaces every identifier it recognises and says verification needs a lookup', () => {
      const result = finding(
        [
          section(
            'Methods',
            'METHODS',
            'The trial was registered with ClinicalTrials.gov (NCT02796911) before the first participant was enrolled, and with the EU Clinical Trials Register (EudraCT 2016-001234-12).',
          ),
        ],
        'TRIAL_REGISTRATION',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.identifiers).toEqual(['NCT02796911', '2016-001234-12']);
      expect(result.detail).toContain('registry lookup');
    });

    it('recognises the other national registries', () => {
      expect(
        finding(
          [
            section(
              'Trial registration',
              'OTHER',
              'ISRCTN12345678; ChiCTR2000031733; ChiCTR-IOR-17010835; PACTR202001234567890; ACTRN12615000908529; UMIN000012345; DRKS00012345.',
            ),
          ],
          'TRIAL_REGISTRATION',
        ).identifiers,
      ).toEqual([
        'ISRCTN12345678',
        'ChiCTR2000031733',
        'ChiCTR-IOR-17010835',
        'PACTR202001234567890',
        'ACTRN12615000908529',
        'UMIN000012345',
        'DRKS00012345',
      ]);
    });

    it('reports a registration claim without an identifier as weak', () => {
      expect(
        finding(
          [
            section(
              'Methods',
              'METHODS',
              'The trial was registered prospectively before recruitment began.',
            ),
          ],
          'TRIAL_REGISTRATION',
        ).verdict,
      ).toBe('WEAK');
    });

    it('does not pick up a registration number cited in the reference list', () => {
      expect(
        finding(
          [
            DISCUSSION,
            section(
              'References',
              'REFERENCES',
              'RECOVERY Collaborative Group: Dexamethasone in hospitalized patients with Covid-19, N. Engl. J. Med., 384, 693–704, NCT04381936, 2021.',
            ),
          ],
          'TRIAL_REGISTRATION',
        ).verdict,
      ).toBe('ABSENT');
    });

    it('frames an absent registration as expected for anything that is not a trial', () => {
      expect(finding([DISCUSSION], 'TRIAL_REGISTRATION').detail).toContain(
        'Expected only if this reports a clinical trial',
      );
    });
  });

  describe('declarations (rtransparent)', () => {
    it('accepts a no-competing-interests declaration', () => {
      const result = finding(
        [
          section(
            'Competing interests',
            'CONFLICTS',
            'The authors declare that they have no conflict of interest.',
          ),
        ],
        'COMPETING_INTERESTS',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.evidence).toBe(
        'The authors declare that they have no conflict of interest.',
      );
    });

    it('reports an empty competing-interests section as weak, not present', () => {
      const result = finding(
        [section('Competing interests', 'CONFLICTS', '')],
        'COMPETING_INTERESTS',
      );

      expect(result.verdict).toBe('WEAK');
      expect(result.detail).toContain('empty heading');
    });

    it('reports a placeholder declaration as weak', () => {
      expect(
        finding(
          [section('Competing interests', 'CONFLICTS', 'TBD')],
          'COMPETING_INTERESTS',
        ).verdict,
      ).toBe('WEAK');
    });

    it('falls back to the submission-form declaration and says it is not in the text', () => {
      const result = finding(
        [DISCUSSION],
        'COMPETING_INTERESTS',
        'The authors declare no competing financial interests.',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.sectionName).toBe('Submission checklist');
      expect(result.detail).toContain('not in the manuscript text');
    });

    it('accepts a funding statement written into the acknowledgements', () => {
      const result = finding(
        [
          section(
            'Acknowledgements',
            'ACKNOWLEDGMENTS',
            'The authors thank the field and laboratory teams. This work was supported by the Natural Sciences and Engineering Research Council of Canada (RGPIN-2019-04853).',
          ),
        ],
        'FUNDING',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.evidence).toContain('Natural Sciences and Engineering');
    });

    it('accepts an explicit declaration that no funding was received', () => {
      expect(
        finding(
          [
            section(
              'Funding',
              'FUNDING',
              'This research received no specific grant from any funding agency in the public, commercial, or not-for-profit sectors.',
            ),
          ],
          'FUNDING',
        ).verdict,
      ).toBe('PRESENT');
    });

    it('does not read "supported by" in an acknowledgement as funding', () => {
      expect(
        finding(
          [
            section(
              'Acknowledgements',
              'ACKNOWLEDGMENTS',
              'We thank the field team for the sampling campaign, whose interpretation is supported by the co-located reference observations reported here.',
            ),
          ],
          'FUNDING',
        ).verdict,
      ).toBe('ABSENT');
    });

    it('accepts a pre-registered analysis plan', () => {
      const result = finding(
        [
          section(
            'Methods',
            'METHODS',
            'The analysis plan was pre-registered on the Open Science Framework (https://osf.io/8h4kq) before the filter archive was opened.',
          ),
        ],
        'PROTOCOL_REGISTRATION',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.evidence).toContain('osf.io/8h4kq');
    });

    it('mentions a found trial identifier when no protocol registration is stated', () => {
      expect(
        finding(
          [
            section(
              'Methods',
              'METHODS',
              'The trial was registered with ClinicalTrials.gov (NCT02796911).',
            ),
          ],
          'PROTOCOL_REGISTRATION',
        ).detail,
      ).toContain('NCT02796911');
    });
  });

  describe('ethics and consent (SciScore)', () => {
    it('surfaces the approving body and the protocol number', () => {
      const result = finding(
        [
          section(
            'Ethics',
            'ETHICS',
            'The study protocol was approved by the Research Ethics Board of the University of Northern British Columbia (protocol E2021.0412.041.00).',
          ),
        ],
        'ETHICS_APPROVAL',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.identifiers).toEqual(['E2021.0412.041.00']);
    });

    it('accepts a named board without a protocol number', () => {
      const result = finding(
        [
          section(
            'Ethics',
            'ETHICS',
            'All procedures were approved by the Institutional Review Board of Example University and conducted in accordance with the Declaration of Helsinki.',
          ),
        ],
        'ETHICS_APPROVAL',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.identifiers).toBeUndefined();
    });

    it('reports an unattributed approval as weak', () => {
      const result = finding(
        [section('Ethics', 'ETHICS', 'Ethical approval was obtained.')],
        'ETHICS_APPROVAL',
      );

      expect(result.verdict).toBe('WEAK');
      expect(result.detail).toContain('without naming the approving body');
    });

    it('accepts consent obtained from participants', () => {
      expect(
        finding(
          [
            section(
              'Ethics',
              'ETHICS',
              'Written informed consent was obtained from all participants before enrolment.',
            ),
          ],
          'INFORMED_CONSENT',
        ).verdict,
      ).toBe('PRESENT');
    });

    it('accepts a documented consent waiver', () => {
      expect(
        finding(
          [
            section(
              'Ethics',
              'ETHICS',
              'The requirement for informed consent was waived by the ethics committee because the analysis used de-identified administrative records.',
            ),
          ],
          'INFORMED_CONSENT',
        ).verdict,
      ).toBe('PRESENT');
    });

    it('reports a consent mention that never says it was obtained as weak', () => {
      expect(
        finding(
          [
            section(
              'Methods',
              'METHODS',
              'Informed consent procedures followed the study protocol and are described in the trial registration record.',
            ),
          ],
          'INFORMED_CONSENT',
        ).verdict,
      ).toBe('WEAK');
    });

    it('frames absent ethics and consent as expected outside human and animal work', () => {
      expect(finding([DISCUSSION], 'ETHICS_APPROVAL').detail).toContain(
        'Expected only for work involving humans or animals',
      );
      expect(finding([DISCUSSION], 'INFORMED_CONSENT').detail).toContain(
        'Expected only for work involving human participants',
      );
    });
  });

  describe('sections that are not part of the paper', () => {
    it('ignores a section the author has excluded from the export', () => {
      expect(
        screenManuscript({
          sections: [
            {
              id: 'draft-availability',
              name: 'Data availability',
              sectionType: 'DATA_AVAILABILITY',
              content:
                'The dataset is archived at https://doi.org/10.5281/zenodo.10473921.',
              includeInExport: false,
            },
          ],
        }).find(({ key }) => key === 'OPEN_DATA')?.verdict,
      ).toBe('ABSENT');
    });

    it('reads a statement written as Markdown, links and all', () => {
      const result = finding(
        [
          section(
            'Data availability',
            'DATA_AVAILABILITY',
            '**Data availability.** The measurement dataset is deposited in [the PANGAEA repository](https://doi.pangaea.de/10.1594/PANGAEA.945678) [@jalil2024data].',
          ),
        ],
        'OPEN_DATA',
      );

      expect(result.verdict).toBe('PRESENT');
      expect(result.evidence).not.toContain('[@jalil2024data]');
    });
  });

  describe('the AMT manuscript, end to end', () => {
    const amtSections = (): SectionLike[] =>
      parseWordDocument(buildAmtPaperWordMl(), {
        styles: parseWordStyleDefinitions(AMT_PAPER_STYLES_XML),
        imageByRelationshipId: AMT_PAPER_IMAGES,
      }).sections.map((imported, index) => ({
        id: `amt-${index}`,
        name: imported.name,
        sectionType: imported.sectionType,
        placement: imported.placement,
        content: imported.content,
      }));

    const amtFinding = (key: ScreeningCheckKey): ScreeningFinding =>
      finding(amtSections(), key);

    it('finds the code repository, the limitations section and the interests declaration', () => {
      expect(amtFinding('OPEN_CODE')).toMatchObject({
        verdict: 'PRESENT',
        sectionName: 'Code and data availability',
      });
      expect(amtFinding('OPEN_CODE').evidence).toContain(
        'https://github.com/ahzs645/aethmodular',
      );
      expect(amtFinding('LIMITATIONS')).toMatchObject({
        verdict: 'PRESENT',
        sectionName: 'Limitations',
      });
      expect(amtFinding('COMPETING_INTERESTS')).toMatchObject({
        verdict: 'PRESENT',
        sectionName: 'Competing interests',
        evidence: 'The authors declare that they have no conflict of interest.',
      });
    });

    it('reports that its "Code and data availability" section never says where the data are', () => {
      const result = amtFinding('OPEN_DATA');

      expect(result.verdict).toBe('ABSENT');
      expect(result.detail).toContain('Code and data availability');
    });

    it('reports the statements a Copernicus paper of this kind still lacks', () => {
      expect(
        Object.fromEntries(
          screen(amtSections())
            .filter(({ verdict }) => verdict !== 'PRESENT')
            .map(({ key, verdict }) => [key, verdict]),
        ),
      ).toEqual({
        OPEN_DATA: 'ABSENT',
        TRIAL_REGISTRATION: 'ABSENT',
        FUNDING: 'ABSENT',
        PROTOCOL_REGISTRATION: 'ABSENT',
        ETHICS_APPROVAL: 'ABSENT',
        INFORMED_CONSENT: 'ABSENT',
      });
    });
  });
});
