import { act, renderHook } from '@testing-library/react';
import { useSearchParams } from 'react-router-dom';

import {
  type JournalRecord,
  type ManuscriptRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import { useManuscriptComposer } from '@/local-db/research/components/composer/useManuscriptComposer';
import { parseManuscriptSubmissionExtras } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';

jest.mock('react-router-dom', () => ({ useSearchParams: jest.fn() }));
jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: jest.fn(),
}));
jest.mock('@/object-record/hooks/useDeleteOneRecord', () => ({
  useDeleteOneRecord: jest.fn(),
}));
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: jest.fn(),
}));

const manuscript: ManuscriptRecord = {
  id: 'manuscript-id',
  name: 'Test manuscript',
  correspondingAuthor: 'Ahmad Jalil, ajalil@unbc.ca',
  submissionExtras: JSON.stringify({
    'journal-key': { ARTICLE_TYPE: 'Old type' },
  }),
};

const journal: JournalRecord = {
  id: 'journal-id',
  name: 'Test Journal',
  profileKey: 'journal-key',
};

const latestManuscript = {
  ...manuscript,
  submissionExtras: JSON.stringify({
    'journal-key': {
      ARTICLE_TYPE: 'Old type',
      FUNDING_DECLARATION: 'Newer funding',
    },
  }),
};

const manuscriptRefetch = jest.fn(async () => ({
  data: {
    manuscripts: {
      edges: [
        {
          __typename: 'ManuscriptEdge',
          cursor: 'cursor',
          node: { ...latestManuscript, __typename: 'Manuscript' },
        },
      ],
    },
  },
}));
const journalRefetch = jest.fn(async () => undefined);
const sectionRefetch = jest.fn(async () => undefined);
const figureRefetch = jest.fn(async () => undefined);
const referenceRefetch = jest.fn();
type UpdateCall = {
  objectNameSingular: string;
  idToUpdate: string;
  updateOneRecordInput: Record<string, string>;
};
const updateOneRecord = jest.fn(async (_input: UpdateCall) => undefined);
const deleteSectionRecord = jest.fn(async (_id: string) => undefined);
const deleteReferenceRecord = jest.fn(async (_id: string) => undefined);

const findManyResult = (records: unknown[], refetch: jest.Mock) =>
  ({ records, refetch }) as unknown as ReturnType<typeof useFindManyRecords>;

