import {
  buildApplicationPlan,
  parseAmountText,
} from '@/local-db/research/researchStartApplication';

describe('parseAmountText', () => {
  it('extracts a dollar figure', () => {
    expect(parseAmountText('Up to $300,000')).toBe(300000);
    expect(parseAmountText('$15,000 per 4-month unit')).toBe(15000);
    expect(parseAmountText('$50,000 / year for 3 years')).toBe(50000);
  });

  it('returns null when there is no parseable amount', () => {
    expect(parseAmountText('Negotiated')).toBeNull();
    expect(parseAmountText('Varies')).toBeNull();
    expect(parseAmountText(null)).toBeNull();
  });
});

describe('buildApplicationPlan', () => {
  it('links a grant application to its opportunity and context', () => {
    const plan = buildApplicationPlan(
      {
        id: 'opp-1',
        name: 'Quantum technologies for health',
        funder: 'CIHR',
        program: 'Team Grant',
        opportunityKind: 'GRANT',
        amountText: 'Up to $1,500,000 over 5 years',
        applicationDueDate: '2026-09-15T00:00:00.000Z',
      },
      { projectId: 'proj-1', applicantId: 'res-1', organization: 'My Lab' },
    );

    expect(plan.application.opportunityId).toBe('opp-1');
    expect(plan.application.projectId).toBe('proj-1');
    expect(plan.application.applicantId).toBe('res-1');
    expect(plan.application.organization).toBe('My Lab');
    expect(plan.application.status).toBe('DRAFTING');
    expect(plan.application.amountRequested).toBe(1500000);
    // GRANT checklist + sections.
    expect(plan.requirements.length).toBeGreaterThanOrEqual(4);
    expect(plan.requirements.every((r) => r.status === 'NEEDED')).toBe(true);
    expect(plan.sections.map((s) => s.sectionType)).toEqual(
      expect.arrayContaining([
        'ABSTRACT',
        'BUDGET_JUSTIFICATION',
        'METHODOLOGY',
      ]),
    );
    expect(plan.sections.every((s) => s.status === 'NOT_STARTED')).toBe(true);
  });

  it('uses a scholarship-shaped checklist and sections for a scholarship', () => {
    const plan = buildApplicationPlan({
      id: 'opp-2',
      name: 'Vanier CGS',
      opportunityKind: 'SCHOLARSHIP',
      amountText: '$50,000 / year',
      applicationDueDate: '2026-11-01T00:00:00.000Z',
    });

    const requirementNames = plan.requirements.map((r) => r.name.toLowerCase());
    expect(requirementNames.join(' ')).toMatch(/transcript/);
    expect(requirementNames.join(' ')).toMatch(/reference/);
    expect(plan.sections.map((s) => s.sectionType)).toEqual(
      expect.arrayContaining(['LAY_SUMMARY', 'BIO']),
    );
  });

  it('stamps the funder/program onto the application notes', () => {
    const plan = buildApplicationPlan({
      id: 'opp-3',
      name: 'X',
      funder: 'NSERC',
      program: 'CGS-D',
      opportunityKind: 'SCHOLARSHIP',
    });
    expect(plan.application.notes).toBe('NSERC · CGS-D');
    // No parseable amount → null, not a crash.
    expect(plan.application.amountRequested).toBeNull();
  });
});
