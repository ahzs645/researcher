import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';

import { ManuscriptReviewRoundEditor } from '@/local-db/research/components/composer/ManuscriptReviewRoundEditor';
import {
  StyledReviewField,
  StyledReviewHeaderRow,
  StyledReviewNote,
  StyledReviewPanel,
  StyledReviewSelect,
  StyledReviewTitle,
} from '@/local-db/research/components/composer/manuscriptReviewPanelStyles';
import {
  type ReviewRoundCreate,
  type ReviewRoundRecord,
  type ReviewRoundUpdate,
} from '@/local-db/research/components/composer/useManuscriptReviewRounds';
import {
  parseReviewPoints,
  reviewDecisionLabel,
  reviewRoundProgress,
} from '@/local-db/research/manuscript/manuscriptReviewRound';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptReviewRoundsPanelProps = {
  manuscriptTitle: string;
  // The manuscript's target venue, so a new round starts on the journal the
  // author is already working towards.
  defaultJournal: string;
  sections: SectionLike[];
  rounds: ReviewRoundRecord[];
  onCreateRound: (draft: ReviewRoundCreate) => Promise<void>;
  onSaveRound: (roundId: string, values: ReviewRoundUpdate) => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
};

const roundSummary = (round: ReviewRoundRecord): string => {
  const progress = reviewRoundProgress(parseReviewPoints(round.points));
  const decision = reviewDecisionLabel(round.decision);
  return [
    round.name ?? 'Review round',
    isNonEmptyString(decision) ? decision : null,
    progress.total > 0
      ? `${progress.answered}/${progress.total} answered`
      : 'no points yet',
  ]
    .filter(isDefined)
    .join(' · ');
};

export const ManuscriptReviewRoundsPanel = ({
  manuscriptTitle,
  defaultJournal,
  sections,
  rounds,
  onCreateRound,
  onSaveRound,
  onDeleteRound,
}: ManuscriptReviewRoundsPanelProps) => {
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const selectedRound =
    rounds.find((round) => round.id === selectedRoundId) ?? rounds[0];

  const addRound = async () => {
    // The newest round sorts first, so clearing the selection lands on it.
    setSelectedRoundId(null);
    await onCreateRound({
      name: `Round ${rounds.length + 1}`,
      journal: defaultJournal,
      decisionDate: new Date().toISOString(),
    });
  };

  return (
    <StyledReviewPanel aria-labelledby="review-rounds-title">
      <StyledReviewHeaderRow>
        <StyledReviewTitle id="review-rounds-title">
          Reviewer responses
        </StyledReviewTitle>
        <Button
          title="Add review round"
          variant="secondary"
          size="small"
          onClick={() => void addRound()}
        />
      </StyledReviewHeaderRow>

      {rounds.length === 0 ? (
        <StyledReviewNote>
          No review rounds yet. Add one when a decision letter arrives, paste
          the letter, and answer the reviewers point by point.
        </StyledReviewNote>
      ) : null}

      {rounds.length > 1 ? (
        <StyledReviewField>
          Round
          <StyledReviewSelect
            aria-label="Review round"
            value={selectedRound?.id ?? ''}
            onChange={(event) => setSelectedRoundId(event.target.value)}
          >
            {rounds.map((round) => (
              <option key={round.id} value={round.id}>
                {roundSummary(round)}
              </option>
            ))}
          </StyledReviewSelect>
        </StyledReviewField>
      ) : null}

      {isDefined(selectedRound) ? (
        <ManuscriptReviewRoundEditor
          key={selectedRound.id}
          round={selectedRound}
          manuscriptTitle={manuscriptTitle}
          sections={sections}
          onSaveRound={onSaveRound}
          onDeleteRound={onDeleteRound}
        />
      ) : null}
    </StyledReviewPanel>
  );
};
