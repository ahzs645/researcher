// Server-side copy of the opportunity matcher (kept framework-free so it runs
// inside Convex actions). Mirrors
// packages/twenty-front/src/modules/local-db/research/researchOpportunityMatching.ts
// — keep the two in sync.

export type OpportunitySignal = {
  topicTags?: string[] | null;
  eligibility?: string | null;
  funder?: string | null;
  program?: string | null;
};

export type TeamProfile = {
  interests: string[];
  knownFunders: string[];
};

export type OpportunityMatch = {
  fitScore: number;
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

  const topicBonus = Math.min(3, matchedInterests.length);
  if (topicBonus > 0) {
    score += topicBonus;
    reasons.push(
      `Matches ${matchedInterests.length} of the team's interests (${matchedInterests.join(', ')})`,
    );
  }

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
