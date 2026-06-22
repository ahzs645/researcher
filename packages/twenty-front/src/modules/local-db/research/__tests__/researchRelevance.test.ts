import {
  assessOpportunity,
  relevanceVerdictForRecord,
  type ResearchProfile,
} from '@/local-db/research/researchRelevance';

// A fixed "now" so deadline math is deterministic across runs.
const NOW = new Date('2026-06-21T00:00:00.000Z');

const doctoralCanadian: ResearchProfile = {
  interests: ['quantum', 'materials', 'physics'],
  knownFunders: ['NSERC'],
  careerStage: 'DOCTORAL',
  citizenship: 'Canadian',
};

describe('assessOpportunity', () => {
  it('marks a strong, eligible, in-time opportunity as ELIGIBLE', () => {
    const assessment = assessOpportunity(
      {
        topicTags: ['quantum', 'materials', 'physics'],
        funder: 'NSERC',
        program: 'CGS-D',
        eligibility: 'Doctoral students in natural sciences',
        eligibilityNotes: 'Open to Canadian citizens and permanent residents.',
        careerStage: 'DOCTORAL',
        opportunityKind: 'SCHOLARSHIP',
        applicationDueDate: '2026-10-01T00:00:00.000Z',
      },
      doctoralCanadian,
      { now: NOW },
    );

    expect(assessment.fitScore).toBeGreaterThanOrEqual(4);
    expect(assessment.eligibilityVerdict).toBe('ELIGIBLE');
    expect(assessment.deadline).toBe('FEASIBLE');
    expect(assessment.relevanceScore).toBeGreaterThanOrEqual(4);
    expect(relevanceVerdictForRecord(assessment)).toBe('ELIGIBLE');
  });

  it('hard-fails on a career-stage mismatch', () => {
    const assessment = assessOpportunity(
      {
        topicTags: ['quantum', 'materials', 'physics'],
        funder: 'Government of Canada',
        program: 'Banting',
        careerStage: 'POSTDOCTORAL',
        eligibilityNotes: 'For postdoctoral researchers.',
        applicationDueDate: '2026-09-20T00:00:00.000Z',
      },
      doctoralCanadian,
      { now: NOW },
    );

    expect(assessment.eligibilityVerdict).toBe('INELIGIBLE');
    expect(assessment.relevanceScore).toBe(1);
    expect(assessment.relevanceReason).toMatch(/postdoctoral/i);
    expect(relevanceVerdictForRecord(assessment)).toBe('INELIGIBLE');
  });

  it('is ineligible when a citizenship restriction excludes the applicant', () => {
    const international: ResearchProfile = {
      interests: ['quantum'],
      knownFunders: [],
      careerStage: 'DOCTORAL',
      citizenship: 'International (India)',
    };
    const assessment = assessOpportunity(
      {
        topicTags: ['quantum'],
        careerStage: 'DOCTORAL',
        eligibilityNotes:
          'Restricted to Canadian citizens and permanent residents.',
        applicationDueDate: '2026-10-01T00:00:00.000Z',
      },
      international,
      { now: NOW },
    );
    expect(assessment.eligibilityVerdict).toBe('INELIGIBLE');
    expect(assessment.relevanceReason).toMatch(/citizen/i);
  });

  it('defers to review (UNKNOWN) when a restriction applies but citizenship is unset', () => {
    const noCitizenship: ResearchProfile = {
      interests: ['quantum'],
      knownFunders: [],
      careerStage: 'DOCTORAL',
    };
    const assessment = assessOpportunity(
      {
        topicTags: ['quantum'],
        careerStage: 'DOCTORAL',
        eligibilityNotes: 'Canadian citizens and permanent residents only.',
        applicationDueDate: '2026-10-01T00:00:00.000Z',
      },
      noCitizenship,
      { now: NOW },
    );
    expect(assessment.eligibilityVerdict).toBe('UNKNOWN');
    expect(relevanceVerdictForRecord(assessment)).toBe('UNKNOWN');
  });

  it('zeroes relevance when the deadline has passed', () => {
    const assessment = assessOpportunity(
      {
        topicTags: ['quantum', 'materials', 'physics'],
        funder: 'NSERC',
        careerStage: 'ANY',
        applicationDueDate: '2026-01-01T00:00:00.000Z',
      },
      doctoralCanadian,
      { now: NOW },
    );
    expect(assessment.deadline).toBe('PASSED');
    expect(assessment.relevanceScore).toBe(1);
    expect(relevanceVerdictForRecord(assessment)).toBe('INELIGIBLE');
  });

  it('flags a tight deadline and lists what you would need', () => {
    const assessment = assessOpportunity(
      {
        topicTags: ['quantum'],
        careerStage: 'ANY',
        opportunityKind: 'SCHOLARSHIP',
        eligibilityNotes: 'Candidates must be nominated by their institution.',
        applicationDueDate: '2026-07-01T00:00:00.000Z',
      },
      doctoralCanadian,
      { now: NOW },
    );
    expect(assessment.deadline).toBe('TIGHT');
    expect(assessment.whatYouNeed).toEqual(
      expect.arrayContaining(['Institutional nomination']),
    );
  });
});
