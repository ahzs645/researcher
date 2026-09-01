import { type ImportedSectionDraft } from '@/local-db/research/manuscript/manuscriptDocImport';
import { preparePortableResearchPaperImport } from '@/local-db/research/manuscript/manuscriptPortableImport';
import {
  buildPortableResearchPaperManifest,
  parsePortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_FORMAT,
  PORTABLE_MANUSCRIPT_READABLE_VERSIONS,
  PORTABLE_MANUSCRIPT_VERSION,
  type PortableManuscriptSource,
  type PortableResearchPaperManifest,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';
import { portableReviewRoundRecords } from '@/local-db/research/manuscript/manuscriptPortableReviewRounds';
import {
  parseReviewPoints,
  serializeReviewPoints,
  type ReviewPoint,
  type ReviewRoundLike,
} from '@/local-db/research/manuscript/manuscriptReviewRound';

const METHODS_ID = 'methods-id';

const point = (overrides: Partial<ReviewPoint>): ReviewPoint => ({
  id: 'reviewer-1-1',
  reviewer: 'Reviewer 1',
  label: '1',
  heading: 'Major comments',
  comment: 'The sampling window is not justified.',
  response: '',
  sectionId: '',
  ...overrides,
});

const ANSWERED_POINTS: ReviewPoint[] = [
  point({
    response:
      'We now state the window is set by the instrument duty cycle (Methods, para 2).',
    sectionId: METHODS_ID,
  }),
  point({
    id: 'reviewer-2-1',
    reviewer: 'Reviewer 2',
    label: '1',
    heading: '',
    comment: 'Figure 3 is unreadable in print.',
    response: 'Redrawn at 600 dpi.',
  }),
];

const SECOND_ROUND_POINTS: ReviewPoint[] = [
  point({
    id: 'editor-general',
    reviewer: 'Editor',
    label: 'General',
    heading: '',
    comment: 'Please shorten the discussion.',
  }),
];

const reviewedSource = (
  rounds: ReviewRoundLike[] | undefined = undefined,
): PortableManuscriptSource => ({
  manuscript: { title: 'Brown carbon over the boreal forest' },
  sections: [
    {
      id: 'abstract-id',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      content: 'Brown carbon absorbs.',
      orderIndex: 0,
      wordCount: 3,
    },
    {
      id: METHODS_ID,
      name: 'Methods',
      sectionType: 'METHODS',
      placement: 'MAIN',
      content: 'Filters were digested.',
      orderIndex: 1,
      wordCount: 3,
    },
  ],
  figures: [],
  references: [],
  ...(rounds === undefined ? {} : { reviewRounds: rounds }),
});

const twoRounds = (): ReviewRoundLike[] => [
  {
    id: 'round-1-id',
    name: 'Round 1',
    journal: 'Nature Materials',
    decision: 'MAJOR_REVISION',
    decisionDate: '2026-06-18T00:00:00.000Z',
    letter: 'Reviewer 1\n\n1. The sampling window is not justified.',
    points: serializeReviewPoints(ANSWERED_POINTS),
  },
  {
    id: 'round-2-id',
    name: 'Round 2',
    journal: 'Nature Materials',
    decision: 'MINOR_REVISION',
    decisionDate: '2026-09-02T00:00:00.000Z',
    letter: 'Editor\n\nPlease shorten the discussion.',
    points: serializeReviewPoints(SECOND_ROUND_POINTS),
  },
];

// The package as it reaches the importer: written to JSON and read back.
const readBack = (
  source: PortableManuscriptSource,
): PortableResearchPaperManifest =>
  parsePortableResearchPaperManifest(
    JSON.stringify(buildPortableResearchPaperManifest(source, {}, {})),
  );

const sectionDrafts = (
  manifest: PortableResearchPaperManifest,
): ImportedSectionDraft[] =>
  manifest.sections.map((section) => ({
    name: section.name,
    sectionType: section.sectionType,
    placement: section.placement,
    content: section.content,
    orderIndex: section.orderIndex,
    level: section.level ?? 1,
    wordCount: section.wordCount,
    includeInExport: section.includeInExport,
    status: section.status,
  }));

// What the commit step does: a record per section, remembered by `orderIndex`,
// which is the handle the rounds' section pointers come back as.
const createSections = (
  drafts: ImportedSectionDraft[],
): Map<number, string> => {
  const idsByOrderIndex = new Map<number, string>();
  drafts.forEach((draft, index) => {
    idsByOrderIndex.set(draft.orderIndex, `created-section-${index + 1}`);
  });
  return idsByOrderIndex;
};

// The whole trip: export, JSON, import, create the sections, build the round
// records the commit step would.
const restoreRounds = (
  source: PortableManuscriptSource,
  dropSectionIds: number[] = [],
) => {
  const manifest = readBack(source);
  const prepared = preparePortableResearchPaperImport(
    manifest,
    sectionDrafts(manifest),
  );
  const sectionIds = createSections(prepared.sections);
  for (const orderIndex of dropSectionIds) sectionIds.delete(orderIndex);
  return {
    manifest,
    prepared,
    sectionIds,
    records: portableReviewRoundRecords(
      prepared.reviewRounds ?? [],
      sectionIds,
    ),
  };
};

describe('a portable package carrying review rounds', () => {
  it('writes every round, its letter and its answered points', () => {
    const manifest = buildPortableResearchPaperManifest(
      reviewedSource(twoRounds()),
      {},
      {},
    );
    const [first, second] = manifest.reviewRounds ?? [];

    expect(manifest.reviewRounds).toHaveLength(2);
    expect(first).toMatchObject({
      key: 'review-round-1',
      name: 'Round 1',
      journal: 'Nature Materials',
      decision: 'MAJOR_REVISION',
      decisionDate: '2026-06-18T00:00:00.000Z',
    });
    expect(first.letter).toContain('The sampling window is not justified.');
    expect(first.points?.[0]).toMatchObject({
      id: 'reviewer-1-1',
      reviewer: 'Reviewer 1',
      label: '1',
      heading: 'Major comments',
      comment: 'The sampling window is not justified.',
      response:
        'We now state the window is set by the instrument duty cycle (Methods, para 2).',
    });
    expect(second.name).toBe('Round 2');
    expect(second.points?.[0].comment).toBe('Please shorten the discussion.');
  });

  it('points at the section by its manifest key, never by a record id', () => {
    const manifest = buildPortableResearchPaperManifest(
      reviewedSource(twoRounds()),
      {},
      {},
    );
    const methods = manifest.sections[1];

    // The same handle a figure and a section version use: an id minted in one
    // workspace names nothing in the workspace the package is opened in.
    expect(manifest.reviewRounds?.[0].points?.[0].sectionKey).toBe(methods.key);
    expect(JSON.stringify(manifest.reviewRounds)).not.toContain(METHODS_ID);
  });

  it('leaves off what a round has nothing to say for', () => {
    const manifest = buildPortableResearchPaperManifest(
      reviewedSource(twoRounds()),
      {},
      {},
    );
    const [, unanswered] = manifest.reviewRounds?.[0].points ?? [];
    const editorPoint = manifest.reviewRounds?.[1].points?.[0];

    // An unanswered point carries no `response` and a point that changed
    // nothing carries no `sectionKey` — writing empty strings would make every
    // point look like it named a section that has since gone.
    expect(unanswered).not.toHaveProperty('sectionKey');
    expect(editorPoint).not.toHaveProperty('response');
    expect(editorPoint).not.toHaveProperty('heading');
  });

  it('carries a round whose letter has not been split into points yet', () => {
    const [firstRound] = twoRounds();
    const manifest = buildPortableResearchPaperManifest(
      reviewedSource([{ ...firstRound, points: null }]),
      {},
      {},
    );

    // The letter is what the points are re-parsed from, so the round is still
    // worth carrying — it is only the point list that is absent.
    expect(manifest.reviewRounds?.[0].letter).toContain('Reviewer 1');
    expect(manifest.reviewRounds?.[0]).not.toHaveProperty('points');
  });
});

describe('restoring review rounds from a portable package', () => {
  it('brings both rounds back with their responses and section pointers', () => {
    const { prepared, sectionIds, records } = restoreRounds(
      reviewedSource(twoRounds()),
    );
    const restoredPoints = records.map((record) =>
      parseReviewPoints(record.points),
    );

    expect(prepared.warnings).toEqual([]);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      name: 'Round 1',
      journal: 'Nature Materials',
      decision: 'MAJOR_REVISION',
      decisionDate: '2026-06-18T00:00:00.000Z',
    });
    expect(records[0].letter).toContain(
      'The sampling window is not justified.',
    );
    expect(restoredPoints[0]).toEqual(
      ANSWERED_POINTS.map((entry) => ({
        ...entry,
        // The one thing that changes: the point now names the section record
        // this workspace just created, not the one the package was made from.
        sectionId: entry.sectionId === METHODS_ID ? sectionIds.get(1) : '',
      })),
    );
    expect(restoredPoints[1]).toEqual(SECOND_ROUND_POINTS);
    expect(sectionIds.get(1)).not.toBe(METHODS_ID);
  });

  it('keeps a point whose section is not in the package, and says so', () => {
    // The Methods section was left out of the export; the answer written
    // against it was not.
    const source = reviewedSource(twoRounds());
    source.sections = source.sections.filter(
      (section) => section.id !== METHODS_ID,
    );
    const { prepared, records } = restoreRounds(source);
    const [answered] = parseReviewPoints(records[0].points);

    expect(answered.response).toContain('instrument duty cycle');
    expect(answered.sectionId).toBe('');
    expect(prepared.warnings).toHaveLength(1);
    expect(prepared.warnings?.[0]).toContain('Comment 1');
    expect(prepared.warnings?.[0]).toContain('Round 1');
    expect(prepared.warnings?.[0]).toContain('does not contain');
  });

  it('empties the pointer when the section was never created', () => {
    // An import that stopped early, or a section dropped as an orphaned
    // version: half a pointer would aim the answer at another section's id.
    const { records } = restoreRounds(reviewedSource(twoRounds()), [1]);
    const [answered] = parseReviewPoints(records[0].points);

    expect(answered.response).toContain('instrument duty cycle');
    expect(answered.sectionId).toBe('');
  });

  it('drops a decision the record would refuse rather than the round', () => {
    const [firstRound, secondRound] = twoRounds();
    const { records } = restoreRounds(
      reviewedSource([
        { ...firstRound, decision: 'REVISE_AND_RESUBMIT' },
        secondRound,
      ]),
    );

    expect(records[0]).not.toHaveProperty('decision');
    expect(records[0].name).toBe('Round 1');
    expect(parseReviewPoints(records[0].points)).toHaveLength(2);
  });

  it('restores nothing extra from a round with no points', () => {
    const [firstRound] = twoRounds();
    const { records } = restoreRounds(
      reviewedSource([{ ...firstRound, points: null }]),
    );

    expect(records[0].letter).toContain('Reviewer 1');
    expect(records[0]).not.toHaveProperty('points');
  });
});

