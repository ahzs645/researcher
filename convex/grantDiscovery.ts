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

import {
  teamProfilePortable,
  upsertOpportunitiesPortable,
  type TeamProfile,
  type UpsertOpportunitiesResult,
} from 'twenty-shared/portable-functions';

import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import { checkBridgeAuth, errorResponse, okResponse } from './bridgeAuth';
import {
  BUILT_IN_GRANT_SOURCES,
  BUILT_IN_GRANT_SOURCE_PROFILES,
} from './grantSources/grantSourceLibrary';
import { scoreOpportunitiesWithLlm } from './lib/llmOpportunityScoring';
import {
  toPortableMutationContext,
  toPortableQueryContext,
} from './lib/portable';

// A normalized opportunity candidate before it becomes a grantOpportunity row.
type Candidate = {
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

type PullSourceResult = UpsertOpportunitiesResult & {
  libraryKey: string;
  found: number;
  scoredBy: 'heuristic' | 'llm' | 'mixed';
};

const teamProfileValidator = v.object({
  interests: v.array(v.string()),
  knownFunders: v.array(v.string()),
});

const candidateValidator = v.object({
  title: v.string(),
  funder: v.optional(v.string()),
  program: v.optional(v.string()),
  opportunityKind: v.optional(v.string()),
  opportunityUrl: v.optional(v.string()),
  applicationDueDate: v.optional(v.string()),
  registrationDueDate: v.optional(v.string()),
  amountText: v.optional(v.string()),
  eligibility: v.optional(v.string()),
  description: v.optional(v.string()),
  topicTags: v.optional(v.array(v.string())),
  sourceId: v.optional(v.string()),
  fitScore: v.optional(v.number()),
  matchedInterests: v.optional(v.array(v.string())),
});

const pullSourceResultValidator = v.object({
  libraryKey: v.string(),
  found: v.number(),
  inserted: v.number(),
  updated: v.number(),
  scoredBy: v.union(
    v.literal('heuristic'),
    v.literal('llm'),
    v.literal('mixed'),
  ),
});

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
// scoring reflects what the team actually works on. The body is the portable
// handler in twenty-shared/portable-functions — the same code the browser-local
// runtime executes offline.
export const teamProfile = internalQuery({
  args: {},
  returns: teamProfileValidator,
  handler: async (ctx): Promise<TeamProfile> =>
    teamProfilePortable(await toPortableQueryContext(ctx)),
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

const mapRunnerItem = (item: Record<string, unknown>): Candidate | null => {
  const read = (key: string): string | undefined => {
    const value = item[key];

    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const title = read('title');
  if (!title) {
    return null;
  }

  return {
    title,
    funder: read('funder'),
    program: read('program'),
    opportunityUrl: read('opportunityUrl'),
    applicationDueDate: read('applicationDueDate'),
    registrationDueDate: read('registrationDueDate'),
    amountText: read('amountText'),
    eligibility: read('eligibility'),
    description: read('description'),
  };
};

// Fetch candidates for a source. JSON feeds are parsed inline; HTML / portal
// sources are delegated to the connector-runner.
const fetchCandidates = async (libraryKey: string): Promise<Candidate[]> => {
  const source = BUILT_IN_GRANT_SOURCES.find(
    (entry) => entry.libraryKey === libraryKey,
  );
  if (!source) throw new Error(`Unknown grant source: ${libraryKey}`);
  const profile = BUILT_IN_GRANT_SOURCE_PROFILES.find(
    (entry) => entry.libraryKey === libraryKey,
  );
  if (!profile) {
    throw new Error(`Source ${libraryKey} has no extraction profile`);
  }
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
      throw new Error(
        `Feed fetch failed (${response.status}) for ${libraryKey}`,
      );
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

  if (profile.profileKind === 'manual_mapping') {
    throw new Error(
      `Source ${libraryKey} does not have an automated extractor yet`,
    );
  }

  // HTML / authenticated portal: the connector-runner does the browser work.
  const connectorRunnerUrl = process.env.CONNECTOR_RUNNER_URL?.replace(
    /\/$/,
    '',
  );
  if (!connectorRunnerUrl) {
    throw new Error(
      `Source ${libraryKey} needs the connector-runner (set CONNECTOR_RUNNER_URL); only json_feed sources run without it.`,
    );
  }
  const connectorRunnerSecret = process.env.CONNECTOR_RUNNER_SECRET;
  const response = await fetch(
    `${connectorRunnerUrl}/runs/extract-opportunities`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(connectorRunnerSecret
          ? { 'x-connector-runner-secret': connectorRunnerSecret }
          : {}),
      },
      body: JSON.stringify({
        profileKey: libraryKey,
        url: source.url,
        profile,
      }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `connector-runner extraction failed (${response.status}) for ${libraryKey}${detail ? `: ${detail}` : ''}`,
    );
  }
  const data = (await response.json()) as { rows?: Record<string, unknown>[] };
  return (data.rows ?? [])
    .map(mapRunnerItem)
    .filter((candidate): candidate is Candidate => candidate !== null);
};

// Upsert scored candidates as grantOpportunity records (dedup by URL). The
// body is the portable handler in twenty-shared/portable-functions — scoring,
// confidence banding, and dedup are shared verbatim with the browser-local
// runtime instead of hand-mirrored.
export const upsertOpportunities = internalMutation({
  args: {
    profile: teamProfileValidator,
    candidates: v.array(candidateValidator),
  },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, { profile, candidates }) =>
    upsertOpportunitiesPortable(await toPortableMutationContext(ctx), {
      profile,
      candidates,
    }),
});

// Pull one source end-to-end: fetch → optional semantic score → portable
// upsert. Internal-only so the connector runner and model cannot be invoked
// without passing through the bridge-authenticated HTTP action.
export const pullSource = internalAction({
  args: { libraryKey: v.string() },
  returns: pullSourceResultValidator,
  handler: async (ctx, { libraryKey }): Promise<PullSourceResult> => {
    const profile: TeamProfile = await ctx.runQuery(
      internal.grantDiscovery.teamProfile,
      {},
    );
    const candidates = await fetchCandidates(libraryKey);
    const scoring = await scoreOpportunitiesWithLlm(ctx, candidates, profile);
    const scoredCandidates = candidates.map((candidate, index) => {
      const match = scoring.matches[index];

      return match
        ? {
            ...candidate,
            fitScore: match.fitScore,
            matchedInterests: match.matchedInterests,
          }
        : candidate;
    });
    const result: UpsertOpportunitiesResult = await ctx.runMutation(
      internal.grantDiscovery.upsertOpportunities,
      { profile, candidates: scoredCandidates },
    );
    return {
      libraryKey,
      found: candidates.length,
      scoredBy: scoring.scoredBy,
      ...result,
    };
  },
});

export const pullSourceHttpAction = httpAction(async (ctx, request) => {
  const denied = checkBridgeAuth(request);
  if (denied) {
    return denied;
  }

  let body: { libraryKey?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(request, 400, 'Invalid JSON body');
  }

  const libraryKey =
    typeof body.libraryKey === 'string' ? body.libraryKey.trim() : '';
  if (!libraryKey) {
    return errorResponse(request, 400, 'libraryKey is required');
  }

  try {
    const result = await ctx.runAction(internal.grantDiscovery.pullSource, {
      libraryKey,
    });
    return okResponse(request, result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
            .split('\n', 1)[0]
            .replace(/^Uncaught Error:\s*/, '')
            .trim()
        : 'Discovery pull failed';
    const status = message.includes('does not have an automated extractor')
      ? 422
      : message.includes('needs the connector-runner')
        ? 503
        : message.startsWith('Unknown grant source') ||
            message.includes('has no extraction profile')
          ? 400
          : 500;

    return errorResponse(request, status, message);
  }
});
