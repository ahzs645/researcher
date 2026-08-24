import { parseMarkdownDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  detectCitationStyle,
  parseReferenceList,
  reconcileImportedCitations,
} from '@/local-db/research/manuscript/manuscriptCitationReconcile';
import { formatReferenceEntry } from '@/local-db/research/manuscript/manuscriptCitations';

describe('detectCitationStyle', () => {
  it('distinguishes numeric from author-date bodies', () => {
    expect(detectCitationStyle('as shown [1] and [2,3]')).toBe('numeric');
    expect(detectCitationStyle('as shown (Smith, 2020)')).toBe('author-date');
    expect(detectCitationStyle('no citations here')).toBe('none');
  });
});

describe('parseReferenceList', () => {
  it('parses a numbered list into drafts with keys, year and DOI', () => {
    const entries = parseReferenceList(
      [
        '1. Mendell, M. J.; et al. Classroom ventilation. Indoor Air 2013, 23, 515-528. doi:10.1111/ina.12042',
        '2. Fuzzi, S.; et al. Particulate matter. Atmos. Chem. Phys. 2015, 15, 8217-8299.',
      ].join('\n'),
    );
    expect(entries.map((e) => e.index)).toEqual([1, 2]);
    expect(entries.map((e) => e.draft.citationKey)).toEqual([
      'mendell2013',
      'fuzzi2015',
    ]);
    expect(entries[0].draft.doi).toBe('10.1111/ina.12042');
    expect(entries[0].draft.year).toBe(2013);
    expect(entries[0].draft.cslJson).toContain('researcher:rawReference');
    expect(entries[0].draft.cslJson).toContain('"researcher:referenceIndex":1');
    expect(
      formatReferenceEntry(
        { id: 'imported-reference', ...entries[0].draft },
        undefined,
        'AUTHOR_DATE',
      ),
    ).toBe(
      'Mendell, M. J.; et al. Classroom ventilation. Indoor Air 2013, 23, 515-528. doi:10.1111/ina.12042',
    );
    // The raw entry is preserved so an imperfect parse is never lossy.
    expect(entries[0].draft.notes).toContain('Indoor Air');
  });

  it('preserves institutional and web references that do not state a year', () => {
    const entries = parseReferenceList(
      'U.S. Environmental Protection Agency. Positive Matrix Factorization model. https://www.epa.gov/air-research',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].draft.year).toBeNull();
    expect(entries[0].draft.notes).toContain('Environmental Protection Agency');
  });

  it('keeps a DOI whose suffix carries balanced parentheses', () => {
    const [entry] = parseReferenceList(
      'Weingartner, E., et al. (2003). Absorption of light by soot particles. Journal of Aerosol Science, 34, 1445–1463. https://doi.org/10.1016/S0021-8502(03)00359-8',
    );
    expect(entry.draft.doi).toBe('10.1016/S0021-8502(03)00359-8');
    // A closing bracket that nothing inside the DOI opened still ends it.
    const [wrapped] = parseReferenceList(
      'Smith, J. (2019). A paper (doi:10.1000/abc-123).',
    );
    expect(wrapped.draft.doi).toBe('10.1000/abc-123');
  });

  it('keeps accented family names, and keys them without the accent', () => {
    const [entry] = parseReferenceList(
      'Düsing, S., Wehner, B., and Müller, T. (2019). The effect of rapid relative humidity changes. Atmospheric Measurement Techniques, 12, 5879–5895. https://doi.org/10.5194/amt-12-5879-2019',
    );
    expect(entry.draft.authors).toBe('Düsing, S.; Wehner, B.; Müller, T.');
    expect(entry.draft.citationKey).toBe('dusing2019');
  });

  it('keeps the year suffix that tells two same-year papers apart', () => {
    const entries = parseReferenceList(
      [
        'Weakley, A. T., Takahama, S., Wexler, A. S., and Dillner, A. M. (2018a). Ambient aerosol composition by infrared spectroscopy. Aerosol Science and Technology, 52, 642–654. https://doi.org/10.1080/02786826.2018.1439571',
        'Weakley, A. T., Takahama, S., and Dillner, A. M. (2018b). Thermal/optical reflectance equivalent organic and elemental carbon. Aerosol Science and Technology, 52, 1048–1058. https://doi.org/10.1080/02786826.2018.1504161',
      ].join('\n'),
    );
    expect(entries.map((entry) => entry.draft.citationKey)).toEqual([
      'weakley2018a',
      'weakley2018b',
    ]);
    // The year inside each DOI is not the entry's year, and not its title.
    expect(entries[1].draft.year).toBe(2018);
    expect(entries[1].draft.name).toBe(
      'Thermal/optical reflectance equivalent organic and elemental carbon',
    );
  });

  it('reads a title out of the Copernicus "Authors: Title, Journal" form', () => {
    const [entry] = parseReferenceList(
      'Bond, T. C., Doherty, S. J., and Fahey, D. W.: Bounding the role of black carbon in the climate system: A scientific assessment, J. Geophys. Res.-Atmos., 118, 5380–5552, https://doi.org/10.1002/jgrd.50171, 2013.',
    );
    expect(entry.draft.name).toBe(
      'Bounding the role of black carbon in the climate system: A scientific assessment',
    );
    expect(entry.draft.year).toBe(2013);
  });
});

