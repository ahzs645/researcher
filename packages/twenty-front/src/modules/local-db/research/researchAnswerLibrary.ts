import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

// The reuse loop: when you start a new application section, find the closest
// answers you already wrote — scoped by question type, project, and funder — so
// every application you fill in makes the next one faster.
//
// Retrieval is deterministic lexical scoring here (no backend, works offline).
// The same `retrieveRelevantAnswers` signature is what a Convex vector-search
// action would back later; `AiAnswerDrafter` is the seam where a model adapts a
// retrieved answer to a new prompt + word limit.

export type ReusableAnswerLike = {
  id: string;
  name?: string | null;
  questionType?: string | null;
  content?: string | null;
  funder?: string | null;
  projectId?: string | null;
  tags?: string[] | null;
  wordCount?: number | null;
  timesUsed?: number | null;
};

export type AnswerQuery = {
  questionType?: string | null;
  projectId?: string | null;
  funder?: string | null;
  // The funder's prompt / the section title we're trying to answer.
  promptText?: string | null;
};

export type RankedAnswer = {
  answer: ReusableAnswerLike;
  score: number;
  reasons: string[];
};

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'for',
  'to',
  'and',
  'or',
  'is',
  'in',
  'on',
  'with',
  'this',
  'that',
  'your',
  'our',
  'we',
  'how',
  'what',
  'why',
  'please',
  'describe',
  'provide',
  'explain',
  'project',
  'research',
  'will',
]);

const tokenize = (value: string | null | undefined): Set<string> => {
  const tokens = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 3 && !STOPWORDS.has(token));
  return new Set(tokens);
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
};

const funderMatches = (
  queryFunder: string | null | undefined,
  answerFunder: string | null | undefined,
): boolean => {
  const query = (queryFunder ?? '').toLowerCase().trim();
  const answer = (answerFunder ?? '').toLowerCase().trim();
  if (query.length === 0 || answer.length === 0) return false;
  return query.includes(answer) || answer.includes(query);
};

// Rank the library against a query. Returns every answer that has any signal,
// best first. A pure function so it can power a panel, a test, or a re-rank.
export const retrieveRelevantAnswers = (
  query: AnswerQuery,
  answers: ReusableAnswerLike[],
): RankedAnswer[] => {
  const promptTokens = tokenize(query.promptText);

  const ranked = answers.map((answer): RankedAnswer => {
    const reasons: string[] = [];
    let score = 0;

    if (
      query.questionType &&
      answer.questionType &&
      query.questionType === answer.questionType
    ) {
      score += 3;
      reasons.push('Same question type');
    }
    if (
      query.projectId &&
      answer.projectId &&
      query.projectId === answer.projectId
    ) {
      score += 2;
      reasons.push('Same project');
    }
    if (funderMatches(query.funder, answer.funder)) {
      score += 1.5;
      reasons.push(`Written for ${answer.funder}`);
    }

    const answerTokens = tokenize(
      `${answer.name ?? ''} ${(answer.tags ?? []).join(' ')} ${answer.content ?? ''}`,
    );
    const similarity = jaccard(promptTokens, answerTokens);
    if (similarity > 0) {
      score += Math.min(2, similarity * 4);
      reasons.push(`Wording overlap (${Math.round(similarity * 100)}%)`);
    }

    // Tiny tiebreaker toward answers that have proven reusable — but only once
    // there's a real signal, so prior usage never surfaces an irrelevant answer.
    if (score > 0) {
      score += Math.min(0.5, (answer.timesUsed ?? 0) * 0.1);
    }

    return { answer, score, reasons };
  });

  return ranked
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
};

export type AnswerDraftRequest = {
  sectionType?: string | null;
  prompt?: string | null;
  wordLimit?: number | null;
  projectSummary?: string | null;
};

export type AnswerDraft = {
  content: string;
  sourceAnswerId?: string;
  note: string;
};

// The seam an AI drafter implements (adapt a retrieved answer to the new prompt
// + word limit, weaving in the project context). Callers depend on this type.
export type AiAnswerDrafter = (
  request: AnswerDraftRequest,
  candidates: RankedAnswer[],
) => Promise<AnswerDraft>;

const countWords = (value: string): number =>
  value.trim().length === 0 ? 0 : value.trim().split(/\s+/).length;

const trimToWordLimit = (
  value: string,
  limit: number | null | undefined,
): string => {
  if (!limit || limit <= 0) return value;
  const words = value.trim().split(/\s+/);
  if (words.length <= limit) return value;
  return words.slice(0, limit).join(' ') + '…';
};

// Deterministic draft: reuse the best-matching prior answer verbatim (trimmed to
// the new word limit). No model — it just stages the closest thing you've
// already written for a human to adapt. The AI drafter replaces this body.
export const draftSectionFromAnswers = (
  request: AnswerDraftRequest,
  candidates: RankedAnswer[],
): AnswerDraft => {
  const best = candidates[0];
  if (!isDefined(best) || !isNonEmptyString(best.answer.content)) {
    return {
      content: '',
      note: 'No reusable answer matched — start from scratch.',
    };
  }
  const content = trimToWordLimit(best.answer.content, request.wordLimit);
  const overLimit =
    isDefined(request.wordLimit) &&
    request.wordLimit > 0 &&
    countWords(best.answer.content) > request.wordLimit;
  return {
    content,
    sourceAnswerId: best.answer.id,
    note: overLimit
      ? `Reused "${best.answer.name}" (trimmed to ${request.wordLimit} words — review before submitting).`
      : `Reused "${best.answer.name}" (${best.reasons.join(', ')}). Adapt to this prompt before submitting.`,
  };
};
