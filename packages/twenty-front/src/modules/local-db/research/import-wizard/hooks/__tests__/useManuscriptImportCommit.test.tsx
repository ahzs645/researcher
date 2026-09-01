import { act, renderHook } from '@testing-library/react';

import { useManuscriptImportCommit } from '@/local-db/research/import-wizard/hooks/useManuscriptImportCommit';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';
import {
  buildPortableResearchPaperManifest,
  type PortableJournalTemplate,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';
import {
  parseReviewPoints,
  serializeReviewPoints,
} from '@/local-db/research/manuscript/manuscriptReviewRound';

const mockCreateRecordByObject = jest.fn();
const mockUpdateOneRecord = jest.fn();

jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    createOneRecord: (input: Record<string, unknown>) =>
      mockCreateRecordByObject(objectNameSingular, input),
  }),
}));

jest.mock('@/object-record/hooks/useDeleteOneRecord', () => ({
  useDeleteOneRecord: () => ({ deleteOneRecord: jest.fn() }),
}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueSuccessSnackBar: jest.fn(),
    enqueueErrorSnackBar: jest.fn(),
  }),
}));

const AMT_TEMPLATE: PortableJournalTemplate = {
  name: 'Atmospheric Measurement Techniques (Copernicus)',
  profileKey: 'copernicus-atmospheric-measurement-techniques',
  citationMode: 'AUTHOR_DATE',
  citationStyleId: 'copernicus-publications',
  abstractWordLimit: 350,
};

const portableSource = (
  journal?: PortableJournalTemplate,
): PortableManuscriptSource => ({
  manuscript: { title: 'Portable aerosol paper' },
  sections: [
    {
      id: 'introduction-id',
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'Restored prose.',
      orderIndex: 0,
    },
  ],
  figures: [],
  references: [],
  ...(journal === undefined ? {} : { journal }),
});

const portableDocument = (
  journal?: PortableJournalTemplate,
): ImportedDocument => ({
  title: 'Portable aerosol paper',
  sections: [
    {
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'Restored prose.',
      orderIndex: 0,
      wordCount: 2,
      includeInExport: true,
    },
  ],
  portablePackage: buildPortableResearchPaperManifest(
    portableSource(journal),
    {},
    {},
  ),
});

const commitPortablePackage = async (
  document: ImportedDocument,
  existingJournals: Array<{
    id: string;
    name?: string | null;
    profileKey?: string | null;
  }> = [],
) => {
  const { result } = renderHook(() =>
    useManuscriptImportCommit({
      manuscriptId: 'manuscript-1',
      manuscriptName: 'Untitled manuscript',
      existingSectionCount: 0,
      existingReferences: [],
      existingJournals,
    }),
  );
  await act(async () => {
    await result.current.commitImport(
      document,
      prepareManuscriptImport(document, false),
    );
  });
  return mockUpdateOneRecord.mock.calls[0]?.[0]?.updateOneRecordInput ?? {};
};

const createdObjects = (): string[] =>
  mockCreateRecordByObject.mock.calls.map(([objectNameSingular]) =>
    String(objectNameSingular),
  );

const createdRecordsFor = (
  objectNameSingular: string,
): Array<Record<string, unknown>> =>
  mockCreateRecordByObject.mock.calls
    .filter(([name]) => name === objectNameSingular)
    .map(([, input]) => input as Record<string, unknown>);

// A package whose one round was answered, with the answer naming the section
// it changed — the shape that is lost entirely without the round travelling.
const reviewedPortableDocument = (): ImportedDocument => {
  const source: PortableManuscriptSource = {
    manuscript: { title: 'Portable aerosol paper' },
    sections: [
      {
        id: 'introduction-id',
        name: 'Introduction',
        sectionType: 'INTRODUCTION',
        placement: 'MAIN',
        content: 'Restored prose.',
        orderIndex: 0,
      },
      {
        id: 'methods-id',
        name: 'Methods',
        sectionType: 'METHODS',
        placement: 'MAIN',
        content: 'Filters were digested.',
        orderIndex: 1,
      },
    ],
    figures: [],
    references: [],
    reviewRounds: [
      {
        id: 'round-1-id',
        name: 'Round 1',
        journal: 'Nature Materials',
        decision: 'MAJOR_REVISION',
        decisionDate: '2026-06-18T00:00:00.000Z',
        letter: 'Reviewer 1\n\n1. Justify the sampling window.',
        points: serializeReviewPoints([
          {
            id: 'reviewer-1-1',
            reviewer: 'Reviewer 1',
            label: '1',
            heading: '',
            comment: 'Justify the sampling window.',
            response: 'The window is set by the instrument duty cycle.',
            sectionId: 'methods-id',
          },
        ]),
      },
    ],
  };
  return {
    title: 'Portable aerosol paper',
    sections: source.sections.map((section, index) => ({
      name: section.name ?? 'Section',
      sectionType: section.sectionType ?? 'OTHER',
      placement: 'MAIN',
      content: section.content ?? '',
      orderIndex: index,
      wordCount: 2,
      includeInExport: true,
    })),
    portablePackage: buildPortableResearchPaperManifest(source, {}, {}),
  };
};

