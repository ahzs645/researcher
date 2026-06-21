import { buildApplicantProfile } from '@/local-db/research/researchApplicationProfile';

describe('buildApplicantProfile', () => {
  it('prefers the canonical profile and falls back to researcher/team', () => {
    const profile = buildApplicantProfile({
      profile: {
        fullName: 'Dr. Maya Okafor',
        email: 'maya@example.org',
        institution: 'UBC',
        discipline: 'Condensed-matter physics',
      },
      researcher: { name: 'Maya', email: 'old@example.org', orcid: '0000-1' },
      team: { name: 'Quantum Lab', institution: 'Ignored' },
      application: { organization: 'Quantum Materials Lab' },
    });

    const byKey = Object.fromEntries(
      profile.fields.map((field) => [field.key, field.value]),
    );
    expect(byKey.fullName).toBe('Dr. Maya Okafor');
    expect(byKey.firstName).toBe('Dr.');
    expect(byKey.lastName).toBe('Maya Okafor');
    // Profile email wins over researcher email.
    expect(byKey.email).toBe('maya@example.org');
    // Application organization wins over institution fields.
    expect(byKey.organizationName).toBe('Quantum Materials Lab');
    // orcid only on the researcher still flows through.
    expect(byKey.orcid).toBe('0000-1');
    expect(byKey.fieldOfStudy).toBe('Condensed-matter physics');
  });

  it('maps the project + application into project/amount fields', () => {
    const profile = buildApplicantProfile({
      project: { name: 'Topological insulators', summary: 'TI films' },
      application: { amountRequested: 300000, projectSummary: 'Override' },
    });
    const byKey = Object.fromEntries(
      profile.fields.map((field) => [field.key, field.value]),
    );
    expect(byKey.projectTitle).toBe('Topological insulators');
    // Application summary takes precedence over the project summary.
    expect(byKey.projectSummary).toBe('Override');
    expect(byKey.amountRequested).toBe('300000');
  });

  it('drops empty values so they never overwrite a real field', () => {
    const profile = buildApplicantProfile({
      profile: { fullName: 'Sofia Reyes', phone: '', city: '   ' },
    });
    const keys = profile.fields.map((field) => field.key);
    expect(keys).toContain('fullName');
    expect(keys).not.toContain('phone');
    expect(keys).not.toContain('city');
  });

  it('returns an empty profile when given nothing', () => {
    expect(buildApplicantProfile({}).fields).toHaveLength(0);
  });
});
