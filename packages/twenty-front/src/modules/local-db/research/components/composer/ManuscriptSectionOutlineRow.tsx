import { styled } from '@linaria/react';
import { IconChevronDown, IconChevronRight } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ManuscriptSectionOutlineNode } from '@/local-db/research/components/composer/manuscriptSectionOutlineTree';
import { type SectionPlacement } from '@/local-db/research/manuscript/manuscriptTypes';

const PLACEMENTS: Array<{ value: SectionPlacement; label: string }> = [
  { value: 'FRONT_MATTER', label: 'Front matter' },
  { value: 'MAIN', label: 'Main text' },
  { value: 'BACK_MATTER', label: 'Back matter' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

const isSectionPlacement = (value: string): value is SectionPlacement =>
  PLACEMENTS.some((placement) => placement.value === value);

const StyledNode = styled.div<{ depth: number }>`
  margin-left: ${({ depth }) => (depth > 0 ? '12px' : '0')};
`;

const StyledRow = styled.div<{
  active: boolean;
  excludedFromExport: boolean;
}>`
  align-items: center;
  background: ${({ active }) =>
    active ? themeCssVariables.background.transparent.blue : 'transparent'};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  opacity: ${({ excludedFromExport }) => (excludedFromExport ? 0.55 : 1)};
  position: relative;
  transition: opacity 100ms ease;

  &:hover,
  &:focus-within {
    background: ${themeCssVariables.background.transparent.light};
    opacity: ${({ excludedFromExport }) => (excludedFromExport ? 0.75 : 1)};
  }
`;

const StyledChevron = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  flex: 0 0 24px;
  justify-content: center;
  padding: 0;
`;

const StyledChevronSpacer = styled.span`
  flex: 0 0 24px;
`;

const StyledSectionButton = styled.button`
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]} 0;
  text-align: left;
`;

const StyledTitle = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const StyledMeta = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledBadge = styled.span`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  max-width: 110px;
  overflow: hidden;
  padding: 1px ${themeCssVariables.spacing[1]};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// Overlaid on the row's right edge so its natural width never squeezes the
// title flex layout (a flex-participating select got crushed to ~28px).
const StyledPlacementSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-shadow: ${themeCssVariables.boxShadow.light};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.xs};
  opacity: 0;
  padding: 2px;
  pointer-events: none;
  position: absolute;
  right: ${themeCssVariables.spacing[1]};
  top: 50%;
  transform: translateY(-50%);

  ${StyledRow}:hover &,
  ${StyledRow}:focus-within & {
    opacity: 1;
    pointer-events: auto;
  }
`;

const sectionTypeLabel = (sectionType?: string | null) =>
  (sectionType ?? 'OTHER').toLowerCase().replaceAll('_', ' ');

type ManuscriptSectionOutlineRowProps = {
  node: ManuscriptSectionOutlineNode;
  depth: number;
  expandedSectionIds: Set<string>;
  selectedSectionId?: string;
  onChangePlacement: (sectionId: string, placement: SectionPlacement) => void;
  onSelectSection: (sectionId: string) => void;
  onToggleExpanded: (sectionId: string) => void;
};

export const ManuscriptSectionOutlineRow = ({
  node,
  depth,
  expandedSectionIds,
  selectedSectionId,
  onChangePlacement,
  onSelectSection,
  onToggleExpanded,
}: ManuscriptSectionOutlineRowProps) => {
  const { section, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = hasChildren && expandedSectionIds.has(section.id);

  return (
    <StyledNode depth={depth}>
      <StyledRow
        active={section.id === selectedSectionId}
        excludedFromExport={section.includeInExport === false}
      >
        {hasChildren ? (
          <StyledChevron
            type="button"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${section.name ?? 'section'}`}
            aria-expanded={isExpanded}
            onClick={() => onToggleExpanded(section.id)}
          >
            {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
          </StyledChevron>
        ) : (
          <StyledChevronSpacer />
        )}
        <StyledSectionButton
          type="button"
          onClick={() => onSelectSection(section.id)}
        >
          <StyledTitle>{section.name ?? 'Untitled section'}</StyledTitle>
          <StyledMeta>
            <StyledBadge>{sectionTypeLabel(section.sectionType)}</StyledBadge>
            <span>{section.wordCount ?? 0} words</span>
          </StyledMeta>
        </StyledSectionButton>
        <StyledPlacementSelect
          aria-label={`Move ${section.name ?? 'section'} to another group`}
          title="Move to another group"
          value={section.placement ?? 'MAIN'}
          onChange={(event) => {
            if (isSectionPlacement(event.target.value)) {
              onChangePlacement(section.id, event.target.value);
            }
          }}
        >
          {PLACEMENTS.map((placement) => (
            <option key={placement.value} value={placement.value}>
              {placement.label}
            </option>
          ))}
        </StyledPlacementSelect>
      </StyledRow>
      {isExpanded
        ? children.map((child) => (
            <ManuscriptSectionOutlineRow
              key={child.section.id}
              node={child}
              depth={depth + 1}
              expandedSectionIds={expandedSectionIds}
              selectedSectionId={selectedSectionId}
              onChangePlacement={onChangePlacement}
              onSelectSection={onSelectSection}
              onToggleExpanded={onToggleExpanded}
            />
          ))
        : null}
    </StyledNode>
  );
};