describe('useManuscriptImportCommit — restoring a first-party package', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRecordByObject.mockImplementation((objectNameSingular: string) =>
      Promise.resolve({ id: `${objectNameSingular}-id` }),
    );
    mockUpdateOneRecord.mockResolvedValue(undefined);
  });

  it('links the journal template the workspace already has', async () => {
    const update = await commitPortablePackage(portableDocument(AMT_TEMPLATE), [
      { id: 'other-id', name: 'Journal of Nothing', profileKey: 'nothing' },
      // Renamed locally — the seeded profile key is what identifies it.
      {
        id: 'amt-id',
        name: 'AMT house copy',
        profileKey: 'copernicus-atmospheric-measurement-techniques',
      },
    ]);

    expect(update).toMatchObject({
      name: 'Portable aerosol paper',
      targetJournalId: 'amt-id',
    });
    expect(createdObjects()).not.toContain('journalTemplate');
  });

  it('creates the journal template when this workspace does not have it', async () => {
    const update = await commitPortablePackage(portableDocument(AMT_TEMPLATE));

    expect(
      mockCreateRecordByObject.mock.calls.find(
        ([objectNameSingular]) => objectNameSingular === 'journalTemplate',
      )?.[1],
    ).toMatchObject({
      name: 'Atmospheric Measurement Techniques (Copernicus)',
      profileKey: 'copernicus-atmospheric-measurement-techniques',
      abstractWordLimit: 350,
    });
    expect(update.targetJournalId).toBe('journalTemplate-id');
  });

  it('re-creates a review round with its letter and answered points', async () => {
    await commitPortablePackage(reviewedPortableDocument());
    const [round] = createdRecordsFor('reviewRound');

    expect(round).toMatchObject({
      manuscriptId: 'manuscript-1',
      name: 'Round 1',
      journal: 'Nature Materials',
      decision: 'MAJOR_REVISION',
      decisionDate: '2026-06-18T00:00:00.000Z',
    });
    expect(String(round.letter)).toContain('Justify the sampling window.');
    expect(parseReviewPoints(String(round.points))[0]).toMatchObject({
      reviewer: 'Reviewer 1',
      comment: 'Justify the sampling window.',
      response: 'The window is set by the instrument duty cycle.',
    });
  });

  it('lands the point on the section record this workspace just created', async () => {
    // Every section comes back with the same mocked id, so what is checked is
    // that the pointer is resolved at all rather than carried across as the
    // id it had in the workspace the package was written in.
    await commitPortablePackage(reviewedPortableDocument());
    const [round] = createdRecordsFor('reviewRound');
    const [point] = parseReviewPoints(String(round.points));

    expect(point.sectionId).toBe('manuscriptSection-id');
    expect(point.sectionId).not.toBe('methods-id');
  });

  it('creates the round only after the sections its answers name', async () => {
    await commitPortablePackage(reviewedPortableDocument());
    const created = createdObjects();

    expect(created.lastIndexOf('manuscriptSection')).toBeLessThan(
      created.indexOf('reviewRound'),
    );
  });

  it('creates no round for a package that has never been reviewed', async () => {
    await commitPortablePackage(portableDocument());

    expect(createdObjects()).not.toContain('reviewRound');
  });

  it('leaves the manuscript journal alone for a package that carries none', async () => {
    const update = await commitPortablePackage(portableDocument());

    expect(update.name).toBe('Portable aerosol paper');
    expect(update).not.toHaveProperty('targetJournalId');
    expect(createdObjects()).not.toContain('journalTemplate');
  });
});
