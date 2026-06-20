import { getResearchSeedRecords } from './researchSeedRecords';

// Native "opportunity matching": score a discovered grant opportunity against a
// research team's profile (its focus areas + the funders/topics it already
// works with). Pure and deterministic so it can power a fit-score column, a
// "why this matched" tooltip, or a periodic re-score — without any backend.

export type OpportunitySignal = {
  topicTags?: string[] | null;
  eligibility?: string | null;
  funder?: string | null;
  program?: string | null;
};

export type TeamProfile = {
  // Normalized keywords the team cares about (focus areas + project/grant topics).
  interests: string[];
  // Funders the team already holds or pursues grants with.
  knownFunders: string[];
};

export type OpportunityMatch = {
  fitScore: number; // 1..5
  matchedInterests: string[];
  reasons: string[];
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenize = (value: string | null | undefined): string[] =>
  value ? normalize(value).split(' ').filter((token) => token.length > 3) : [];

const overlaps = (interest: string, terms: Set<string>): boolean => {
  if (terms.has(interest)) return true;
  for (const term of terms) {
    if (term.includes(interest) || interest.includes(term)) return true;
  }
  return false;
};

export const scoreOpportunity = (
  opportunity: OpportunitySignal,
  profile: TeamProfile,
): OpportunityMatch => {
  const interests = profile.interests.map(normalize).filter(Boolean);
  const opportunityTerms = new Set<string>([
    ...(opportunity.topicTags ?? []).map(normalize),
    ...tokenize(opportunity.eligibility),
    ...tokenize(opportunity.program),
  ]);

  const matchedInterests = interests.filter((interest) =>
    overlaps(interest, opportunityTerms),
  );

  const reasons: string[] = [];
  let score = 1;

  // Up to +3 for topic/eligibility overlap with the team's interests.
  const topicBonus = Math.min(3, matchedInterests.length);
  if (topicBonus > 0) {
    score += topicBonus;
    reasons.push(
      `Matches ${matchedInterests.length} of the team's interests (${matchedInterests.join(', ')})`,
    );
  }

  // +1 if the team already works with this funder.
  const funder = opportunity.funder ? normalize(opportunity.funder) : '';
  const funderKnown =
    funder.length > 0 &&
    profile.knownFunders
      .map(normalize)
      .some((known) => known.includes(funder) || funder.includes(known));
  if (funderKnown) {
    score += 1;
    reasons.push(`Existing funder relationship (${opportunity.funder})`);
  }

  if (reasons.length === 0) {
    reasons.push('No overlap with the team profile yet');
  }

  return {
    fitScore: Math.max(1, Math.min(5, score)),
    matchedInterests,
    reasons,
  };
};

// Build the team profile from the seeded workspace: the team's focus areas plus
// the topics/funders of its projects and grants. In a live workspace this would
// read the current records instead of the seed.
export const buildSeededTeamProfile = (): TeamProfile => {
  const seeds = getResearchSeedRecords();

  const interests = new Set<string>();
  for (const team of seeds.researchTeam ?? []) {
    for (const area of (team.focusAreas as string[] | undefined) ?? []) {
      interests.add(area);
    }
  }
  for (const project of seeds.project ?? []) {
    if (typeof project.name === 'string') {
      for (const token of tokenize(project.name)) interests.add(token);
    }
  }

  const knownFunders = new Set<string>();
  for (const grant of seeds.grant ?? []) {
    if (typeof grant.funder === 'string' && grant.funder.length > 0) {
      knownFunders.add(grant.funder);
    }
  }

  return {
    interests: [...interests],
    knownFunders: [...knownFunders],
  };
};
