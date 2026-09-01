import { isNonEmptyString } from '@sniptt/guards';

import {
  StyledReviewComment,
  StyledReviewField,
  StyledReviewPointCard,
  StyledReviewPointLabel,
  StyledReviewSelect,
  StyledReviewSubheading,
  StyledReviewTextArea,
  StyledReviewerGroup,
  StyledReviewerName,
} from '@/local-db/research/components/composer/manuscriptReviewPanelStyles';
import {
  reviewPointsByReviewer,
  reviewPointTitle,
  type ReviewPoint,
} from '@/local-db/research/manuscript/manuscriptReviewRound';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptReviewPointListProps = {
  points: ReviewPoint[];
  sections: SectionLike[];
  // Typing an answer: kept local so the field does not save on every keystroke.
  onEditPoint: (pointId: string, patch: Partial<ReviewPoint>) => void;
  // Leaving a field, or picking a section: edit and save in one step.
  onPersistPoint: (pointId: string, patch: Partial<ReviewPoint>) => void;
};

const UNATTRIBUTED_REVIEWER = 'Reviewer comments';

export const ManuscriptReviewPointList = ({
  points,
  sections,
  onEditPoint,
  onPersistPoint,
}: ManuscriptReviewPointListProps) => {
  // A version stands in for its base at export time, so offering one here
  // would name a section the manuscript never prints.
  const selectableSections = sections.filter(
    (section) => !isNonEmptyString(section.variantOfId),
  );

  return (
    <>
      {reviewPointsByReviewer(points).map((group) => (
        <StyledReviewerGroup key={group.reviewer || 'unattributed'}>
          <StyledReviewerName>
            {isNonEmptyString(group.reviewer)
              ? group.reviewer
              : UNATTRIBUTED_REVIEWER}
          </StyledReviewerName>
          {group.points.map((point, index) => (
            <StyledReviewPointCard key={point.id}>
              {isNonEmptyString(point.heading) &&
              point.heading !== group.points[index - 1]?.heading ? (
                <StyledReviewSubheading>{point.heading}</StyledReviewSubheading>
              ) : null}
              <StyledReviewPointLabel>
                {reviewPointTitle(point.label)}
              </StyledReviewPointLabel>
              <StyledReviewComment>{point.comment}</StyledReviewComment>
              <StyledReviewField>
                Response
                <StyledReviewTextArea
                  aria-label={`Response to comment ${point.label}${
                    isNonEmptyString(group.reviewer)
                      ? ` from ${group.reviewer}`
                      : ''
                  }`}
                  value={point.response}
                  placeholder="What you changed, or why you disagree"
                  onChange={(event) =>
                    onEditPoint(point.id, { response: event.target.value })
                  }
                  onBlur={(event) =>
                    onPersistPoint(point.id, { response: event.target.value })
                  }
                />
              </StyledReviewField>
              <StyledReviewField>
                Changed in
                <StyledReviewSelect
                  aria-label={`Section changed for comment ${point.label}${
                    isNonEmptyString(group.reviewer)
                      ? ` from ${group.reviewer}`
                      : ''
                  }`}
                  value={point.sectionId}
                  onChange={(event) =>
                    onPersistPoint(point.id, { sectionId: event.target.value })
                  }
                >
                  <option value="">No section named</option>
                  {selectableSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name ?? 'Untitled section'}
                    </option>
                  ))}
                </StyledReviewSelect>
              </StyledReviewField>
            </StyledReviewPointCard>
          ))}
        </StyledReviewerGroup>
      ))}
    </>
  );
};
