import { styled } from '@linaria/react';
import { useState } from 'react';
import { IconAlertTriangle } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { formatReferenceEntry } from '@/local-db/research/manuscript/manuscriptCitations';
import { type ReferenceUsage } from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import {
  type FigureLike,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import {
  missingReferenceFields,
  referenceSectionUsages,
} from './manuscriptReferenceRowUtils';

export { missingReferenceFields } from './manuscriptReferenceRowUtils';

type ManuscriptReferenceRowProps = {
  editor?: React.ReactNode;
  figures: FigureLike[];
  isEditing: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onSelectSection: (sectionId: string) => void;
  reference: ReferenceLike;
  sections: SectionLike[];
  usage: ReferenceUsage;
};

const StyledRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;

  &:hover [data-reference-hover-action],
  &:focus-within [data-reference-hover-action] {
    opacity: 1;
  }
`;

const StyledRowHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledSummary = styled.button`
  align-items: baseline;
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  flex: 1;
  font: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
  padding: 0;
  text-align: left;
`;

const StyledKey = styled.span`
  color: ${themeCssVariables.font.color.primary};
  flex: none;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledLine = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledWarning = styled.span`
  color: ${themeCssVariables.color.orange};
  display: inline-flex;
  flex: none;
`;

const StyledUsageBadge = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  flex: none;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  padding: 1px ${themeCssVariables.spacing[2]};
`;

const StyledEditButton = styled.button`
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  opacity: 0;
  padding: ${themeCssVariables.spacing[1]};

  &[aria-expanded='true'],
  &:focus {
    color: ${themeCssVariables.font.color.primary};
    opacity: 1;
  }
`;

const StyledExpandedEditButton = styled.button`
  align-self: flex-start;
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} 0;

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledUnusedBadge = styled(StyledUsageBadge)`
  border-color: ${themeCssVariables.color.orange};
  color: ${themeCssVariables.color.orange};
`;

const StyledWhereCited = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledWhereHeading = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledSectionLink = styled.button`
  align-items: center;
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[1]} 0;
  text-align: left;

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledUnassigned = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  justify-content: space-between;
`;

const StyledEditor = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[3]};
`;

export const ManuscriptReferenceRow = ({
  editor,
  figures,
  isEditing,
  onDelete,
  onEdit,
  onSelectSection,
  reference,
  sections,
  usage,
}: ManuscriptReferenceRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const key = reference.citationKey?.trim() || reference.id;
  const missingFields = missingReferenceFields(reference);
  const sectionUsages = referenceSectionUsages({
    citationKey: key,
    figures,
    sections,
    usage,
  });
  const assignedCount = sectionUsages.reduce(
    (count, sectionUsage) => count + sectionUsage.count,
    0,
  );
  const unassignedCount = Math.max(0, usage.count - assignedCount);
  const UsageBadge = usage.count > 0 ? StyledUsageBadge : StyledUnusedBadge;

  return (
    <StyledRow>
      <StyledRowHeader>
        <StyledSummary
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <StyledKey>[@{key}]</StyledKey>
          <StyledLine
            title={formatReferenceEntry(reference, undefined, 'AUTHOR_DATE')}
          >
            {formatReferenceEntry(reference, undefined, 'AUTHOR_DATE')}
          </StyledLine>
        </StyledSummary>
        {missingFields.length > 0 ? (
          <StyledWarning
            title={`Missing ${missingFields.join(', ')}`}
            aria-label={`Incomplete reference: missing ${missingFields.join(', ')}`}
          >
            <IconAlertTriangle size={14} />
          </StyledWarning>
        ) : null}
        <StyledEditButton
          type="button"
          aria-expanded={isEditing}
          data-reference-hover-action
          onClick={onEdit}
        >
          Edit
        </StyledEditButton>
        <StyledEditButton
          type="button"
          data-reference-hover-action
          onClick={onDelete}
        >
          Delete
        </StyledEditButton>
        <UsageBadge
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {usage.count > 0 ? `cited ${usage.count}×` : 'unused'}
        </UsageBadge>
      </StyledRowHeader>
      {expanded ? (
        <StyledWhereCited>
          <StyledWhereHeading>
            {usage.count > 0 ? 'Cited in' : 'Not cited in this manuscript'}
          </StyledWhereHeading>
          {sectionUsages.map((sectionUsage) => (
            <StyledSectionLink
              key={sectionUsage.id}
              type="button"
              onClick={() => onSelectSection(sectionUsage.id)}
            >
              <span>{sectionUsage.name}</span>
              <span>{sectionUsage.count}×</span>
            </StyledSectionLink>
          ))}
          {unassignedCount > 0 ? (
            <StyledUnassigned>
              <span>Unassigned figure or table</span>
              <span>{unassignedCount}×</span>
            </StyledUnassigned>
          ) : null}
          <StyledExpandedEditButton type="button" onClick={onEdit}>
            {isEditing ? 'Close editor' : 'Edit reference'}
          </StyledExpandedEditButton>
        </StyledWhereCited>
      ) : null}
      {isEditing ? <StyledEditor>{editor}</StyledEditor> : null}
    </StyledRow>
  );
};
