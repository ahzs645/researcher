import { act, renderHook } from '@testing-library/react';

import { useManuscriptImportCommit } from '@/local-db/research/import-wizard/hooks/useManuscriptImportCommit';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';
import {
  buildPortableResearchPaperManifest,
  type PortableJournalTemplate,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';

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

  it('leaves the manuscript journal alone for a package that carries none', async () => {
    const update = await commitPortablePackage(portableDocument());

    expect(update.name).toBe('Portable aerosol paper');
    expect(update).not.toHaveProperty('targetJournalId');
    expect(createdObjects()).not.toContain('journalTemplate');
  });
});
