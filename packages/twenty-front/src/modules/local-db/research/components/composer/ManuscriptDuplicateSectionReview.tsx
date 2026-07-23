import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  defaultDuplicateResolution,
  type DuplicateSectionGroup,
  type SectionContentSimilarity,
} from '@/local-db/research/manuscript/manuscriptSectionDedupe';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';

type ManuscriptDuplicateSectionReviewProps = {
  groups: DuplicateSectionGroup[];
  onDeleteSections: (sectionIds: string[]) => Promise<void>;
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

const StyledGroupHeading = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  justify-content: space-between;
`;

const StyledMember = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledMemberHeading = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledBadge = styled.span`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: 1px ${themeCssVariables.spacing[1]};
`;

const StyledPreview = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledChoices = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};

  & label {
    align-items: center;
    display: flex;
    gap: ${themeCssVariables.spacing[1]};
  }
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

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
`;

const contentWordCount = (content?: string | null): number =>
  (content ?? '').trim().split(/\s+/).filter(Boolean).length;

const firstLinePreview = (section: SectionLike): string =>
  (section.content ?? '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)
    ?.trim() ?? 'Empty section';

const similarityToSuggestedKeep = (
  group: DuplicateSectionGroup,
  sectionId: string,
  suggestedKeepId: string,
): SectionContentSimilarity | undefined => {
  if (sectionId === suggestedKeepId) return undefined;
  return group.pairSimilarities.find(
    (pair) =>
      (pair.firstSectionId === sectionId &&
        pair.secondSectionId === suggestedKeepId) ||
      (pair.secondSectionId === sectionId &&
        pair.firstSectionId === suggestedKeepId),
  )?.similarity;
};

const DuplicateSectionGroupReview = ({
  group,
  onDeleteSections,
}: {
  group: DuplicateSectionGroup;
  onDeleteSections: (sectionIds: string[]) => Promise<void>;
}) => {
  const defaults = defaultDuplicateResolution(group);
  const suggestedKeepId = defaults.find(
    ({ suggestedKeep }) => suggestedKeep,
  )?.sectionId;
  const [choices, setChoices] = useState<Record<string, 'keep' | 'remove'>>(
    Object.fromEntries(
      defaults.map(({ sectionId, action }) => [sectionId, action]),
    ),
  );
  const { enqueueDialog } = useDialogManager();
  const sectionIdsToDelete = group.sections
    .filter(({ id }) => choices[id] === 'remove')
    .map(({ id }) => id);
  const deletionNames = group.sections
    .filter(({ id }) => sectionIdsToDelete.includes(id))
    .map(({ name }) => name?.trim() || 'Untitled section');

  return (
    <StyledGroup>
      <StyledGroupHeading>
        {group.sections[0].name ?? 'Untitled section'}
        <StyledApply
          type="button"
          disabled={sectionIdsToDelete.length === 0}
          onClick={() =>
            enqueueDialog({
              title: 'Remove duplicate sections',
              message: `Delete ${sectionIdsToDelete.length} section${sectionIdsToDelete.length === 1 ? '' : 's'}: ${deletionNames.join(', ')}?`,
              buttons: [
                { title: 'Cancel' },
                {
                  title: 'Delete',
                  accent: 'danger',
                  role: 'confirm',
                  onClick: () => void onDeleteSections(sectionIdsToDelete),
                },
              ],
            })
          }
        >
          Apply
        </StyledApply>
      </StyledGroupHeading>
      {group.sections.map((section) => {
        const similarity =
          suggestedKeepId === undefined
            ? undefined
            : similarityToSuggestedKeep(group, section.id, suggestedKeepId);
        return (
          <StyledMember key={section.id}>
            <StyledMemberHeading>
              <StyledName>{section.name ?? 'Untitled section'}</StyledName>
              <StyledBadge>
                {section.sectionType ?? 'Unspecified type'}
              </StyledBadge>
              <StyledBadge>
                {contentWordCount(section.content)} words
              </StyledBadge>
              {section.id === suggestedKeepId ? (
                <StyledBadge>Suggested keep</StyledBadge>
              ) : null}
              {group.emptySectionIds.includes(section.id) ? (
                <StyledBadge>Empty</StyledBadge>
              ) : null}
              {similarity !== undefined ? (
                <StyledBadge>{similarity}</StyledBadge>
              ) : null}
            </StyledMemberHeading>
            <StyledPreview title={firstLinePreview(section)}>
              {firstLinePreview(section)}
            </StyledPreview>
            <StyledChoices>
              <label>
                <input
                  type="radio"
                  name={`duplicate-${group.sections[0].id}-${section.id}`}
                  checked={choices[section.id] === 'keep'}
                  onChange={() =>
                    setChoices((current) => ({
                      ...current,
                      [section.id]: 'keep',
                    }))
                  }
                />
                Keep
              </label>
              <label>
                <input
                  type="radio"
                  name={`duplicate-${group.sections[0].id}-${section.id}`}
                  checked={choices[section.id] === 'remove'}
                  onChange={() =>
                    setChoices((current) => ({
                      ...current,
                      [section.id]: 'remove',
                    }))
                  }
                />
                Remove
              </label>
            </StyledChoices>
          </StyledMember>
        );
      })}
    </StyledGroup>
  );
};

export const ManuscriptDuplicateSectionReview = ({
  groups,
  onDeleteSections,
}: ManuscriptDuplicateSectionReviewProps) => {
  const [expanded, setExpanded] = useState(false);
  if (groups.length === 0) return null;

  return (
    <StyledReview>
      <StyledBanner
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {groups.length} possible duplicate section
        {groups.length === 1 ? '' : 's'} — Review
      </StyledBanner>
      {expanded
        ? groups.map((group) => (
            <DuplicateSectionGroupReview
              key={group.sections.map(({ id }) => id).join(':')}
              group={group}
              onDeleteSections={onDeleteSections}
            />
          ))
        : null}
    </StyledReview>
  );
};
