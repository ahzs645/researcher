import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { formatReferenceEntry } from '@/local-db/research/manuscript/manuscriptCitations';
import {
  referenceFilledFieldCount,
  suggestDuplicateReferenceKeep,
  type DuplicateReferenceGroup,
} from '@/local-db/research/manuscript/manuscriptReferenceDuplicates';
import { type ReferenceUsageByCitationKey } from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';

type ManuscriptDuplicateReferenceReviewProps = {
  groups: DuplicateReferenceGroup[];
  onApply: (
    keptReference: ReferenceLike,
    removedReferences: ReferenceLike[],
  ) => Promise<void>;
  usage: ReferenceUsageByCitationKey;
};

const StyledReview = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledBanner = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.color.orange};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-align: left;
`;

const StyledGroup = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledGroupHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledGroupTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledApply = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  min-height: 28px;
  padding: 2px ${themeCssVariables.spacing[2]};
`;

const StyledMember = styled.label`
  align-items: flex-start;
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: grid;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  grid-template-columns: auto minmax(0, 1fr);
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledMemberHeading = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledKey = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledBadge = styled.span`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.tertiary};
  padding: 1px ${themeCssVariables.spacing[1]};
`;

const StyledLine = styled.span`
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DuplicateReferenceGroupReview = ({
  group,
  onApply,
  usage,
}: {
  group: DuplicateReferenceGroup;
  onApply: ManuscriptDuplicateReferenceReviewProps['onApply'];
  usage: ReferenceUsageByCitationKey;
}) => {
  const suggested = suggestDuplicateReferenceKeep(group, usage);
  const [keptId, setKeptId] = useState(suggested.id);
  const { enqueueDialog } = useDialogManager();
  const kept =
    group.references.find(({ id }) => id === keptId) ?? group.references[0];
  const removed = group.references.filter(({ id }) => id !== kept.id);
  const removedKeys = removed.map(
    (reference) => reference.citationKey?.trim() || reference.id,
  );
  const rewriteCount = removed.reduce(
    (count, reference) =>
      count + (usage.get(reference.citationKey?.trim() ?? '')?.count ?? 0),
    0,
  );

  return (
    <StyledGroup>
      <StyledGroupHeader>
        <StyledGroupTitle>
          {group.references[0].name?.trim() || 'Untitled reference'}
        </StyledGroupTitle>
        <StyledApply
          type="button"
          onClick={() =>
            enqueueDialog({
              title: 'Merge duplicate references',
              message: `Rewrite ${rewriteCount} citation mention${rewriteCount === 1 ? '' : 's'} to [@${kept.citationKey?.trim() || kept.id}] and delete ${removed.length} record${removed.length === 1 ? '' : 's'} (${removedKeys.join(', ')})?`,
              buttons: [
                { title: 'Cancel' },
                {
                  title: 'Apply',
                  accent: 'danger',
                  role: 'confirm',
                  onClick: async () => {
                    await onApply(kept, removed);
                  },
                },
              ],
            })
          }
        >
          Apply
        </StyledApply>
      </StyledGroupHeader>
      {group.references.map((reference) => {
        const key = reference.citationKey?.trim() || reference.id;
        const count = usage.get(key)?.count ?? 0;
        return (
          <StyledMember key={reference.id}>
            <input
              type="radio"
              name={`duplicate-reference-${group.references[0].id}`}
              checked={kept.id === reference.id}
              onChange={() => setKeptId(reference.id)}
            />
            <StyledMemberHeading>
              <StyledKey>[@{key}]</StyledKey>
              <StyledBadge>
                {count} citation{count === 1 ? '' : 's'}
              </StyledBadge>
              <StyledBadge>
                {referenceFilledFieldCount(reference)} filled fields
              </StyledBadge>
              {reference.id === suggested.id ? (
                <StyledBadge>Suggested keep</StyledBadge>
              ) : null}
            </StyledMemberHeading>
            <StyledLine
              title={formatReferenceEntry(reference, undefined, 'AUTHOR_DATE')}
            >
              {formatReferenceEntry(reference, undefined, 'AUTHOR_DATE')}
            </StyledLine>
          </StyledMember>
        );
      })}
    </StyledGroup>
  );
};

export const ManuscriptDuplicateReferenceReview = ({
  groups,
  onApply,
  usage,
}: ManuscriptDuplicateReferenceReviewProps) => {
  const [expanded, setExpanded] = useState(false);
  if (groups.length === 0) return null;
  const duplicateCount = groups.reduce(
    (count, group) => count + group.references.length - 1,
    0,
  );

  return (
    <StyledReview>
      <StyledBanner
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {duplicateCount} possible duplicate reference
        {duplicateCount === 1 ? '' : 's'} — Review
      </StyledBanner>
      {expanded
        ? groups.map((group) => (
            <DuplicateReferenceGroupReview
              key={group.references.map(({ id }) => id).join(':')}
              group={group}
              onApply={onApply}
              usage={usage}
            />
          ))
        : null}
    </StyledReview>
  );
};
