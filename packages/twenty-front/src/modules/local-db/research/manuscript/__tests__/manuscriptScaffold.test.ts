import {
  buildSectionSkeleton,
  missingScaffoldSections,
  parseJournalSectionSkeleton,
  wordLimitStatus,
} from '@/local-db/research/manuscript/manuscriptScaffold';

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

  it('prefers the journal section skeleton when the template defines one', () => {
    const skeleton = buildSectionSkeleton('JOURNAL_PAPER', {
      abstractWordLimit: 150,
      sectionSkeleton: JSON.stringify([
        { name: 'Abstract', sectionType: 'ABSTRACT', placement: 'FRONT_MATTER' },
        { name: 'Introduction', sectionType: 'INTRODUCTION', placement: 'MAIN' },
        {
          name: 'Results and discussion',
          sectionType: 'RESULTS',
          placement: 'MAIN',
        },
        { name: 'Methods', sectionType: 'METHODS', placement: 'BACK_MATTER' },
        { name: 'References', sectionType: 'REFERENCES', placement: 'BACK_MATTER' },
      ]),
    });

    expect(skeleton.map((section) => section.name)).toEqual([
      'Abstract',
      'Introduction',
      'Results and discussion',
      'Methods',
      'References',
    ]);
    expect(skeleton[0].wordLimit).toBe(150);
    expect(skeleton[2].wordLimit).toBeUndefined();
  });

  it('keeps per-entry word limits from the journal skeleton', () => {
    const skeleton = buildSectionSkeleton('JOURNAL_PAPER', {
      sectionSkeleton: JSON.stringify([
        {
          name: 'Abstract',
          sectionType: 'ABSTRACT',
          placement: 'FRONT_MATTER',
          wordLimit: 100,
        },
        {
          name: 'Highlights',
          sectionType: 'OTHER',
          placement: 'FRONT_MATTER',
          wordLimit: 85,
        },
      ]),
    });

    expect(skeleton[0].wordLimit).toBe(100);
    expect(skeleton[1].wordLimit).toBe(85);
  });
});

describe('parseJournalSectionSkeleton', () => {
  it('rejects malformed skeletons instead of half-applying them', () => {
    expect(parseJournalSectionSkeleton('not json')).toBeNull();
    expect(parseJournalSectionSkeleton('{}')).toBeNull();
    expect(parseJournalSectionSkeleton('[]')).toBeNull();
    expect(
      parseJournalSectionSkeleton(
        JSON.stringify([{ name: 'X', sectionType: 'NOPE', placement: 'MAIN' }]),
      ),
    ).toBeNull();
    expect(
      parseJournalSectionSkeleton(
        JSON.stringify([
          { name: 'X', sectionType: 'OTHER', placement: 'MAIN', wordLimit: -3 },
        ]),
      ),
    ).toBeNull();
  });
});

describe('missingScaffoldSections', () => {
  it('drops sections the manuscript already has, by type or by name', () => {
    const skeleton = buildSectionSkeleton('JOURNAL_PAPER');
    const missing = missingScaffoldSections(skeleton, [
      { id: '1', name: 'References', sectionType: 'REFERENCES' },
      { id: '2', name: 'My introduction', sectionType: 'OTHER' },
      { id: '3', name: 'Abstract', sectionType: 'ABSTRACT' },
    ]);

    const names = missing.map((draft) => draft.name);
    expect(names).not.toContain('References');
    expect(names).not.toContain('Abstract');
    expect(names).toContain('Introduction');
    expect(names).toContain('Methods');
  });

  it('treats renamed singleton sections as present via their type', () => {
    const skeleton = buildSectionSkeleton('JOURNAL_PAPER');
    const missing = missingScaffoldSections(skeleton, [
      {
        id: '1',
        name: 'Declaration of interests',
        sectionType: 'CONFLICTS',
      },
    ]);

    expect(missing.map((draft) => draft.name)).not.toContain(
      'Conflicts of interest',
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
