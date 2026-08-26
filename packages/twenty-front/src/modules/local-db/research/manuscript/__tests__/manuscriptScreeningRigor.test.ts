import {
  parseWordDocument,
  parseWordStyleDefinitions,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  MANUSCRIPT_SCREENING_CHECKS,
  runManuscriptScreening,
  screenManuscript,
  type ScreeningCheckKey,
  type ScreeningFinding,
} from '@/local-db/research/manuscript/manuscriptScreening';
import { buildScreeningReport } from '@/local-db/research/manuscript/manuscriptScreeningChecks';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

import {
  AMT_PAPER_IMAGES,
  AMT_PAPER_STYLES_XML,
  buildAmtPaperWordMl,
} from './fixtures/amtPaperWordMl';

const methods = (content: string): SectionLike[] => [
  { id: 'methods', name: 'Methods', sectionType: 'METHODS', content },
];

const finding = (
  sections: SectionLike[],
  key: ScreeningCheckKey,
): ScreeningFinding => {
  const match = screenManuscript({ sections }).find(
    (candidate) => candidate.key === key,
  );
  if (match === undefined) throw new Error(`${key} declined to report`);
  return match;
};

const declinedKeys = (sections: SectionLike[]): ScreeningCheckKey[] =>
  runManuscriptScreening({ sections }).declinations.map(({ key }) => key);

const RIGOR_KEYS: ScreeningCheckKey[] = [
  'RANDOMISATION',
  'BLINDING',
  'SEX_AS_BIOLOGICAL_VARIABLE',
  'POWER_ANALYSIS',
  'CELL_LINE_AUTHENTICATION',
  'MYCOPLASMA_TESTING',
  'RESOURCE_IDENTIFIERS',
];

const ANIMAL_TRIAL = methods(
  'Sixty male and female C57BL/6 mice were randomly assigned to three treatment groups using a computer-generated randomisation sequence. ' +
    'Outcome assessors were blinded to the group allocation until the database was locked. ' +
    'An a priori power analysis showed that twenty animals per group would give 80% power to detect a 20% difference at alpha = 0.05.',
);

const CELL_STUDY = methods(
  'HeLa cells were obtained from ATCC, authenticated by STR profiling before use, and tested negative for mycoplasma every month. ' +
    'Immunostaining used an anti-tubulin antibody (RRID:AB_2298772) at a dilution of 1:1000.',
);

