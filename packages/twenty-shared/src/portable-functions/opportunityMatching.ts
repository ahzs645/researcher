// THE opportunity-matching kernel — the single source of truth.
//
// This used to exist twice, with a "keep the two in sync" comment:
//   - convex/lib/opportunityMatching.ts                       (server copy)
//   - twenty-front .../research/researchOpportunityMatching.ts (browser copy)
// Both now re-export from here. Pure and deterministic so it can power a
// fit-score column, a "why this matched" tooltip, or a periodic re-score on
// any runtime.

export type OpportunitySignal = {
  topicTags?: string[] | null;
  eligibility?: string | null;
  funder?: string | null;
  program?: string | null;
};

export type TeamProfile = {
  // Normalized keywords the team cares about (focus areas + grant topics).
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

// Exported so profile builders can derive interests from free text (e.g.
// project names) with the exact tokenization scoring uses.
export const tokenizeOpportunityText = (
  value: string | null | undefined,
): string[] =>
  value
    ? normalize(value)
        .split(' ')
        .filter((token) => token.length > 3)
    : [];

const tokenize = tokenizeOpportunityText;

const overlaps = (interest: string, terms: Set<string>): boolean => {
  if (terms.has(interest)) {
    return true;
  }
  for (const term of terms) {
    if (term.includes(interest) || interest.includes(term)) {
      return true;
    }
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

// Confidence band shown on a grantOpportunity record. The Convex path used to
// grade MEDIUM from fitScore >= 2 while the browser path used >= 3 — exactly
// the drift the portable architecture removes. The browser thresholds win.
export const confidenceFromFitScore = (
  fitScore: number,
): 'HIGH' | 'MEDIUM' | 'LOW' => {
  if (fitScore >= 4) {
    return 'HIGH';
  }
  if (fitScore >= 3) {
    return 'MEDIUM';
  }
  return 'LOW';
};

// Build the scoring profile from the workspace's own records: the team's focus
// areas become interests, and funders the team already holds grants with
// become known funders (a +1 fit signal). The shared marshaller both the
// Convex query and the local flows call.
export const buildTeamProfileFromRecords = (
  teams: { focusAreas?: string[] | null }[],
  grants: { funder?: string | null }[],
): TeamProfile => {
  const interests = new Set<string>();
  for (const team of teams) {
    for (const area of team.focusAreas ?? []) {
      if (typeof area === 'string' && area.trim().length > 0) {
        interests.add(area.trim());
      }
    }
  }

  const knownFunders = new Set<string>();
  for (const grant of grants) {
    if (typeof grant.funder === 'string' && grant.funder.trim().length > 0) {
      knownFunders.add(grant.funder.trim());
    }
  }

  return { interests: [...interests], knownFunders: [...knownFunders] };
};
