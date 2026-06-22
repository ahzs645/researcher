import {
  scoreOpportunity,
  type OpportunitySignal,
  type TeamProfile,
} from './researchOpportunityMatching';

// "Is this worth applying to, and am I even eligible?" — the assessment layer on
// top of the raw fit score. Relevance is fit × eligibility × deadline, not fit
// alone: a perfect topical match you are ineligible for, or whose deadline has
// passed, is not relevant.
//
// This is deterministic and self-contained so it works with no backend (same
// constraint as the rest of the bridge). The async `AiOpportunityAssessor` seam
// lets a Convex/Claude action replace the prose reasoning + eligibility reading
// later without changing any caller — `assessOpportunity` stays the fallback.

export type EligibilityVerdict =
  | 'ELIGIBLE'
  | 'LIKELY'
  | 'INELIGIBLE'
  | 'UNKNOWN';
export type DeadlineFeasibility = 'FEASIBLE' | 'TIGHT' | 'PASSED' | 'UNKNOWN';

// The applicant/team the opportunity is scored for. Extends the matcher's
// TeamProfile (interests + known funders) with the individual-level facts that
// scholarship/fellowship eligibility actually turns on.
export type ResearchProfile = TeamProfile & {
  careerStage?: string | null;
  citizenship?: string | null;
  residency?: string | null;
};

export type AssessableOpportunity = OpportunitySignal & {
  careerStage?: string | null;
  eligibilityNotes?: string | null;
  applicationDueDate?: string | null;
  opportunityKind?: string | null;
};

export type OpportunityAssessment = {
  fitScore: number; // 1..5 topical fit (from the matcher)
  relevanceScore: number; // 1..5 composite (fit gated by eligibility + deadline)
  eligibilityVerdict: EligibilityVerdict;
  deadline: DeadlineFeasibility;
  // Short, human-readable "why this is (not) for you + what you'd need".
  relevanceReason: string;
  // Concrete things the applicant would have to produce to apply.
  whatYouNeed: string[];
  matchedInterests: string[];
};

// The async seam an AI assessor implements (e.g. a Convex action calling Claude
// to read messy eligibility prose). Callers depend on this type, not the model.
export type AiOpportunityAssessor = (
  opportunity: AssessableOpportunity,
  profile: ResearchProfile,
) => Promise<OpportunityAssessment>;

const RESTRICTIVE_CITIZENSHIP = [
  'canadian citizen',
  'permanent resident',
  'citizens and permanent residents',
  'domestic students only',
  'must be a citizen',
];

const OPEN_CITIZENSHIP = [
  'international',
  'domestic and international',
  'any nationality',
  'open to all',
  'regardless of citizenship',
];

const CANADIAN_HINTS = ['canad', 'permanent resident', 'pr ', 'domestic'];

const lower = (value: string | null | undefined): string =>
  (value ?? '').toLowerCase();

const includesAny = (haystack: string, needles: string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

const DAY_MS = 24 * 60 * 60 * 1000;

const assessDeadline = (
  dueDate: string | null | undefined,
  now: Date,
): { feasibility: DeadlineFeasibility; note: string } => {
  if (!dueDate) {
    return { feasibility: 'UNKNOWN', note: 'No deadline on record' };
  }
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return { feasibility: 'UNKNOWN', note: 'Deadline could not be parsed' };
  }
  const days = Math.round((due.getTime() - now.getTime()) / DAY_MS);
  if (days < 0) {
    return { feasibility: 'PASSED', note: `Deadline passed ${-days} days ago` };
  }
  if (days <= 21) {
    return {
      feasibility: 'TIGHT',
      note: `Only ${days} days until the deadline`,
    };
  }
  return { feasibility: 'FEASIBLE', note: `${days} days until the deadline` };
};

// Career-stage gate. Hard-fails only on a clear mismatch between a specific
// eligible stage and a known applicant stage.
const assessCareerStage = (
  required: string | null | undefined,
  applicant: string | null | undefined,
): { verdict: EligibilityVerdict; note: string } => {
  if (!required || required === 'ANY') {
    return { verdict: 'ELIGIBLE', note: '' };
  }
  if (!applicant) {
    return {
      verdict: 'UNKNOWN',
      note: `Open to ${required.toLowerCase().replace(/_/g, ' ')} — set your career stage to confirm`,
    };
  }
  if (applicant === required) {
    return { verdict: 'ELIGIBLE', note: '' };
  }
  return {
    verdict: 'INELIGIBLE',
    note: `Open to ${required.toLowerCase().replace(/_/g, ' ')} only; your profile is ${applicant
      .toLowerCase()
      .replace(/_/g, ' ')}`,
  };
};

// Citizenship gate, read heuristically from the eligibility prose.
const assessCitizenship = (
  eligibilityText: string,
  citizenship: string | null | undefined,
): { verdict: EligibilityVerdict; note: string } => {
  const open = includesAny(eligibilityText, OPEN_CITIZENSHIP);
  const restrictive = includesAny(eligibilityText, RESTRICTIVE_CITIZENSHIP);
  if (open || !restrictive) {
    return { verdict: 'ELIGIBLE', note: '' };
  }
  // Restrictive (Canadian citizen / PR style) requirement detected.
  if (!citizenship) {
    return {
      verdict: 'UNKNOWN',
      note: 'Restricted to citizens/permanent residents — add your citizenship to confirm',
    };
  }
  const applicantIsDomestic = includesAny(lower(citizenship), CANADIAN_HINTS);
  if (applicantIsDomestic) {
    return { verdict: 'ELIGIBLE', note: '' };
  }
  return {
    verdict: 'INELIGIBLE',
    note: `Restricted to Canadian citizens / permanent residents; your citizenship is "${citizenship}"`,
  };
};

