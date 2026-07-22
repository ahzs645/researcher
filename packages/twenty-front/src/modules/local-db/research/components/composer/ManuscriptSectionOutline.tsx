import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { IconChevronDown, IconChevronRight } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

const StyledOutline = styled.nav`
  align-self: start;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[1]};
  position: sticky;
  top: ${themeCssVariables.spacing[3]};

  @media (max-width: 720px) {
    max-height: 220px;
    position: static;
  }
`;

const StyledGroupHeader = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
  width: 100%;
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-weight: ${themeCssVariables.font.weight.regular};
  margin-left: auto;
`;

const StyledOutlineRow = styled.button<{
  active: boolean;
  excludedFromExport: boolean;
}>`
  background: ${({ active }) =>
    active ? themeCssVariables.background.transparent.blue : 'transparent'};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  opacity: ${({ excludedFromExport }) => (excludedFromExport ? 0.55 : 1)};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
  transition: opacity 100ms ease;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    opacity: ${({ excludedFromExport }) => (excludedFromExport ? 0.75 : 1)};
  }
`;

const StyledOutlineTitle = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const StyledOutlineMeta = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledBadge = styled.span`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  max-width: 130px;
  overflow: hidden;
  padding: 1px ${themeCssVariables.spacing[1]};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEmpty = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]};
`;

type OutlineGroupId = 'frontMatter' | 'main' | 'backMatter' | 'supplement';

const GROUPS: { id: OutlineGroupId; label: string }[] = [
  { id: 'frontMatter', label: 'Cover page & front matter' },
  { id: 'main', label: 'Main text' },
  { id: 'backMatter', label: 'Back matter' },
  { id: 'supplement', label: 'Supplement' },
];

const groupIdForSection = (section: SectionLike): OutlineGroupId => {
  if (
    section.sectionType?.toLocaleUpperCase() === 'TITLE_PAGE' ||
    section.placement === 'FRONT_MATTER'
  ) {
    return 'frontMatter';
  }
  if (section.placement === 'BACK_MATTER') return 'backMatter';
  if (section.placement === 'SUPPLEMENT') return 'supplement';
  return 'main';
};

const sectionTypeLabel = (sectionType?: string | null) =>
  (sectionType ?? 'OTHER').toLowerCase().replaceAll('_', ' ');

type ManuscriptSectionOutlineProps = {
  onSelectSection: (sectionId: string) => void;
  sections: SectionLike[];
  selectedSectionId?: string;
};

export const ManuscriptSectionOutline = ({
  onSelectSection,
  sections,
  selectedSectionId,
}: ManuscriptSectionOutlineProps) => {
  const groupedSections = useMemo(() => {
    const groups: Record<OutlineGroupId, SectionLike[]> = {
      frontMatter: [],
      main: [],
      backMatter: [],
      supplement: [],
    };
    sections.forEach((section) =>
      groups[groupIdForSection(section)].push(section),
    );
    return groups;
  }, [sections]);
  const frontMatterCount = groupedSections.frontMatter.length;
  const [collapsedOverrides, setCollapsedOverrides] = useState<
    Partial<Record<OutlineGroupId, boolean>>
  >({});

  return (
    <StyledOutline aria-label="Section outline">
      {sections.length === 0 ? (
        <StyledEmpty>No sections yet.</StyledEmpty>
      ) : (
        GROUPS.map((group) => {
          const groupSections = groupedSections[group.id];
          if (groupSections.length === 0) return null;
          const defaultCollapsed =
            group.id === 'frontMatter' && frontMatterCount > 1;
          const isCollapsed = collapsedOverrides[group.id] ?? defaultCollapsed;
          return (
            <div key={group.id}>
              <StyledGroupHeader
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsedOverrides((previous) => ({
                    ...previous,
                    [group.id]: !isCollapsed,
                  }))
                }
              >
                {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
                {group.label}
                <StyledCount>{groupSections.length}</StyledCount>
              </StyledGroupHeader>
              {isCollapsed
                ? null
                : groupSections.map((section) => (
                    <StyledOutlineRow
                      key={section.id}
                      type="button"
                      active={section.id === selectedSectionId}
                      excludedFromExport={section.includeInExport === false}
                      onClick={() => onSelectSection(section.id)}
                    >
                      <StyledOutlineTitle>
                        {section.name ?? 'Untitled section'}
                      </StyledOutlineTitle>
                      <StyledOutlineMeta>
                        <StyledBadge>
                          {sectionTypeLabel(section.sectionType)}
                        </StyledBadge>
                        <span>{section.wordCount ?? 0} words</span>
                      </StyledOutlineMeta>
                    </StyledOutlineRow>
                  ))}
            </div>
          );
        })
      )}
    </StyledOutline>
  );
};
