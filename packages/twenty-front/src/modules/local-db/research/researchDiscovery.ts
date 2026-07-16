import {
  buildTeamProfileFromRecords,
  confidenceFromFitScore,
  scoreOpportunity,
  type TeamProfile,
} from 'twenty-shared/portable-functions';

export type { WorkspaceMode } from './researchObjectModel';

// Profile building and confidence banding live in the shared portable kernel
// (one implementation with the Convex path); re-exported here for existing
// import sites.
export { buildTeamProfileFromRecords, confidenceFromFitScore };

// The local/demo "discovery" engine. The Convex runtime pulls live candidates
// from a source (JSON feed or the connector-runner browser), scores them, and
// upserts grantOpportunity records. The static bridge has no backend, so this
// module synthesizes deterministic candidate opportunities from a source's
// topic tags and scores them with the same matcher — a real, self-contained
// flow that produces the same grantOpportunity records the Convex path would.

// A grant source as the Discovery UI sees it — whether it came from a
// `grantSource` record or the built-in static library.
export type DiscoverySource = {
  id?: string;
  libraryKey?: string | null;
  name: string;
  url?: string | null;
  funder?: string | null;
  funderType?: string | null;
  opportunityKind?: string | null;
  topicTags?: string[] | null;
  eligibilityTags?: string[] | null;
};

// A scored opportunity ready to be written as a `grantOpportunity` record.
export type DiscoveredOpportunityDraft = {
  name: string;
  funder: string;
  program: string;
  opportunityKind: string;
  opportunityUrl: string;
  amountText: string;
  fitScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'NEW';
  eligibility: string;
  topicTags: string[];
  description: string;
  sourceId?: string;
};

const DISCOVERY_CYCLE_YEAR = 2026;

// The amount band shown on a synthesized candidate. Picked deterministically so
// re-scanning a source is idempotent rather than churning fake numbers.
const AMOUNT_BANDS = [
  'Up to $50,000',
  'Up to $150,000',
  'Up to $300,000',
  '$25,000 – $100,000',
  'Up to $1,000,000',
];

const fnv1a = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const titleCase = (value: string): string =>
  value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

type SourceCandidate = {
  title: string;
  funder: string;
  program: string;
  opportunityKind: string;
  opportunityUrl: string;
  amountText: string;
  topicTags: string[];
  eligibility: string;
};

// The noun a synthesized candidate's title reads as, per funding kind.
const KIND_NOUNS: Record<string, [string, string]> = {
  GRANT: ['program', 'innovation grant'],
  SCHOLARSHIP: ['scholarship', 'graduate award'],
  FELLOWSHIP: ['fellowship', 'research fellowship'],
  STUDENTSHIP: ['studentship', 'student award'],
  PRIZE: ['prize', 'award'],
};

// Deterministically synthesize the candidate opportunities a scan of this source
// would surface. Real candidates come from the connector-runner / JSON feeds in
// Convex mode; here we derive them from the source's own topic tags so the
// scored result is plausible and stable across re-scans.
export const generateCandidatesForSource = (
  source: DiscoverySource,
): SourceCandidate[] => {
  const tags = (source.topicTags ?? []).filter(
    (tag): tag is string => typeof tag === 'string' && tag.length > 0,
  );
  const funder = source.funder?.trim() || source.name;
  const baseUrl = (source.url ?? '').replace(/\/$/, '');
  const eligibility =
    (source.eligibilityTags ?? []).filter(Boolean).join(', ') ||
    'See funder site for full eligibility';
  const primaryTags = tags.length > 0 ? tags.slice(0, 2) : ['research'];
  const opportunityKind = source.opportunityKind ?? 'GRANT';
  const nouns = KIND_NOUNS[opportunityKind] ?? KIND_NOUNS.GRANT;

  return primaryTags.map((tag, index) => {
    const seed = `${source.libraryKey ?? source.name}:${tag}:${index}`;
    const amountText = AMOUNT_BANDS[fnv1a(seed) % AMOUNT_BANDS.length];
    const noun = index === 0 ? nouns[0] : nouns[1];
    return {
      title: `${titleCase(tag)} ${noun} ${DISCOVERY_CYCLE_YEAR}`,
      funder,
      program: titleCase(tag),
      opportunityKind,
      opportunityUrl: baseUrl
        ? `${baseUrl}/opportunities/${slugify(tag)}-${DISCOVERY_CYCLE_YEAR}`
        : `https://grants.example/${slugify(funder)}/${slugify(tag)}`,
      amountText,
      topicTags: tags.length > 0 ? tags : [tag],
      eligibility,
    };
  });
};

// Scan one source: synthesize candidates, score each against the team profile,
// and return the new (deduped by URL) opportunities as record drafts.
export const scanSourceToOpportunities = (
  source: DiscoverySource,
  profile: TeamProfile,
  existingOpportunityUrls: Iterable<string> = [],
): DiscoveredOpportunityDraft[] => {
  const seen = new Set(existingOpportunityUrls);

  return generateCandidatesForSource(source)
    .filter((candidate) => {
      if (seen.has(candidate.opportunityUrl)) return false;
      seen.add(candidate.opportunityUrl);
      return true;
    })
    .map((candidate) => {
      const match = scoreOpportunity(
        {
          topicTags: candidate.topicTags,
          eligibility: candidate.eligibility,
          funder: candidate.funder,
          program: candidate.program,
        },
        profile,
      );

      return {
        name: candidate.title,
        funder: candidate.funder,
        program: candidate.program,
        opportunityKind: candidate.opportunityKind,
        opportunityUrl: candidate.opportunityUrl,
        amountText: candidate.amountText,
        fitScore: match.fitScore,
        confidence: confidenceFromFitScore(match.fitScore),
        status: 'NEW',
        eligibility: candidate.eligibility,
        topicTags: candidate.topicTags,
        description: `Discovered from ${source.name}. ${match.reasons[0]}`,
        ...(source.id ? { sourceId: source.id } : {}),
      };
    });
};
