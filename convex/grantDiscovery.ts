// Live grant-opportunity discovery for Convex mode.
//
// Pulls funding opportunities from the built-in grant-source library, scores
// each against the team's profile, and upserts them as `grantOpportunity`
// records in the generic record store (the same table the Twenty frontend
// reads). Two extraction paths:
//   * JSON / RSS feeds  → fetched + field-mapped directly here (no extra infra)
//   * HTML / auth portals → delegated to the connector-runner browser service
//     (services/connector-runner), which returns extracted rows
//
// This is a scaffold: it needs a deployed Convex backend and, for portal
// sources, a running connector-runner. See docs/CONVEX_LIVE_DISCOVERY.md.

import { v } from 'convex/values';

import { action, internalMutation, internalQuery, query } from './_generated/server';
import { internal } from './_generated/api';
import {
  BUILT_IN_GRANT_SOURCES,
  BUILT_IN_GRANT_SOURCE_PROFILES,
} from './grantSources/grantSourceLibrary';
import { scoreOpportunity, type TeamProfile } from './lib/opportunityMatching';

const isoNow = () => new Date().toISOString();

// A normalized opportunity candidate before it becomes a grantOpportunity row.
type Candidate = {
  externalId: string;
  title: string;
  funder?: string;
  program?: string;
  opportunityUrl?: string;
  applicationDueDate?: string;
  registrationDueDate?: string;
  amountText?: string;
  eligibility?: string;
  description?: string;
  topicTags?: string[];
};

// The built-in source catalogue (with scrape profiles) for the UI / config.
export const library = query({
  args: {},
  returns: v.any(),
  handler: async () =>
    BUILT_IN_GRANT_SOURCES.map((source) => ({
      ...source,
      profile: BUILT_IN_GRANT_SOURCE_PROFILES.find(
        (profile) => profile.libraryKey === source.libraryKey,
      ),
    })),
});

// Derive the team profile (interests + known funders) from existing records so
// scoring reflects what the team actually works on.
export const teamProfile = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<TeamProfile> => {
    const interests = new Set<string>();
    const knownFunders = new Set<string>();

    const teams = await ctx.db.query('researchTeam').collect();
    for (const team of teams) {
      for (const area of (team.focusAreas as string[] | undefined) ?? []) {
        interests.add(area);
      }
    }
    const grants = await ctx.db.query('grant').collect();
    for (const grant of grants) {
      if (typeof grant.funder === 'string' && grant.funder.length > 0) {
        knownFunders.add(grant.funder);
      }
    }

    return { interests: [...interests], knownFunders: [...knownFunders] };
  },
});

// Map a raw feed item to a Candidate using the source profile's field mappings.
const mapFeedItem = (
  item: Record<string, unknown>,
  fieldMappings: Record<string, string | undefined>,
): Candidate | null => {
  const read = (key?: string): string | undefined => {
    if (!key) return undefined;
    const value = item[key];
    return typeof value === 'string' ? value : undefined;
  };
  const title = read(fieldMappings.title) ?? read('title');
  if (!title) return null;
  const opportunityUrl =
    read(fieldMappings.applicationUrl) ?? read('link') ?? read('url');
  return {
    externalId: opportunityUrl ?? title,
    title,
    funder: read(fieldMappings.funder),
    program: read(fieldMappings.program),
    opportunityUrl,
    applicationDueDate: read(fieldMappings.applicationDeadline),
    registrationDueDate: read(fieldMappings.registrationDeadline),
    amountText: read(fieldMappings.amount),
    eligibility: read(fieldMappings.eligibility),
    description: read(fieldMappings.description),
  };
};

