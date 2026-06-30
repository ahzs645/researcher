import {
  applicationSectionsFromMarkdown,
  classifyApplicationHeading,
} from '../researchApplicationImport';

describe('classifyApplicationHeading', () => {
  it('maps proposal headings to canonical application content types', () => {
    expect(classifyApplicationHeading('Lay Summary')).toBe('LAY_SUMMARY');
    expect(classifyApplicationHeading('1. Background and Rationale')).toBe(
      'BACKGROUND',
    );
    expect(classifyApplicationHeading('Research Objectives')).toBe('OBJECTIVES');
    expect(classifyApplicationHeading('Methodology')).toBe('METHODOLOGY');
    expect(classifyApplicationHeading('Knowledge Translation & Impact')).toBe(
      'IMPACT',
    );
    expect(classifyApplicationHeading('Budget Justification')).toBe(
      'BUDGET_JUSTIFICATION',
    );
    expect(classifyApplicationHeading('Workplan and Timeline')).toBe('TIMELINE');
    expect(classifyApplicationHeading('Team and Expertise')).toBe('TEAM');
    expect(classifyApplicationHeading('EDI Considerations')).toBe('EDI');
  });

  it('falls back to OTHER', () => {
    expect(classifyApplicationHeading('Random heading')).toBe('OTHER');
  });
});

describe('applicationSectionsFromMarkdown', () => {
  it('turns a proposal document into application-section drafts', () => {
    const drafts = applicationSectionsFromMarkdown(
      [
        '# Air Quality Monitoring Proposal',
        '',
        '## Lay Summary',
        'We will place sensors in schools.',
        '',
        '## Objectives',
        'Quantify classroom PM2.5 exposure.',
        '',
        '## Budget Justification',
        'Sensors cost $200 each.',
      ].join('\n'),
    );
    expect(drafts.map((draft) => draft.sectionType)).toEqual([
      'LAY_SUMMARY',
      'OBJECTIVES',
      'BUDGET_JUSTIFICATION',
    ]);
    expect(drafts.every((draft) => draft.status === 'DRAFTING')).toBe(true);
    expect(drafts[0].wordCount).toBeGreaterThan(0);
    expect(drafts.map((d) => d.orderIndex)).toEqual([0, 1, 2]);
  });
});
