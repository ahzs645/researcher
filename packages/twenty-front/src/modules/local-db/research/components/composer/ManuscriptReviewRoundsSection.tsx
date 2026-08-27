import { ManuscriptReviewRoundsPanel } from '@/local-db/research/components/composer/ManuscriptReviewRoundsPanel';
import { useManuscriptReviewRounds } from '@/local-db/research/components/composer/useManuscriptReviewRounds';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptReviewRoundsSectionProps = {
  manuscriptId: string;
  manuscriptTitle: string;
  defaultJournal: string;
  sections: SectionLike[];
};

// The panel's rounds come from their own query rather than the composer's
// bundle: nothing else on the submission tab needs them, and a manuscript that
// has never been reviewed should not pay for the fetch on every other tab.
export const ManuscriptReviewRoundsSection = ({
  manuscriptId,
  manuscriptTitle,
  defaultJournal,
  sections,
}: ManuscriptReviewRoundsSectionProps) => {
  const { rounds, createRound, saveRound, deleteRound } =
    useManuscriptReviewRounds(manuscriptId);

  return (
    <ManuscriptReviewRoundsPanel
      manuscriptTitle={manuscriptTitle}
      defaultJournal={defaultJournal}
      sections={sections}
      rounds={rounds}
      onCreateRound={createRound}
      onSaveRound={saveRound}
      onDeleteRound={deleteRound}
    />
  );
};
