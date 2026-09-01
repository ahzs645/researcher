import { act, renderHook } from '@testing-library/react';
import { useSearchParams } from 'react-router-dom';

import {
  type JournalRecord,
  type ManuscriptRecord,
  type SectionRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import { useManuscriptComposer } from '@/local-db/research/components/composer/useManuscriptComposer';
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
  name: 'Aerosol paper',
};

const journal: JournalRecord = {
  id: 'journal-id',
  name: 'MDPI Atmosphere',
  profileKey: 'myst:tex/myst/mdpi:atmosphere',
  abstractWordLimit: 200,
};

const abstractSection: SectionRecord = {
  id: 'abstract',
  name: 'Abstract',
  sectionType: 'ABSTRACT',
  placement: 'MAIN',
  orderIndex: 0,
  level: 1,
  wordLimit: 250,
  wordCount: 3,
  content: 'Three words here',
  includeInExport: true,
  manuscript: { id: 'manuscript-id' },
};

const mdpiVersion: SectionRecord = {
  ...abstractSection,
  id: 'abstract-mdpi',
  content: 'Two words',
  wordCount: 2,
  wordLimit: 200,
  variantOfId: 'abstract',
  variantProfileKey: 'myst:tex/myst/mdpi:atmosphere',
};

const createOneRecord = jest.fn(async () => ({ id: 'created-id' }));
const deleteOneRecord = jest.fn(async (_id: string) => undefined);
const updateOneRecord = jest.fn(async () => undefined);
const refetch = jest.fn(async () => undefined);

const findManyResult = (records: unknown[]) =>
  ({ records, refetch }) as unknown as ReturnType<typeof useFindManyRecords>;

const mountComposer = (sections: SectionRecord[]) => {
  jest
    .mocked(useFindManyRecords)
    .mockImplementation(({ objectNameSingular }) => {
      if (objectNameSingular === 'manuscript')
        return findManyResult([manuscript]);
      if (objectNameSingular === 'journalTemplate')
        return findManyResult([journal]);
      if (objectNameSingular === 'manuscriptSection')
        return findManyResult(sections);
      return findManyResult([]);
    });
  return renderHook(() => useManuscriptComposer());
};

describe('useManuscriptComposer section versions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useSearchParams)
      .mockReturnValue([
        new URLSearchParams('manuscript=manuscript-id'),
        jest.fn(),
      ]);
    jest.mocked(useCreateOneRecord).mockReturnValue({
      createOneRecord,
    } as unknown as ReturnType<typeof useCreateOneRecord>);
    jest.mocked(useDeleteOneRecord).mockReturnValue({
      deleteOneRecord,
    } as unknown as ReturnType<typeof useDeleteOneRecord>);
    jest.mocked(useUpdateOneRecord).mockReturnValue({
      updateOneRecord,
    } as unknown as ReturnType<typeof useUpdateOneRecord>);
  });

  it('seeds a version from the base and caps it at the journal abstract limit', async () => {
    const { result } = mountComposer([abstractSection]);

    await act(async () => {
      await result.current.createSectionVariant('abstract');
    });

    expect(createOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Abstract',
        manuscriptId: 'manuscript-id',
        sectionType: 'ABSTRACT',
        placement: 'MAIN',
        content: 'Three words here',
        wordCount: 3,
        wordLimit: 200,
        variantOfId: 'abstract',
        variantProfileKey: 'myst:tex/myst/mdpi:atmosphere',
      }),
    );
  });

  it('refuses a second version for a journal that already has one', async () => {
    const { result } = mountComposer([abstractSection, mdpiVersion]);

    await expect(
      result.current.createSectionVariant('abstract'),
    ).rejects.toThrow('Abstract already has a version for MDPI Atmosphere');
    expect(createOneRecord).not.toHaveBeenCalled();
  });

  it('deletes a section together with the versions that stand in for it', async () => {
    const { result } = mountComposer([abstractSection, mdpiVersion]);

    await act(async () => {
      await result.current.deleteSection('abstract');
    });

    expect(deleteOneRecord.mock.calls.map(([id]) => id)).toEqual([
      'abstract',
      'abstract-mdpi',
    ]);
  });
});
