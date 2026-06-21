import {
  draftSectionFromAnswers,
  retrieveRelevantAnswers,
  type ReusableAnswerLike,
} from '@/local-db/research/researchAnswerLibrary';

const answers: ReusableAnswerLike[] = [
  {
    id: 'impact-p1',
    name: 'Impact — energy-efficient computing',
    questionType: 'IMPACT',
    projectId: 'p1',
    funder: '',
    content:
      'Reducing the energy per memory operation addresses a key bottleneck for edge AI and data-centre efficiency, with environmental and economic benefits.',
    tags: ['energy', 'computing'],
    timesUsed: 3,
  },
  {
    id: 'impact-other',
    name: 'Impact — health diagnostics',
    questionType: 'IMPACT',
    projectId: 'p2',
    funder: 'CIHR',
    content: 'Earlier diagnosis improves outcomes and reduces health costs.',
    tags: ['health'],
    timesUsed: 1,
  },
  {
    id: 'bio-pi',
    name: 'PI biography',
    questionType: 'BIO',
    projectId: null,
    funder: '',
    content:
      'Associate Professor of Physics at UBC studying quantum materials.',
    tags: ['bio'],
    timesUsed: 6,
  },
];

describe('retrieveRelevantAnswers', () => {
  it('ranks the same question-type + same-project answer first', () => {
    const ranked = retrieveRelevantAnswers(
      { questionType: 'IMPACT', projectId: 'p1' },
      answers,
    );
    expect(ranked[0].answer.id).toBe('impact-p1');
    expect(ranked[0].reasons).toEqual(
      expect.arrayContaining(['Same question type', 'Same project']),
    );
  });

  it('boosts an answer written for the same funder', () => {
    const ranked = retrieveRelevantAnswers(
      { questionType: 'IMPACT', funder: 'CIHR' },
      answers,
    );
    expect(ranked[0].answer.id).toBe('impact-other');
    expect(ranked[0].reasons.join(' ')).toMatch(/CIHR/);
  });

  it('uses wording overlap from the prompt text', () => {
    const ranked = retrieveRelevantAnswers(
      { promptText: 'Describe the energy and computing impact of your work' },
      answers,
    );
    expect(ranked[0].answer.id).toBe('impact-p1');
  });

  it('excludes answers with no signal', () => {
    const ranked = retrieveRelevantAnswers(
      { questionType: 'METHODOLOGY' },
      answers,
    );
    expect(ranked).toHaveLength(0);
  });
});

describe('draftSectionFromAnswers', () => {
  it('reuses the best answer and trims to the word limit', () => {
    const ranked = retrieveRelevantAnswers(
      { questionType: 'IMPACT', projectId: 'p1' },
      answers,
    );
    const draft = draftSectionFromAnswers(
      { sectionType: 'IMPACT', wordLimit: 5 },
      ranked,
    );
    expect(draft.sourceAnswerId).toBe('impact-p1');
    expect(draft.content.split(/\s+/).length).toBeLessThanOrEqual(6); // 5 + ellipsis token
    expect(draft.note).toMatch(/trimmed/i);
  });

  it('falls back to "start from scratch" when nothing matches', () => {
    const draft = draftSectionFromAnswers({ sectionType: 'TIMELINE' }, []);
    expect(draft.content).toBe('');
    expect(draft.sourceAnswerId).toBeUndefined();
    expect(draft.note).toMatch(/scratch/i);
  });
});
