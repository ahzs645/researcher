import {
  buildSeededTeamProfile,
  scoreOpportunity,
  type TeamProfile,
} from '@/local-db/research/researchOpportunityMatching';

describe('opportunity matching', () => {
  const profile: TeamProfile = {
    interests: ['quantum materials', 'spintronics', 'health'],
    knownFunders: ['Innovate BC', 'CIHR'],
  };

  it('scores high for strong topic + funder overlap', () => {
    const match = scoreOpportunity(
      {
        topicTags: ['quantum', 'spintronics'],
        funder: 'Innovate BC',
        program: 'Ignite',
        eligibility: 'BC-based quantum research',
      },
      profile,
    );
    expect(match.fitScore).toBeGreaterThanOrEqual(4);
    expect(match.matchedInterests.length).toBeGreaterThan(0);
    expect(match.reasons.join(' ')).toMatch(/funder/i);
  });

  it('scores low with no overlap', () => {
    const match = scoreOpportunity(
      {
        topicTags: ['agriculture'],
        funder: 'Buy BC',
        program: 'Buy BC Partnership',
        eligibility: 'BC farms',
      },
      profile,
    );
    expect(match.fitScore).toBe(1);
    expect(match.matchedInterests).toHaveLength(0);
  });

  it('builds a team profile from the seeded workspace', () => {
    const seeded = buildSeededTeamProfile();
    expect(seeded.interests).toContain('quantum materials');
    expect(seeded.knownFunders.length).toBeGreaterThan(0);
  });
});