describe('reconcileImportedCitations', () => {
  it('relinks numeric [n], [n,m] and [n-m] to [@key]', () => {
    const doc = parseMarkdownDocument(
      [
        '## Introduction',
        'Attendance drops [1]. Ventilation helps [1,2]. Range [1-2].',
        '## References',
        '1. Mendell, M. J. Indoor Air 2013, 23, 515-528.',
        '2. Fuzzi, S. Atmos Chem Phys 2015, 15, 8217-8299.',
      ].join('\n'),
    );
    const result = reconcileImportedCitations(doc.sections);
    expect(result.style).toBe('numeric');
    expect(result.references).toHaveLength(2);
    const intro = result.sections.find((s) => s.sectionType === 'INTRODUCTION');
    expect(intro?.content).toContain('[@mendell2013]');
    expect(intro?.content).toContain('[@mendell2013; @fuzzi2015]');
    expect(result.linkedCount).toBeGreaterThanOrEqual(4);
  });

  it('relinks author-date (Author et al., Year), including grouped cites', () => {
    const doc = parseMarkdownDocument(
      [
        '## Introduction',
        'Helps (Mendell et al., 2013). Both (Mendell et al., 2013; Fuzzi et al., 2015).',
        '## References',
        'Mendell, M. J. (2013). Classroom ventilation. Indoor Air, 23, 515-528.',
        'Fuzzi, S. (2015). Particulate matter. Atmos Chem Phys, 15, 8217-8299.',
      ].join('\n'),
    );
    const result = reconcileImportedCitations(doc.sections);
    expect(result.style).toBe('author-date');
    const intro = result.sections.find((s) => s.sectionType === 'INTRODUCTION');
    expect(intro?.content).toContain('[@mendell2013]');
    expect(intro?.content).toContain('[@mendell2013; @fuzzi2015]');
  });

  it('links a narrative citation with the author suppressed', () => {
    const doc = parseMarkdownDocument(
      [
        '## Introduction',
        'Following Petzold et al. (2013), report eBC. Weakley et al. (2018a, b) calibrated it.',
        '## References',
        'Petzold, A., Ogren, J. A., and Fiebig, M. (2013). Recommendations for reporting black carbon measurements. Atmos Chem Phys, 13, 8365-8379.',
        'Weakley, A. T., and Dillner, A. M. (2018a). Ambient aerosol composition by infrared spectroscopy. Aerosol Sci Technol, 52, 642-654.',
        'Weakley, A. T., and Dillner, A. M. (2018b). Thermal/optical reflectance equivalent carbon. Aerosol Sci Technol, 52, 1048-1058.',
      ].join('\n'),
    );
    const result = reconcileImportedCitations(doc.sections);
    const intro = result.sections.find((s) => s.sectionType === 'INTRODUCTION');
    // The prose already names the author, so the citation renders the year.
    expect(intro?.content).toContain(
      'Following Petzold et al. [-@petzold2013]',
    );
    // "2018a, b" is two papers, not one.
    expect(intro?.content).toContain(
      'Weakley et al. [-@weakley2018a; -@weakley2018b]',
    );
  });

  it('is a no-op when there is no References section', () => {
    const doc = parseMarkdownDocument('## Intro\nText with [1].');
    const result = reconcileImportedCitations(doc.sections);
    expect(result.references).toHaveLength(0);
    expect(result.style).toBe('none');
    expect(result.sections).toEqual(doc.sections);
  });
});
