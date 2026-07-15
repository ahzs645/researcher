import {
  tokenizeOpportunityText,
  type TeamProfile,
} from 'twenty-shared/portable-functions';

import { getResearchSeedRecords } from './researchSeedRecords';

// The opportunity matcher now lives in twenty-shared/portable-functions — ONE
// implementation shared with the Convex backend (which used to hand-mirror it
// behind a "keep the two in sync" comment). This module re-exports it for the
// existing import sites and keeps the seed-specific profile builder.
export {
  scoreOpportunity,
  type OpportunityMatch,
  type OpportunitySignal,
  type TeamProfile,
} from 'twenty-shared/portable-functions';

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
      for (const token of tokenizeOpportunityText(project.name)) {
        interests.add(token);
      }
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
