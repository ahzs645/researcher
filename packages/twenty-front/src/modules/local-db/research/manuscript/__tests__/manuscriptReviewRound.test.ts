import { parseDecisionLetter } from '@/local-db/research/manuscript/manuscriptReviewLetter';
import {
  parseReviewPoints,
  reviewDecisionLabel,
  reviewPointsByReviewer,
  reviewPointsFromLetter,
  reviewPointTitle,
  reviewRoundProgress,
  serializeReviewPoints,
  sortReviewRounds,
  updateReviewPoint,
  type ReviewPoint,
} from '@/local-db/research/manuscript/manuscriptReviewRound';

const LETTER = [
  'Reviewer 1',
  '',
  '1. Shorten the introduction.',
  '2. Redraw Figure 3.',
  '',
  'Reviewer 2',
  '',
  '1. Report the uncertainty.',
].join('\n');

const point = (overrides: Partial<ReviewPoint> = {}): ReviewPoint => ({
  id: 'reviewer-1-1',
  reviewer: 'Reviewer 1',
  label: '1',
  heading: '',
  comment: 'Shorten the introduction.',
  response: '',
  sectionId: '',
  ...overrides,
});

describe('reviewPointsFromLetter', () => {
  it('gives every point a stable id derived from reviewer and label', () => {
    const points = reviewPointsFromLetter(parseDecisionLetter(LETTER));

    expect(points.map((entry) => entry.id)).toEqual([
      'reviewer-1-1',
      'reviewer-1-2',
      'reviewer-2-1',
    ]);
    expect(points.every((entry) => entry.response === '')).toBe(true);
  });

  it('keeps answers already written when the letter is parsed again', () => {
    const answered = updateReviewPoint(
      reviewPointsFromLetter(parseDecisionLetter(LETTER)),
      'reviewer-1-2',
      { response: 'Figure 3 has been redrawn.', sectionId: 'results' },
    );

    const reparsed = reviewPointsFromLetter(
      parseDecisionLetter(`${LETTER}\n2. Deposit the data.`),
      answered,
    );

    expect(reparsed).toHaveLength(4);
    expect(reparsed[1]).toMatchObject({
      id: 'reviewer-1-2',
      response: 'Figure 3 has been redrawn.',
      sectionId: 'results',
    });
    expect(reparsed[3].response).toBe('');
  });

  it('re-matches an answer whose point was renumbered', () => {
    const answered = [
      point({
        id: 'reviewer-1-3',
        label: '3',
        response: 'Done.',
      }),
    ];

    const reparsed = reviewPointsFromLetter(
      parseDecisionLetter(LETTER),
      answered,
    );

    expect(reparsed[0]).toMatchObject({
      id: 'reviewer-1-1',
      response: 'Done.',
    });
  });
});

describe('parseReviewPoints', () => {
  it('round-trips through the record field', () => {
    const points = reviewPointsFromLetter(parseDecisionLetter(LETTER));

    expect(parseReviewPoints(serializeReviewPoints(points))).toEqual(points);
  });

  it('returns nothing for an empty, malformed or non-list field', () => {
    expect(parseReviewPoints(null)).toEqual([]);
    expect(parseReviewPoints('')).toEqual([]);
    expect(parseReviewPoints('{ not json')).toEqual([]);
    expect(parseReviewPoints('{"points":[]}')).toEqual([]);
  });

  it('fills the missing halves of a hand-edited entry', () => {
    expect(
      parseReviewPoints('[{"reviewer":"Reviewer 1","comment":"Do the thing"}]'),
    ).toEqual([
      {
        id: 'reviewer-1-1',
        reviewer: 'Reviewer 1',
        label: '',
        heading: '',
        comment: 'Do the thing',
        response: '',
        sectionId: '',
      },
    ]);
  });

  it('keeps duplicate ids apart so two points cannot edit as one', () => {
    expect(
      parseReviewPoints('[{"id":"same"},{"id":"same"}]').map(
        (entry) => entry.id,
      ),
    ).toEqual(['same', 'same-2']);
  });
});

describe('reviewRoundProgress', () => {
  it('counts only points with a response written', () => {
    expect(
      reviewRoundProgress([
        point({ response: 'Shortened.' }),
        point({ id: 'reviewer-1-2', response: '   ' }),
        point({ id: 'reviewer-2-1' }),
      ]),
    ).toEqual({ answered: 1, total: 3 });
  });
});

describe('reviewPointsByReviewer', () => {
  it('groups points in the order the letter named the reviewers', () => {
    const groups = reviewPointsByReviewer(
      reviewPointsFromLetter(parseDecisionLetter(LETTER)),
    );

    expect(groups.map((group) => group.reviewer)).toEqual([
      'Reviewer 1',
      'Reviewer 2',
    ]);
    expect(groups[0].points).toHaveLength(2);
  });
});

describe('sortReviewRounds', () => {
  it('puts the most recent decision first, falling back to creation time', () => {
    expect(
      sortReviewRounds([
        { id: 'first', decisionDate: '2026-01-04T00:00:00.000Z' },
        { id: 'third', createdAt: '2026-05-01T00:00:00.000Z' },
        { id: 'second', decisionDate: '2026-03-09T00:00:00.000Z' },
      ]).map((round) => round.id),
    ).toEqual(['third', 'second', 'first']);
  });
});

describe('reviewPointTitle', () => {
  it('names a numbered point and a reviewer’s opening remarks differently', () => {
    expect(reviewPointTitle('2.1')).toBe('Comment 2.1');
    expect(reviewPointTitle('General')).toBe('General comments');
  });
});

describe('reviewDecisionLabel', () => {
  it('reads a decision, and passes an unknown one through unchanged', () => {
    expect(reviewDecisionLabel('MAJOR_REVISION')).toBe('Major revision');
    expect(reviewDecisionLabel('')).toBe('');
    expect(reviewDecisionLabel('DESK_REJECT')).toBe('DESK_REJECT');
  });
});
