// Portable grant-discovery handlers.
//
// One implementation of "derive the team profile" and "score + upsert
// discovered opportunities" that runs on hosted Convex (delegated from
// convex/grantDiscovery.ts), on the browser-local Dexie store, and in tests.
// Only candidate ACQUISITION stays runtime-specific: hosted Convex fetches
// JSON feeds / the connector-runner inside an action, while the local demo
// runtime synthesizes candidates — both feed this same upsert.

import {
  type PortableMutationContext,
  type PortableQueryContext,
} from '../portable/portableContext';
import {
  definePortableMutation,
  definePortableQuery,
} from '../portable/portableRuntime';

import {
  buildTeamProfileFromRecords,
  confidenceFromFitScore,
  scoreOpportunity,
  type TeamProfile,
} from './opportunityMatching';

// A normalized opportunity candidate before it becomes a grantOpportunity
// record. Superset of what the feed mapper (Convex) and the local synthesizer
// produce; absent fields simply stay absent on the record.
export type GrantOpportunityCandidate = {
  title: string;
  funder?: string;
  program?: string;
  opportunityKind?: string;
  opportunityUrl?: string;
  applicationDueDate?: string;
  registrationDueDate?: string;
  amountText?: string;
  eligibility?: string;
  description?: string;
  topicTags?: string[];
  sourceId?: string;
};

export type UpsertOpportunitiesArgs = {
  profile: TeamProfile;
  candidates: GrantOpportunityCandidate[];
  // Injectable clock (ISO string) so differential tests are deterministic.
  now?: string;
};

export type UpsertOpportunitiesResult = {
  inserted: number;
  updated: number;
};

// Derive the team profile (interests + known funders) from existing records so
// scoring reflects what the team actually works on.
export const teamProfilePortable = async (
  context: PortableQueryContext,
): Promise<TeamProfile> => {
  const teams = await context.db.query('researchTeam').collect();
  const grants = await context.db.query('grant').collect();
  return buildTeamProfileFromRecords(
    teams as { focusAreas?: string[] | null }[],
    grants as { funder?: string | null }[],
  );
};

// Upsert scored candidates as grantOpportunity records (dedup by URL).
export const upsertOpportunitiesPortable = async (
  context: PortableMutationContext,
  args: UpsertOpportunitiesArgs,
): Promise<UpsertOpportunitiesResult> => {
  const nowIso = args.now ?? new Date().toISOString();
  const existing = await context.db.query('grantOpportunity').collect();
  const existingIdByUrl = new Map<string, string>();
  for (const row of existing) {
    if (typeof row.opportunityUrl === 'string' && row.opportunityUrl) {
      existingIdByUrl.set(row.opportunityUrl, row.id);
    }
  }

  let inserted = 0;
  let updated = 0;
  for (const candidate of args.candidates) {
    const match = scoreOpportunity(candidate, args.profile);
    const record: Record<string, unknown> = {
      name: candidate.title,
      funder: candidate.funder,
      program: candidate.program,
      opportunityKind: candidate.opportunityKind,
      opportunityUrl: candidate.opportunityUrl,
      applicationDueDate: candidate.applicationDueDate,
      registrationDueDate: candidate.registrationDueDate,
      amountText: candidate.amountText,
      eligibility: candidate.eligibility,
      description: candidate.description,
      topicTags: candidate.topicTags ?? match.matchedInterests,
      sourceId: candidate.sourceId,
      fitScore: match.fitScore,
      confidence: confidenceFromFitScore(match.fitScore),
      status: 'NEW',
      updatedAt: nowIso,
    };
    // Absent candidate fields stay absent instead of writing `undefined`
    // (Convex rejects explicit undefined values).
    for (const key of Object.keys(record)) {
      if (record[key] === undefined) {
        delete record[key];
      }
    }
    const existingId = candidate.opportunityUrl
      ? existingIdByUrl.get(candidate.opportunityUrl)
      : undefined;
    if (existingId) {
      await context.db.patch('grantOpportunity', existingId, record);
      updated += 1;
    } else {
      await context.db.insert('grantOpportunity', {
        createdAt: nowIso,
        position: 0,
        ...record,
      });
      inserted += 1;
    }
  }
  return { inserted, updated };
};

export const grantDiscoveryTeamProfileQuery = definePortableQuery<
  Record<string, never>,
  TeamProfile
>({
  name: 'grantDiscovery:teamProfile',
  handler: (context) => teamProfilePortable(context),
});

export const grantDiscoveryUpsertOpportunitiesMutation = definePortableMutation<
  UpsertOpportunitiesArgs,
  UpsertOpportunitiesResult
>({
  name: 'grantDiscovery:upsertOpportunities',
  handler: (context, args) => upsertOpportunitiesPortable(context, args),
});
