// A round of peer review as the author sees it: the decision that came back,
// and the reviewer points still to be answered. The points ride in the round
// record's `points` field as JSON — they only ever matter inside their round,
// and re-parsing an edited letter can then replace the whole list at once
// instead of reconciling a table of child records.

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import {
  type ParsedDecisionLetter,
  reviewPointId,
} from './manuscriptReviewLetter';

export type ReviewDecision =
  | 'MAJOR_REVISION'
  | 'MINOR_REVISION'
  | 'REJECT'
  | 'ACCEPT';

export const REVIEW_DECISION_LABELS: Record<ReviewDecision, string> = {
  MAJOR_REVISION: 'Major revision',
  MINOR_REVISION: 'Minor revision',
  REJECT: 'Reject',
  ACCEPT: 'Accept',
};

export const REVIEW_DECISIONS = Object.keys(
  REVIEW_DECISION_LABELS,
) as ReviewDecision[];

export const reviewDecisionLabel = (
  decision: string | null | undefined,
): string =>
  isNonEmptyString(decision)
    ? (REVIEW_DECISION_LABELS[decision as ReviewDecision] ?? decision)
    : '';

export type ReviewPoint = {
  id: string;
  reviewer: string;
  label: string;
  heading: string;
  comment: string;
  response: string;
  // Id of the manuscriptSection the change landed in. Sections are records, so
  // a response points at one rather than repeating its title — rename the
  // section and the response document follows.
  sectionId: string;
};

// The shape the panel and the document builders need from a round record,
// independent of how the bridge returns it.
export type ReviewRoundLike = {
  id: string;
  name?: string | null;
  journal?: string | null;
  decision?: string | null;
  decisionDate?: string | null;
  letter?: string | null;
  points?: string | null;
  createdAt?: string | null;
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

export const parseReviewPoints = (
  raw: string | null | undefined,
): ReviewPoint[] => {
  if (!isNonEmptyString(raw)) return [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    // A hand-edited field is not worth losing the round over; the letter is
    // still stored, so the author can re-parse it.
    return [];
  }
  if (!Array.isArray(decoded)) return [];
  const used = new Set<string>();
  const points: ReviewPoint[] = [];
  for (const entry of decoded) {
    if (entry === null || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const reviewer = asText(candidate.reviewer);
    const label = asText(candidate.label);
    const id = isNonEmptyString(asText(candidate.id))
      ? asText(candidate.id)
      : reviewPointId(reviewer, label || String(points.length + 1));
    const uniqueId = used.has(id) ? `${id}-${points.length + 1}` : id;
    used.add(uniqueId);
    points.push({
      id: uniqueId,
      reviewer,
      label,
      heading: asText(candidate.heading),
      comment: asText(candidate.comment),
      response: asText(candidate.response),
      sectionId: asText(candidate.sectionId),
    });
  }
  return points;
};

export const serializeReviewPoints = (points: ReviewPoint[]): string =>
  JSON.stringify(points);

// Turn a freshly parsed letter into the round's points, keeping the answers
// already written. Re-parsing happens whenever the author fixes a letter that
// pasted badly, and losing a morning's responses to that would be worse than
// the bad parse.
export const reviewPointsFromLetter = (
  parsed: ParsedDecisionLetter,
  existingPoints: ReviewPoint[] = [],
): ReviewPoint[] => {
  const byId = new Map(existingPoints.map((point) => [point.id, point]));
  const byComment = new Map(
    existingPoints
      .filter((point) => isNonEmptyString(point.comment))
      .map((point) => [point.comment.trim(), point]),
  );
  const used = new Set<string>();
  return parsed.points.map((point, index) => {
    const baseId = reviewPointId(point.reviewer, point.label);
    const id = used.has(baseId) ? `${baseId}-${index + 1}` : baseId;
    used.add(id);
    const previous = byId.get(id) ?? byComment.get(point.comment.trim());
    return {
      id,
      reviewer: point.reviewer,
      label: point.label,
      heading: point.heading,
      comment: point.comment,
      response: previous?.response ?? '',
      sectionId: previous?.sectionId ?? '',
    };
  });
};

export const updateReviewPoint = (
  points: ReviewPoint[],
  pointId: string,
  patch: Partial<Pick<ReviewPoint, 'response' | 'sectionId'>>,
): ReviewPoint[] =>
  points.map((point) =>
    point.id === pointId ? { ...point, ...patch } : point,
  );

// "Comment 1", but "General comments" for the remarks a reviewer makes before
// their first numbered point — "Comment General" reads like a mistake.
export const reviewPointTitle = (label: string): string =>
  label === 'General' ? 'General comments' : `Comment ${label}`;

export type ReviewRoundProgress = {
  answered: number;
  total: number;
};

export const reviewRoundProgress = (
  points: ReviewPoint[],
): ReviewRoundProgress => ({
  answered: points.filter((point) => isNonEmptyString(point.response.trim()))
    .length,
  total: points.length,
});

// Grouped in the order the letter named its reviewers, so the panel and the
// response document read in the same order the reviewers did.
export const reviewPointsByReviewer = (
  points: ReviewPoint[],
): Array<{ reviewer: string; points: ReviewPoint[] }> => {
  const groups: Array<{ reviewer: string; points: ReviewPoint[] }> = [];
  for (const point of points) {
    const existing = groups.find((group) => group.reviewer === point.reviewer);
    if (isDefined(existing)) {
      existing.points.push(point);
      continue;
    }
    groups.push({ reviewer: point.reviewer, points: [point] });
  }
  return groups;
};

const roundSortKey = (round: ReviewRoundLike): string =>
  round.decisionDate ?? round.createdAt ?? '';

// Newest round first: the one being answered is the one just received.
export const sortReviewRounds = <TRound extends ReviewRoundLike>(
  rounds: TRound[],
): TRound[] =>
  [...rounds].sort((first, second) =>
    roundSortKey(second).localeCompare(roundSortKey(first)),
  );
