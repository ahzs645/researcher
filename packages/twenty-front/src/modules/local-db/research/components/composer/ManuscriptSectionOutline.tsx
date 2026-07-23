import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { IconChevronDown, IconChevronRight } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptSectionOutlineRow } from '@/local-db/research/components/composer/ManuscriptSectionOutlineRow';
import {
  buildManuscriptSectionOutlineTree,
  sectionAncestorIds,
} from '@/local-db/research/components/composer/manuscriptSectionOutlineTree';
import {
  type SectionLike,
  type SectionPlacement,
} from '@/local-db/research/manuscript/manuscriptTypes';

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

type ManuscriptSectionOutlineProps = {
  onChangePlacement: (sectionId: string, placement: SectionPlacement) => void;
  onSelectSection: (sectionId: string) => void;
  sections: SectionLike[];
  selectedSectionId?: string;
};

export const ManuscriptSectionOutline = ({
  onChangePlacement,
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
  const groupedTrees = useMemo(
    () => ({
      frontMatter: buildManuscriptSectionOutlineTree(
        groupedSections.frontMatter,
      ),
      main: buildManuscriptSectionOutlineTree(groupedSections.main),
      backMatter: buildManuscriptSectionOutlineTree(groupedSections.backMatter),
      supplement: buildManuscriptSectionOutlineTree(groupedSections.supplement),
    }),
    [groupedSections],
  );
  const [collapsedOverrides, setCollapsedOverrides] = useState<
    Partial<Record<OutlineGroupId, boolean>>
  >({});
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (selectedSectionId === undefined) return;
    const selectedGroup = GROUPS.find((group) =>
      groupedSections[group.id].some(
        (section) => section.id === selectedSectionId,
      ),
    );
    if (selectedGroup === undefined) return;
    const ancestorIds = sectionAncestorIds(
      groupedTrees[selectedGroup.id],
      selectedSectionId,
    );
    if (ancestorIds === null) return;

    setCollapsedOverrides((previous) => ({
      ...previous,
      [selectedGroup.id]: false,
    }));
    setExpandedSectionIds((previous) => {
      const next = new Set(previous);
      ancestorIds.forEach((ancestorId) => next.add(ancestorId));
      return next;
    });
  }, [groupedSections, groupedTrees, selectedSectionId]);

  const toggleSectionExpanded = (sectionId: string) => {
    setExpandedSectionIds((previous) => {
      const next = new Set(previous);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <StyledOutline aria-label="Section outline">
      {sections.length === 0 ? (
        <StyledEmpty>No sections yet.</StyledEmpty>
      ) : (
        GROUPS.map((group) => {
          const groupSections = groupedSections[group.id];
          const groupTree = groupedTrees[group.id];
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
                : groupTree.map((node) => (
                    <ManuscriptSectionOutlineRow
                      key={node.section.id}
                      node={node}
                      depth={0}
                      expandedSectionIds={expandedSectionIds}
                      selectedSectionId={selectedSectionId}
                      onChangePlacement={onChangePlacement}
                      onSelectSection={onSelectSection}
                      onToggleExpanded={toggleSectionExpanded}
                    />
                  ))}
            </div>
          );
        })
      )}
    </StyledOutline>
  );
};
