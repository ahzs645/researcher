import { useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

import {
  sortReviewRounds,
  type ReviewRoundLike,
} from '@/local-db/research/manuscript/manuscriptReviewRound';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';

export type ReviewRoundRecord = ReviewRoundLike & {
  manuscriptId?: string | null;
};

export type ReviewRoundCreate = {
  name: string;
  journal?: string | null;
  decision?: string | null;
  decisionDate?: string | null;
};

export type ReviewRoundUpdate = Partial<{
  name: string;
  journal: string | null;
  decision: string | null;
  decisionDate: string | null;
  letter: string | null;
  points: string | null;
}>;

export const REVIEW_ROUND_GQL = {
  id: true,
  createdAt: true,
  name: true,
  journal: true,
  decision: true,
  decisionDate: true,
  letter: true,
  points: true,
  manuscriptId: true,
};

export const useManuscriptReviewRounds = (manuscriptId: string | null) => {
  const { records, refetch } = useFindManyRecords({
    objectNameSingular: 'reviewRound',
    recordGqlFields: REVIEW_ROUND_GQL,
    filter: isDefined(manuscriptId)
      ? { manuscriptId: { eq: manuscriptId } }
      : undefined,
    skip: !isDefined(manuscriptId),
  });
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'reviewRound',
  });
  const { deleteOneRecord } = useDeleteOneRecord({
    objectNameSingular: 'reviewRound',
  });
  const { updateOneRecord } = useUpdateOneRecord();

  const rounds = useMemo(
    () => sortReviewRounds(records as unknown as ReviewRoundRecord[]),
    [records],
  );

  const createRound = async (draft: ReviewRoundCreate) => {
    if (!isDefined(manuscriptId)) return;
    await createOneRecord({ ...draft, manuscriptId });
    await refetch();
  };

  const saveRound = async (roundId: string, values: ReviewRoundUpdate) => {
    await updateOneRecord({
      objectNameSingular: 'reviewRound',
      idToUpdate: roundId,
      updateOneRecordInput: values,
    });
    await refetch();
  };

  const deleteRound = async (roundId: string) => {
    await deleteOneRecord(roundId);
    await refetch();
  };

  return {
    rounds,
    createRound,
    saveRound,
    deleteRound,
    refetchRounds: refetch,
  };
};