// Fetch candidates for a source. JSON feeds are parsed inline; HTML / portal
// sources are delegated to the connector-runner.
const fetchCandidates = async (
  libraryKey: string,
  connectorRunnerUrl: string | undefined,
): Promise<Candidate[]> => {
  const source = BUILT_IN_GRANT_SOURCES.find(
    (entry) => entry.libraryKey === libraryKey,
  );
  if (!source) throw new Error(`Unknown grant source: ${libraryKey}`);
  const profile = BUILT_IN_GRANT_SOURCE_PROFILES.find(
    (entry) => entry.libraryKey === libraryKey,
  );
  const fieldMappings = (profile?.fieldMappings ?? {}) as Record<
    string,
    string | undefined
  >;

  // JSON feed: fetch + map directly (no extra infra needed).
  if (profile?.profileKind === 'json_feed') {
    const response = await fetch(source.url, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Feed fetch failed (${response.status}) for ${libraryKey}`);
    }
    const payload = (await response.json()) as unknown;
    const items = Array.isArray(payload)
      ? payload
      : ((payload as { items?: unknown[] }).items ?? []);
    return items
      .map((item) =>
        mapFeedItem(item as Record<string, unknown>, fieldMappings),
      )
      .filter((candidate): candidate is Candidate => candidate !== null);
  }

  // HTML / authenticated portal: the connector-runner does the browser work.
  if (!connectorRunnerUrl) {
    throw new Error(
      `Source ${libraryKey} needs the connector-runner (set connectorRunnerUrl); only json_feed sources run without it.`,
    );
  }
  const response = await fetch(`${connectorRunnerUrl}/runs/open-page`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: source.url, profile }),
  });
  if (!response.ok) {
    throw new Error(
      `connector-runner extraction failed (${response.status}) for ${libraryKey}`,
    );
  }
  const data = (await response.json()) as { rows?: Record<string, unknown>[] };
  return (data.rows ?? [])
    .map((row) => mapFeedItem(row, fieldMappings))
    .filter((candidate): candidate is Candidate => candidate !== null);
};

// Upsert scored candidates as grantOpportunity records (dedup by URL/title).
export const upsertOpportunities = internalMutation({
  args: { profile: v.any(), candidates: v.any() },
  returns: v.any(),
  handler: async (ctx, { profile, candidates }) => {
    const teamProfileValue = profile as TeamProfile;
    const rows = candidates as Array<Candidate & { fitScore: number }>;
    const existing = await ctx.db.query('grantOpportunity').collect();
    const byUrl = new Map<string, { _id: string }>(
      existing
        .filter((row) => typeof row.opportunityUrl === 'string')
        .map((row) => [row.opportunityUrl as string, row as { _id: string }]),
    );

    let inserted = 0;
    let updated = 0;
    for (const candidate of rows) {
      const match = scoreOpportunity(candidate, teamProfileValue);
      const record = {
        name: candidate.title,
        funder: candidate.funder,
        program: candidate.program,
        opportunityUrl: candidate.opportunityUrl,
        applicationDueDate: candidate.applicationDueDate,
        registrationDueDate: candidate.registrationDueDate,
        amountText: candidate.amountText,
        eligibility: candidate.eligibility,
        description: candidate.description,
        topicTags: candidate.topicTags ?? match.matchedInterests,
        fitScore: match.fitScore,
        confidence: match.fitScore >= 4 ? 'HIGH' : match.fitScore >= 2 ? 'MEDIUM' : 'LOW',
        status: 'NEW',
        updatedAt: isoNow(),
      };
      const found = candidate.opportunityUrl
        ? byUrl.get(candidate.opportunityUrl)
        : undefined;
      if (found) {
        await ctx.db.patch(found._id, record);
        updated += 1;
      } else {
        await ctx.db.insert('grantOpportunity', {
          id: crypto.randomUUID(),
          createdAt: isoNow(),
          position: 0,
          ...record,
        });
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

// Pull one source end-to-end: fetch → score → upsert.
export const pullSource = action({
  args: {
    libraryKey: v.string(),
    connectorRunnerUrl: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, { libraryKey, connectorRunnerUrl }) => {
    const profile = await ctx.runQuery(internal.grantDiscovery.teamProfile, {});
    const candidates = await fetchCandidates(libraryKey, connectorRunnerUrl);
    const result = await ctx.runMutation(
      internal.grantDiscovery.upsertOpportunities,
      { profile, candidates },
    );
    return { libraryKey, found: candidates.length, ...result };
  },
});
