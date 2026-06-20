import {
  buildTeamProfileFromRecords,
  confidenceFromFitScore,
  generateCandidatesForSource,
  scanSourceToOpportunities,
  type DiscoverySource,
} from '@/local-db/research/researchDiscovery';

const quantumSource: DiscoverySource = {
  id: 'source-1',
  libraryKey: 'innovate-bc',
  name: 'Innovate BC programs',
  url: 'https://www.innovatebc.ca/',
  funder: 'Innovate BC',
  funderType: 'GOVERNMENT',
  topicTags: ['quantum', 'materials'],
  eligibilityTags: ['bc-based', 'industry-partner'],
};

describe('researchDiscovery', () => {
  it('builds a team profile from focus areas and grant funders', () => {
    const profile = buildTeamProfileFromRecords(
      [
        { focusAreas: ['Quantum computing', 'Materials'] },
        { focusAreas: null },
      ],
      [{ funder: 'Innovate BC' }, { funder: '' }, { funder: null }],
    );
    expect(profile.interests).toEqual(['Quantum computing', 'Materials']);
    expect(profile.knownFunders).toEqual(['Innovate BC']);
  });

  it('maps fit scores to confidence bands', () => {
    expect(confidenceFromFitScore(5)).toBe('HIGH');
    expect(confidenceFromFitScore(4)).toBe('HIGH');
    expect(confidenceFromFitScore(3)).toBe('MEDIUM');
    expect(confidenceFromFitScore(1)).toBe('LOW');
  });

  it('generates deterministic candidates from a source', () => {
    const first = generateCandidatesForSource(quantumSource);
    const second = generateCandidatesForSource(quantumSource);
    expect(first).toEqual(second);
    // one candidate per primary topic tag (capped at 2)
    expect(first).toHaveLength(2);
    expect(first[0].opportunityUrl).toContain('innovatebc.ca');
    expect(first[0].topicTags).toEqual(['quantum', 'materials']);
  });

  it('scores candidates higher when they overlap the team profile', () => {
    const alignedProfile = buildTeamProfileFromRecords(
      [{ focusAreas: ['quantum', 'materials'] }],
      [{ funder: 'Innovate BC' }],
    );
    const unrelatedProfile = buildTeamProfileFromRecords(
      [{ focusAreas: ['marine biology'] }],
      [{ funder: 'Some Other Funder' }],
    );

    const aligned = scanSourceToOpportunities(quantumSource, alignedProfile);
    const unrelated = scanSourceToOpportunities(
      quantumSource,
      unrelatedProfile,
    );

    expect(aligned[0].fitScore).toBeGreaterThan(unrelated[0].fitScore);
    expect(aligned[0].status).toBe('NEW');
    expect(aligned[0].sourceId).toBe('source-1');
    expect(aligned[0].confidence).toBe(
      confidenceFromFitScore(aligned[0].fitScore),
    );
  });

  it('dedupes candidates already discovered (by URL)', () => {
    const profile = buildTeamProfileFromRecords([], []);
    const all = scanSourceToOpportunities(quantumSource, profile);
    const deduped = scanSourceToOpportunities(
      quantumSource,
      profile,
      all.map((draft) => draft.opportunityUrl),
    );
    expect(all.length).toBeGreaterThan(0);
    expect(deduped).toHaveLength(0);
  });
});