describe('packages without review rounds', () => {
  it('writes a manuscript with no rounds exactly as it did before', () => {
    const withoutField = buildPortableResearchPaperManifest(
      reviewedSource(),
      {},
      {},
    );
    const withEmptyList = buildPortableResearchPaperManifest(
      reviewedSource([]),
      {},
      {},
    );
    // `exportedAt` is the wall clock; everything else must match byte for byte.
    const bytes = (manifest: PortableResearchPaperManifest): string =>
      JSON.stringify({ ...manifest, exportedAt: '' }, null, 2);

    expect(bytes(withEmptyList)).toBe(bytes(withoutField));
    expect(bytes(withoutField)).not.toContain('reviewRound');
    // The key order the file is written in, unchanged by the new field.
    expect(Object.keys(withoutField)).toEqual([
      'format',
      'schemaVersion',
      'exportedAt',
      'metadata',
      'contributors',
      'sections',
      'figures',
      'references',
      'exportStyle',
      'submissionMaterials',
    ]);
  });

  it('imports a package written before rounds travelled, unchanged', () => {
    // Hand-built rather than exported, so it is the file the previous release
    // actually wrote: schema v2, and no `reviewRounds` key anywhere in it.
    const legacyManifest: PortableResearchPaperManifest = {
      format: PORTABLE_MANUSCRIPT_FORMAT,
      schemaVersion: PORTABLE_MANUSCRIPT_VERSION,
      exportedAt: '2026-01-04T09:30:00.000Z',
      metadata: { title: 'A paper from before rounds' },
      contributors: { affiliations: [], authors: [] },
      sections: [
        {
          key: 'section-1',
          name: 'Methods',
          sectionType: 'METHODS',
          placement: 'MAIN',
          content: 'Filters were digested [@smith2024].',
          status: 'DRAFTING',
          orderIndex: 0,
          level: 1,
          wordCount: 4,
          includeInExport: true,
        },
      ],
      figures: [],
      references: [
        {
          key: 'reference-1',
          name: 'A referenced study',
          citationKey: 'smith2024',
          cslType: 'ARTICLE_JOURNAL',
        },
      ],
      exportStyle: {},
      submissionMaterials: {},
    };
    const restored = parsePortableResearchPaperManifest(
      JSON.stringify(legacyManifest),
    );
    const drafts = sectionDrafts(restored);
    const prepared = preparePortableResearchPaperImport(restored, drafts);

    expect(prepared.sections).toEqual(drafts);
    expect(prepared.reviewRounds).toEqual([]);
    expect(prepared.warnings).toEqual([]);
    expect(prepared.linkedCount).toBe(1);
    expect(
      portableReviewRoundRecords(
        prepared.reviewRounds ?? [],
        createSections(prepared.sections),
      ),
    ).toEqual([]);
  });

  it('stays on schema v2, so an older build still opens the paper', () => {
    const manifest = buildPortableResearchPaperManifest(
      reviewedSource(twoRounds()),
      {},
      {},
    );

    // A build that predates rounds accepts schemaVersion 2 and ignores the key
    // it does not know, restoring the manuscript whole. Bumping to 3 would
    // have it refuse the file and lose the paper as well as the responses.
    expect(manifest.schemaVersion).toBe(2);
    expect(PORTABLE_MANUSCRIPT_VERSION).toBe(2);
    expect(PORTABLE_MANUSCRIPT_READABLE_VERSIONS).toEqual([1, 2]);
  });
});
