import {
  buildSectionSkeleton,
  wordLimitStatus,
} from '../manuscriptScaffold';

describe('buildSectionSkeleton', () => {
  it('builds an IMRaD skeleton for a journal paper', () => {
    const skeleton = buildSectionSkeleton('JOURNAL_PAPER');
    const types = skeleton.map((section) => section.sectionType);
    expect(types).toEqual([
      'TITLE_PAGE',
      'ABSTRACT',
      'KEYWORDS',
      'INTRODUCTION',
      'METHODS',
      'RESULTS',
      'DISCUSSION',
      'CONCLUSION',
      'ACKNOWLEDGMENTS',
      'AUTHOR_CONTRIBUTIONS',
      'FUNDING',
      'CONFLICTS',
      'DATA_AVAILABILITY',
      'REFERENCES',
    ]);
    expect(skeleton.map((section) => section.orderIndex)).toEqual(
      skeleton.map((_, index) => index),
    );
  });

  it('builds a thesis skeleton with a literature review and appendices', () => {
    const types = buildSectionSkeleton('THESIS').map((s) => s.sectionType);
    expect(types).toContain('BACKGROUND');
    expect(types).toContain('APPENDIX');
    expect(types).not.toContain('AUTHOR_CONTRIBUTIONS');
  });

  it('applies the journal abstract word limit to the abstract section', () => {
    const skeleton = buildSectionSkeleton('JOURNAL_PAPER', {
      abstractWordLimit: 150,
    });
    const abstract = skeleton.find((s) => s.sectionType === 'ABSTRACT');
    expect(abstract?.wordLimit).toBe(150);
    // Non-abstract sections carry no limit.
    expect(
      skeleton.find((s) => s.sectionType === 'INTRODUCTION')?.wordLimit,
    ).toBeUndefined();
  });

  it('falls back to a default abstract limit and IMRaD for unknown types', () => {
    const skeleton = buildSectionSkeleton('SOMETHING_ELSE');
    expect(skeleton.find((s) => s.sectionType === 'ABSTRACT')?.wordLimit).toBe(
      250,
    );
  });
});

describe('wordLimitStatus', () => {
  it('reports remaining words and flags overruns', () => {
    expect(wordLimitStatus(120, 150)).toEqual({
      wordCount: 120,
      wordLimit: 150,
      over: false,
      remaining: 30,
    });
    expect(wordLimitStatus(170, 150).over).toBe(true);
    expect(wordLimitStatus(170, 150).remaining).toBe(-20);
  });

  it('treats a missing/zero limit as no limit', () => {
    expect(wordLimitStatus(500, null)).toEqual({
      wordCount: 500,
      wordLimit: null,
      over: false,
      remaining: null,
    });
    expect(wordLimitStatus(500, 0).wordLimit).toBeNull();
  });
});
