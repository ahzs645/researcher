import { parseDecisionLetter } from '@/local-db/research/manuscript/manuscriptReviewLetter';
import {
  buildReviewResponseMarkdown,
  reviewResponseFilenameBase,
  reviewResponseMarkdownFile,
  submissionReviewResponseMarkdown,
  type ReviewResponseDocumentInput,
} from '@/local-db/research/manuscript/manuscriptReviewResponse';
import {
  reviewPointsFromLetter,
  serializeReviewPoints,
  updateReviewPoint,
} from '@/local-db/research/manuscript/manuscriptReviewRound';

const LETTER = [
  'Reviewer 1',
  '',
  'Major comments',
  '',
  '1. The introduction is too long.',
  '2. Figure 3 is unreadable at print size.',
  '',
  'Reviewer 2',
  '',
  '1. Report the uncertainty on the hourly means.',
].join('\n');

const SECTIONS = [
  { id: 'introduction', name: 'Introduction' },
  { id: 'results', name: 'Results' },
];

const answeredPoints = () => {
  const parsed = reviewPointsFromLetter(parseDecisionLetter(LETTER));
  return updateReviewPoint(
    updateReviewPoint(parsed, 'reviewer-1-1', {
      response: 'The introduction is now two paragraphs shorter.',
      sectionId: 'introduction',
    }),
    'reviewer-1-2',
    { response: 'Figure 3 has been redrawn at 8 pt.' },
  );
};

const documentInput = (
  overrides: Partial<ReviewResponseDocumentInput> = {},
): ReviewResponseDocumentInput => ({
  manuscriptTitle: 'Reusable air-quality paper',
  roundName: 'Round 1',
  journal: 'Atmospheric Environment',
  decision: 'MAJOR_REVISION',
  decisionDate: '2026-03-04T00:00:00.000Z',
  points: answeredPoints(),
  sections: SECTIONS,
  ...overrides,
});

describe('buildReviewResponseMarkdown', () => {
  it('quotes each point, answers it, and names the section that changed', () => {
    expect(buildReviewResponseMarkdown(documentInput())).toBe(
      [
        '**Manuscript:** Reusable air-quality paper',
        '**Journal:** Atmospheric Environment',
        '**Round:** Round 1',
        '**Decision:** Major revision (2026-03-04)',
        '',
        '## Reviewer 1',
        '',
        '### Major comments',
        '',
        '**Comment 1**',
        '',
        '> The introduction is too long.',
        '',
        '**Response**',
        '',
        'The introduction is now two paragraphs shorter.',
        '',
        '*Changed in: Introduction*',
        '',
        '**Comment 2**',
        '',
        '> Figure 3 is unreadable at print size.',
        '',
        '**Response**',
        '',
        'Figure 3 has been redrawn at 8 pt.',
        '',
        '## Reviewer 2',
        '',
        '**Comment 1**',
        '',
        '> Report the uncertainty on the hourly means.',
        '',
        '**Response**',
        '',
        '_No response written yet._',
        '',
      ].join('\n'),
    );
  });

  it('quotes every line of a multi-paragraph point', () => {
    const markdown = buildReviewResponseMarkdown(
      documentInput({
        points: [
          {
            id: 'reviewer-1-1',
            reviewer: 'Reviewer 1',
            label: '1',
            heading: '',
            comment:
              'The authors write:\n\n    We collected samples.\n\nWhere?',
            response: 'Clarified.',
            sectionId: '',
          },
        ],
      }),
    );

    expect(markdown).toContain(
      [
        '> The authors write:',
        '>',
        '> We collected samples.',
        '>',
        '> Where?',
      ].join('\n'),
    );
  });

  it('drops a section pointer that no longer resolves to a section', () => {
    const markdown = buildReviewResponseMarkdown(
      documentInput({ sections: [{ id: 'results', name: 'Results' }] }),
    );

    expect(markdown).not.toContain('Changed in:');
  });

  it('says a round has no points rather than producing an empty document', () => {
    expect(
      buildReviewResponseMarkdown(documentInput({ points: [] })),
    ).toContain('No reviewer points have been recorded for this round yet.');
  });

  it('leaves out a journal, round or decision the author has not filled in', () => {
    const markdown = buildReviewResponseMarkdown(
      documentInput({
        journal: '',
        roundName: '',
        decision: '',
        decisionDate: '',
      }),
    );

    expect(markdown.split('\n')[0]).toBe(
      '**Manuscript:** Reusable air-quality paper',
    );
    expect(markdown).not.toContain('**Decision:**');
  });

  it('adds the document title only in the Markdown file', () => {
    expect(reviewResponseMarkdownFile(documentInput())).toMatch(
      /^# Response to reviewers\n\n\*\*Manuscript:\*\*/,
    );
  });
});

describe('reviewResponseFilenameBase', () => {
  it('names the file after the manuscript and the round', () => {
    expect(
      reviewResponseFilenameBase('Reusable air-quality paper', 'Round 2'),
    ).toBe('reusable-air-quality-paper-round-2-response');
  });
});

describe('submissionReviewResponseMarkdown', () => {
  const answeredRound = {
    id: 'round-1',
    name: 'Round 1',
    journal: 'Atmospheric Environment',
    decision: 'MAJOR_REVISION',
    decisionDate: '2026-03-04T00:00:00.000Z',
    points: serializeReviewPoints(answeredPoints()),
  };
  const unansweredRound = {
    id: 'round-2',
    name: 'Round 2',
    decisionDate: '2026-06-01T00:00:00.000Z',
    points: serializeReviewPoints(
      reviewPointsFromLetter(parseDecisionLetter(LETTER)),
    ),
  };

  it('ships the newest round that has been answered', () => {
    const markdown = submissionReviewResponseMarkdown(
      [answeredRound, unansweredRound],
      SECTIONS,
      'Reusable air-quality paper',
    );

    expect(markdown).toContain('**Round:** Round 1');
  });

  it('ships nothing when no round has an answer yet', () => {
    expect(
      submissionReviewResponseMarkdown(
        [unansweredRound],
        SECTIONS,
        'Reusable air-quality paper',
      ),
    ).toBeNull();
    expect(
      submissionReviewResponseMarkdown([], SECTIONS, 'A paper'),
    ).toBeNull();
  });
});