describe('useManuscriptComposer submission persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useSearchParams)
      .mockReturnValue([
        new URLSearchParams('manuscript=manuscript-id'),
        jest.fn(),
      ]);
    jest
      .mocked(useFindManyRecords)
      .mockImplementation(({ objectNameSingular }) => {
        if (objectNameSingular === 'manuscript') {
          return findManyResult([manuscript], manuscriptRefetch);
        }
        if (objectNameSingular === 'journalTemplate') {
          return findManyResult([journal], journalRefetch);
        }
        if (objectNameSingular === 'manuscriptSection') {
          return findManyResult([], sectionRefetch);
        }
        if (objectNameSingular === 'figure') {
          return findManyResult([], figureRefetch);
        }
        return findManyResult([], referenceRefetch);
      });
    jest.mocked(useCreateOneRecord).mockReturnValue({
      createOneRecord: jest.fn(),
    } as unknown as ReturnType<typeof useCreateOneRecord>);
    jest
      .mocked(useDeleteOneRecord)
      .mockImplementation(({ objectNameSingular }) => ({
        deleteOneRecord:
          objectNameSingular === 'reference'
            ? deleteReferenceRecord
            : deleteSectionRecord,
      }));
    jest.mocked(useUpdateOneRecord).mockReturnValue({
      updateOneRecord,
    } as unknown as ReturnType<typeof useUpdateOneRecord>);
  });

  it('adopts a fallback journal before saving and merges the latest extras', async () => {
    const { result } = renderHook(() => useManuscriptComposer());

    await act(async () => {
      await result.current.saveSubmissionRequirementValues(
        { ARTICLE_TYPE: 'Research article' },
        journal,
      );
    });

    expect(updateOneRecord).toHaveBeenNthCalledWith(1, {
      objectNameSingular: 'manuscript',
      idToUpdate: 'manuscript-id',
      updateOneRecordInput: {
        targetJournalId: 'journal-id',
        targetVenue: 'Test Journal',
      },
    });
    const valueUpdate = updateOneRecord.mock.calls[1]?.[0];
    expect(valueUpdate).toMatchObject({
      objectNameSingular: 'manuscript',
      idToUpdate: 'manuscript-id',
    });
    expect(
      parseManuscriptSubmissionExtras(
        valueUpdate?.updateOneRecordInput.submissionExtras,
      ),
    ).toEqual({
      'journal-key': {
        ARTICLE_TYPE: 'Research article',
        FUNDING_DECLARATION: 'Newer funding',
      },
    });
  });

  it('rejects a save when no explicit or fallback journal is available', async () => {
    const { result } = renderHook(() => useManuscriptComposer());

    await expect(
      result.current.saveSubmissionRequirementValues({
        ARTICLE_TYPE: 'Research article',
      }),
    ).rejects.toThrow('A target journal is required before saving');
    expect(updateOneRecord).not.toHaveBeenCalled();
  });

  it('does not write submission extras for a canonical-only save', async () => {
    const { result } = renderHook(() => useManuscriptComposer());

    await act(async () => {
      await result.current.saveSubmissionRequirementValues(
        { COVER_LETTER: 'Updated letter' },
        journal,
      );
    });

    expect(updateOneRecord.mock.calls[1]?.[0]).toEqual({
      objectNameSingular: 'manuscript',
      idToUpdate: 'manuscript-id',
      updateOneRecordInput: { coverLetter: 'Updated letter' },
    });
    expect(manuscriptRefetch).toHaveBeenCalledTimes(1);
  });

  it('preserves corresponding-author contact data when keeping the snapshot name', async () => {
    const { result } = renderHook(() => useManuscriptComposer());

    await act(async () => {
      await result.current.keepJournalSubmissionValue(
        'CORRESPONDING_AUTHOR',
        'Hossein Kazemian*',
        journal,
      );
    });

    expect(updateOneRecord.mock.calls[1]?.[0]).toEqual({
      objectNameSingular: 'manuscript',
      idToUpdate: 'manuscript-id',
      updateOneRecordInput: {
        correspondingAuthor: 'Hossein Kazemian, ajalil@unbc.ca',
      },
    });
  });

  it('rewrites cited section and figure tokens when a reference key is edited', async () => {
    const citedReference = {
      id: 'reference-id',
      citationKey: 'smith2024',
      manuscript: { id: manuscript.id },
    };
    const citedSection = {
      id: 'section-id',
      name: 'Results',
      content: 'Evidence [@smith2024].',
      manuscript: { id: manuscript.id },
    };
    const citedFigure = {
      id: 'figure-id',
      caption: 'Prior work [@smith2024]',
      tableData: '| Source |\n| --- |\n| [@smith2024] |',
      manuscript: { id: manuscript.id },
    };
    jest
      .mocked(useFindManyRecords)
      .mockImplementation(({ objectNameSingular }) => {
        if (objectNameSingular === 'manuscript') {
          return findManyResult([manuscript], manuscriptRefetch);
        }
        if (objectNameSingular === 'journalTemplate') {
          return findManyResult([journal], journalRefetch);
        }
        if (objectNameSingular === 'manuscriptSection') {
          return findManyResult([citedSection], sectionRefetch);
        }
        if (objectNameSingular === 'figure') {
          return findManyResult([citedFigure], figureRefetch);
        }
        return findManyResult([citedReference], referenceRefetch);
      });
    const { result } = renderHook(() => useManuscriptComposer());

    await act(async () => {
      await result.current.updateReference(citedReference, {
        citationKey: 'smith2025',
      });
    });

    expect(updateOneRecord).toHaveBeenCalledWith({
      objectNameSingular: 'reference',
      idToUpdate: 'reference-id',
      updateOneRecordInput: { citationKey: 'smith2025' },
    });
    expect(updateOneRecord).toHaveBeenCalledWith({
      objectNameSingular: 'manuscriptSection',
      idToUpdate: 'section-id',
      updateOneRecordInput: {
        content: 'Evidence [@smith2025].',
        wordCount: 2,
      },
    });
    expect(updateOneRecord).toHaveBeenCalledWith({
      objectNameSingular: 'figure',
      idToUpdate: 'figure-id',
      updateOneRecordInput: {
        caption: 'Prior work [@smith2025]',
        tableData: '| Source |\n| --- |\n| [@smith2025] |',
      },
    });
    expect(sectionRefetch).toHaveBeenCalled();
    expect(figureRefetch).toHaveBeenCalled();
    expect(referenceRefetch).toHaveBeenCalled();
  });

  it('verifies a merged reference is absent from the refetched connection', async () => {
    const keptReference = {
      id: 'kept-reference-id',
      name: 'Assessment of air quality',
      citationKey: 'abrahim2008',
      manuscript: { id: manuscript.id },
    };
    const removedReference = {
      id: 'removed-reference-id',
      name: 'Assessment of air quality',
      citationKey: 'abrahim2008assessment',
      manuscript: { id: manuscript.id },
    };
    jest
      .mocked(useFindManyRecords)
      .mockImplementation(({ objectNameSingular }) => {
        if (objectNameSingular === 'manuscript') {
          return findManyResult([manuscript], manuscriptRefetch);
        }
        if (objectNameSingular === 'journalTemplate') {
          return findManyResult([journal], journalRefetch);
        }
        if (objectNameSingular === 'manuscriptSection') {
          return findManyResult([], sectionRefetch);
        }
        if (objectNameSingular === 'figure') {
          return findManyResult([], figureRefetch);
        }
        return findManyResult(
          [keptReference, removedReference],
          referenceRefetch,
        );
      });
    referenceRefetch.mockResolvedValue({
      data: {
        references: {
          edges: [{ node: { ...keptReference, __typename: 'Reference' } }],
        },
      },
    });
    const { result } = renderHook(() => useManuscriptComposer());

    await act(async () => {
      await result.current.mergeDuplicateReferences(keptReference, [
        removedReference,
      ]);
    });

    expect(deleteReferenceRecord).toHaveBeenCalledWith(removedReference.id);
    expect(referenceRefetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a merge when a deleted reference survives the refetch', async () => {
    const keptReference = {
      id: 'kept-reference-id',
      name: 'Assessment of air quality',
      citationKey: 'abrahim2008',
      manuscript: { id: manuscript.id },
    };
    const removedReference = {
      id: 'removed-reference-id',
      name: 'Assessment of air quality',
      citationKey: 'abrahim2008assessment',
      manuscript: { id: manuscript.id },
    };
    jest
      .mocked(useFindManyRecords)
      .mockImplementation(({ objectNameSingular }) => {
        if (objectNameSingular === 'manuscript') {
          return findManyResult([manuscript], manuscriptRefetch);
        }
        if (objectNameSingular === 'journalTemplate') {
          return findManyResult([journal], journalRefetch);
        }
        if (objectNameSingular === 'manuscriptSection') {
          return findManyResult([], sectionRefetch);
        }
        if (objectNameSingular === 'figure') {
          return findManyResult([], figureRefetch);
        }
        return findManyResult(
          [keptReference, removedReference],
          referenceRefetch,
        );
      });
    referenceRefetch.mockResolvedValue({
      data: {
        references: {
          edges: [
            { node: { ...keptReference, __typename: 'Reference' } },
            { node: { ...removedReference, __typename: 'Reference' } },
          ],
        },
      },
    });
    const { result } = renderHook(() => useManuscriptComposer());

    await act(async () => {
      await expect(
        result.current.mergeDuplicateReferences(keptReference, [
          removedReference,
        ]),
      ).rejects.toThrow(
        'Reference deletion did not persist for: removed-reference-id',
      );
    });
  });
});
