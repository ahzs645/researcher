import { parseMarkdownDocument } from '../manuscriptDocImport';
import {
  detectCitationStyle,
  parseReferenceList,
  reconcileImportedCitations,
} from '../manuscriptCitationReconcile';

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
    // The raw entry is preserved so an imperfect parse is never lossy.
    expect(entries[0].draft.notes).toContain('Indoor Air');
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

  it('is a no-op when there is no References section', () => {
    const doc = parseMarkdownDocument('## Intro\nText with [1].');
    const result = reconcileImportedCitations(doc.sections);
    expect(result.references).toHaveLength(0);
    expect(result.style).toBe('none');
    expect(result.sections).toEqual(doc.sections);
  });
});
