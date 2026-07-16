// The opportunity matcher moved to twenty-shared/portable-functions so one
// implementation serves hosted Convex, the browser-local runtime, and tests.
// This shim keeps the historical import path alive.

export {
  buildTeamProfileFromRecords,
  confidenceFromFitScore,
  scoreOpportunity,
  type OpportunityMatch,
  type OpportunitySignal,
  type TeamProfile,
} from 'twenty-shared/portable-functions';