describe('SciScore rigor criteria', () => {
  describe('a biomedical methods section', () => {
    it('finds randomisation, blinding, sex and power in an animal experiment', () => {
      expect(finding(ANIMAL_TRIAL, 'RANDOMISATION')).toMatchObject({
        verdict: 'PRESENT',
        tool: 'SciScore',
        sectionName: 'Methods',
      });
      expect(finding(ANIMAL_TRIAL, 'RANDOMISATION').evidence).toContain(
        'randomly assigned',
      );
      expect(finding(ANIMAL_TRIAL, 'BLINDING').verdict).toBe('PRESENT');
      expect(finding(ANIMAL_TRIAL, 'BLINDING').detail).toContain(
        'blinded party is named',
      );
      expect(finding(ANIMAL_TRIAL, 'SEX_AS_BIOLOGICAL_VARIABLE').verdict).toBe(
        'PRESENT',
      );
      expect(finding(ANIMAL_TRIAL, 'POWER_ANALYSIS').verdict).toBe('PRESENT');
    });

    it('finds authentication, the mycoplasma test and the RRID in a cell study', () => {
      expect(finding(CELL_STUDY, 'CELL_LINE_AUTHENTICATION').verdict).toBe(
        'PRESENT',
      );
      expect(finding(CELL_STUDY, 'MYCOPLASMA_TESTING').verdict).toBe('PRESENT');
      expect(finding(CELL_STUDY, 'RESOURCE_IDENTIFIERS')).toMatchObject({
        verdict: 'PRESENT',
        identifiers: ['RRID:AB_2298772'],
      });
    });

    it('reports a claim without a method as weak rather than found', () => {
      const trial = methods(
        'This randomised controlled trial enrolled 240 patients with type 2 diabetes. ' +
          'The study was blinded throughout. ' +
          'The sample size was based on previous studies of a similar design. ' +
          'Male Sprague-Dawley rats were used for the pharmacokinetic sub-study.',
      );

      expect(finding(trial, 'RANDOMISATION')).toMatchObject({
        verdict: 'WEAK',
        detail: expect.stringContaining('without saying what was assigned'),
      });
      expect(finding(trial, 'BLINDING')).toMatchObject({
        verdict: 'WEAK',
        detail: expect.stringContaining('without saying who was blinded'),
      });
      expect(finding(trial, 'POWER_ANALYSIS')).toMatchObject({
        verdict: 'WEAK',
        detail: expect.stringContaining('not calculated'),
      });
      expect(finding(trial, 'SEX_AS_BIOLOGICAL_VARIABLE')).toMatchObject({
        verdict: 'WEAK',
        detail: expect.stringContaining('does not say why'),
      });
    });

    it('treats provenance and a catalogue number as weaker than identity', () => {
      const cultures = methods(
        'A549 cells were purchased from ATCC and cultured in DMEM. ' +
          'Cultures were checked for mycoplasma. ' +
          'An anti-GAPDH antibody (catalogue number ab9485) was used for loading controls.',
      );

      expect(finding(cultures, 'CELL_LINE_AUTHENTICATION')).toMatchObject({
        verdict: 'WEAK',
        detail: expect.stringContaining('provenance is not identity'),
      });
      expect(finding(cultures, 'MYCOPLASMA_TESTING').verdict).toBe('WEAK');
      expect(finding(cultures, 'RESOURCE_IDENTIFIERS')).toMatchObject({
        verdict: 'WEAK',
        detail: expect.stringContaining('RRID'),
      });
    });

    it('counts a stated absence of randomisation or blinding as a report', () => {
      const observational = methods(
        'Patients were not randomised; consecutive admissions were enrolled. ' +
          'The trial was open-label because the two devices are visibly different.',
      );

      expect(finding(observational, 'RANDOMISATION')).toMatchObject({
        verdict: 'PRESENT',
        detail: expect.stringContaining('not randomised'),
      });
      expect(finding(observational, 'BLINDING')).toMatchObject({
        verdict: 'PRESENT',
        detail: expect.stringContaining('not blinded'),
      });
    });

    it('reports what a biomedical paper is missing rather than declining', () => {
      const thin = methods(
        'Twenty patients with stage II disease were enrolled and received the intervention for twelve weeks.',
      );

      // A clinical study that names no antibody, cell line or organism has no
      // key biological resource to identify, so the RRID check declines with
      // the two culture checks — the criteria are scoped one at a time, not by
      // one global "is this biomedical" flag.
      expect(declinedKeys(thin)).toEqual([
        'CELL_LINE_AUTHENTICATION',
        'MYCOPLASMA_TESTING',
        'RESOURCE_IDENTIFIERS',
        'FIGURE_DOCUMENTATION',
      ]);
      expect(finding(thin, 'RANDOMISATION').verdict).toBe('ABSENT');
      expect(finding(thin, 'BLINDING').verdict).toBe('ABSENT');
      expect(finding(thin, 'POWER_ANALYSIS').verdict).toBe('ABSENT');
    });
  });

  // The point of the whole applicability machinery: this app was proven
  // against a Copernicus atmospheric-measurement paper, and a panel that told
  // its author their aerosol study failed cell-line authentication would be
  // worse than no panel at all.
  describe('a manuscript the criteria are not about', () => {
    const AEROSOL = methods(
      'Filter samples were collected every 24 hours on quartz fibre filters and analysed by the thermal-optical transmittance protocol. ' +
        'Aethalometer attenuation was converted to black carbon mass using a site-specific mass absorption cross-section. ' +
        'Random measurement error was propagated through the calibration.',
    );

    it('declines every rigor check rather than reporting seven absences', () => {
      expect(declinedKeys(AEROSOL)).toEqual([
        ...RIGOR_KEYS,
        'FIGURE_DOCUMENTATION',
      ]);
      expect(
        screenManuscript({ sections: AEROSOL }).map(({ key }) => key),
      ).not.toContain('RANDOMISATION');
    });

    it('says why it declined, in words meant for the author', () => {
      const reasons = Object.fromEntries(
        runManuscriptScreening({ sections: AEROSOL }).declinations.map(
          ({ key, reason }) => [key, reason],
        ),
      );

      expect(reasons.RANDOMISATION).toContain(
        'No experiments on people or animals are described',
      );
      expect(reasons.CELL_LINE_AUTHENTICATION).toContain(
        'No cultured cells are described',
      );
      expect(reasons.RESOURCE_IDENTIFIERS).toContain(
        'no key biological resources to identify',
      );
    });

    it('is not fooled by "random" said of measurement error', () => {
      expect(declinedKeys(AEROSOL)).toContain('RANDOMISATION');
    });

    it('declines on the AMT manuscript itself', () => {
      const amtSections: SectionLike[] = parseWordDocument(
        buildAmtPaperWordMl(),
        {
          styles: parseWordStyleDefinitions(AMT_PAPER_STYLES_XML),
          imageByRelationshipId: AMT_PAPER_IMAGES,
        },
      ).sections.map((imported, index) => ({
        id: `amt-${index}`,
        name: imported.name,
        sectionType: imported.sectionType,
        content: imported.content,
      }));

      expect(declinedKeys(amtSections)).toEqual([
        ...RIGOR_KEYS,
        'FIGURE_DOCUMENTATION',
      ]);
    });
  });

  // Declining is a claim about what the manuscript describes, and a manuscript
  // with nothing in it supports no claim. Absence of a cue in prose is evidence
  // the study has no cell lines; absence of a cue in an empty manuscript is
  // absence of information, and screening must not launder one into the other.
  describe('a manuscript with nothing to read', () => {
    it('reports every check, declining none', () => {
      const run = runManuscriptScreening({ sections: [] });

      expect(run.declinations).toEqual([]);
      expect(run.findings.map(({ key }) => key)).toEqual(
        MANUSCRIPT_SCREENING_CHECKS.map(({ key }) => key),
      );
      expect(run.findings.every(({ verdict }) => verdict === 'ABSENT')).toBe(
        true,
      );
    });

    it('reports every check for a manuscript whose sections are all empty', () => {
      expect(
        runManuscriptScreening({
          sections: [
            {
              id: 'methods',
              name: 'Methods',
              sectionType: 'METHODS',
              content: '',
            },
          ],
        }).declinations,
      ).toEqual([]);
    });
  });

  describe('the screening report', () => {
    it('names the checks that did not apply instead of dropping them', () => {
      const run = runManuscriptScreening({
        sections: methods(
          'Filter samples were collected on quartz fibre filters and analysed by thermal-optical transmittance.',
        ),
      });
      const report = buildScreeningReport(run.findings, 'An aerosol paper', {
        declinations: run.declinations,
      });

      expect(report).toContain('Not applicable to this manuscript');
      expect(report).toContain(
        'Cell line authentication · SciScore — No cultured cells are described',
      );
      expect(report).not.toContain('[ABSENT] Randomisation of subjects');
    });

    it('leaves the report unchanged when no declinations are passed', () => {
      const findings = screenManuscript({ sections: ANIMAL_TRIAL });

      expect(buildScreeningReport(findings, 'An animal study')).not.toContain(
        'Not applicable to this manuscript',
      );
    });
  });
});