// Rank verdicts so the strongest (most disqualifying) one wins.
const VERDICT_RANK: Record<EligibilityVerdict, number> = {
  INELIGIBLE: 3,
  UNKNOWN: 2,
  LIKELY: 1,
  ELIGIBLE: 0,
};

const combineVerdicts = (verdicts: EligibilityVerdict[]): EligibilityVerdict =>
  verdicts.reduce(
    (worst, verdict) =>
      VERDICT_RANK[verdict] > VERDICT_RANK[worst] ? verdict : worst,
    'ELIGIBLE',
  );

const KIND_NEEDS: Record<string, string[]> = {
  GRANT: ['Project narrative', 'Budget & justification', 'Team CVs'],
  SCHOLARSHIP: ['Transcripts', 'Reference letters', 'Personal statement'],
  FELLOWSHIP: ['Research proposal', 'Reference letters', 'Host endorsement'],
  STUDENTSHIP: ['Transcripts', 'Supervisor confirmation'],
  PRIZE: ['Nomination package', 'Supporting letters'],
};

const buildWhatYouNeed = (opportunity: AssessableOpportunity): string[] => {
  const kind = opportunity.opportunityKind ?? 'GRANT';
  const needs = [...(KIND_NEEDS[kind] ?? KIND_NEEDS.GRANT)];
  const text = `${lower(opportunity.eligibility)} ${lower(opportunity.eligibilityNotes)}`;
  if (text.includes('nominat')) needs.push('Institutional nomination');
  if (text.includes('industry') || text.includes('partner'))
    needs.push('Partner / matching commitment');
  if (text.includes('ethics') || text.includes('reb'))
    needs.push('Ethics (REB) approval');
  return [...new Set(needs)];
};

export type AssessOptions = { now?: Date };

// Deterministic assessment — the no-backend default and the AI fallback.
export const assessOpportunity = (
  opportunity: AssessableOpportunity,
  profile: ResearchProfile,
  options: AssessOptions = {},
): OpportunityAssessment => {
  const now = options.now ?? new Date();
  const match = scoreOpportunity(opportunity, profile);

  const eligibilityText = `${lower(opportunity.eligibility)} ${lower(
    opportunity.eligibilityNotes,
  )}`;
  const career = assessCareerStage(
    opportunity.careerStage,
    profile.careerStage,
  );
  const citizenship = assessCitizenship(eligibilityText, profile.citizenship);
  const deadlineResult = assessDeadline(opportunity.applicationDueDate, now);

  const eligibilityVerdict = combineVerdicts([
    career.verdict,
    citizenship.verdict,
  ]);

  // Composite relevance: start at fit, then gate.
  let relevanceScore = match.fitScore;
  if (eligibilityVerdict === 'INELIGIBLE') relevanceScore = 1;
  else if (eligibilityVerdict === 'UNKNOWN')
    relevanceScore = Math.max(1, relevanceScore - 1);
  if (deadlineResult.feasibility === 'PASSED') relevanceScore = 1;
  else if (deadlineResult.feasibility === 'TIGHT')
    relevanceScore = Math.max(1, relevanceScore - 1);
  relevanceScore = Math.max(1, Math.min(5, relevanceScore));

  const gateNotes = [career.note, citizenship.note].filter(
    (note) => note.length > 0,
  );

  const reasonParts: string[] = [];
  if (match.matchedInterests.length > 0) {
    reasonParts.push(
      `Topical fit ${match.fitScore}/5 — matches ${match.matchedInterests.join(', ')}.`,
    );
  } else {
    reasonParts.push(`Low topical fit (${match.fitScore}/5).`);
  }
  if (eligibilityVerdict === 'INELIGIBLE') {
    reasonParts.push(`Likely ineligible: ${gateNotes.join('; ')}.`);
  } else if (gateNotes.length > 0) {
    reasonParts.push(gateNotes.join('; ') + '.');
  } else if (eligibilityVerdict === 'ELIGIBLE') {
    reasonParts.push('You appear eligible.');
  }
  reasonParts.push(deadlineResult.note + '.');

  return {
    fitScore: match.fitScore,
    relevanceScore,
    eligibilityVerdict,
    deadline: deadlineResult.feasibility,
    relevanceReason: reasonParts.join(' '),
    whatYouNeed: buildWhatYouNeed(opportunity),
    matchedInterests: match.matchedInterests,
  };
};

// Pick the runner: an injected AI assessor if provided, else the deterministic
// one wrapped in a promise. Lets a page await one signature regardless of mode.
export const createOpportunityAssessor = (
  aiAssessor?: AiOpportunityAssessor,
): AiOpportunityAssessor =>
  aiAssessor ??
  ((opportunity, profile) =>
    Promise.resolve(assessOpportunity(opportunity, profile)));

// Map a relevance assessment onto the `grantOpportunity.relevanceVerdict` enum.
export const relevanceVerdictForRecord = (
  assessment: OpportunityAssessment,
): EligibilityVerdict => {
  if (assessment.eligibilityVerdict === 'INELIGIBLE') return 'INELIGIBLE';
  if (assessment.deadline === 'PASSED') return 'INELIGIBLE';
  if (assessment.eligibilityVerdict === 'UNKNOWN') return 'UNKNOWN';
  return assessment.relevanceScore >= 4 ? 'ELIGIBLE' : 'LIKELY';
};
