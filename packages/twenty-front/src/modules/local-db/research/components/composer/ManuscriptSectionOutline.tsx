import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { useEffect, useMemo, useState } from 'react';
import { IconChevronDown, IconChevronRight } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptSectionOutlineRow } from '@/local-db/research/components/composer/ManuscriptSectionOutlineRow';
import {
  buildManuscriptSectionOutlineTree,
  sectionAncestorIds,
} from '@/local-db/research/components/composer/manuscriptSectionOutlineTree';
import { sectionVariantsByBaseId } from '@/local-db/research/manuscript/manuscriptSectionVariants';
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
  /* The nav must never exceed its grid column — intrinsic row width used to
     push it over the editor column's footer. */
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[1]};
  position: sticky;
  /* Expanding a group can push the nav past max-height, and a classic
     scrollbar appearing would shrink the content box and reflow every row.
     Reserving the gutter keeps row widths identical either way. */
  scrollbar-gutter: stable;
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

const StyledFrontMatterHint = styled.button`
  background: ${themeCssVariables.background.transparent.blue};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.xs};
  margin-bottom: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
`;

const StyledEmpty = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]};
`;

type OutlineGroupId = 'main' | 'backMatter' | 'supplement';

const GROUPS: { id: OutlineGroupId; label: string }[] = [
  { id: 'main', label: 'Main text' },
  { id: 'backMatter', label: 'Back matter' },
  { id: 'supplement', label: 'Supplement' },
];

const groupIdForSection = (section: SectionLike): OutlineGroupId => {
  if (section.placement === 'BACK_MATTER') return 'backMatter';
  if (section.placement === 'SUPPLEMENT') return 'supplement';
  return 'main';
};

type ManuscriptSectionOutlineProps = {
  onChangePlacement: (sectionId: string, placement: SectionPlacement) => void;
  onEditFrontMatter: () => void;
  onSelectSection: (sectionId: string) => void;
  onReorderSection: (sourceId: string, targetId: string) => void;
  // Every section record, versions included: the outline lists the paper's own
  // sections and reads the versions to say which one a row exports as.
  sections: SectionLike[];
  selectedSectionId?: string;
  activeVariantKey: string | null;
  activeJournalLabel: string | null;
};

export const ManuscriptSectionOutline = ({
  onChangePlacement,
  onEditFrontMatter,
  onSelectSection,
  onReorderSection,
  sections,
  selectedSectionId,
  activeVariantKey,
  activeJournalLabel,
}: ManuscriptSectionOutlineProps) => {
  const variantsByBaseId = useMemo(
    () => sectionVariantsByBaseId(sections),
    [sections],
  );
  // The outline is the shape of the paper. A version is an alternative wording
  // of a section already in it, so it is never a row of its own, never in a
  // group's count, and never a drag target.
  const paperSections = useMemo(
    () => sections.filter((section) => !isNonEmptyString(section.variantOfId)),
    [sections],
  );
  const frontMatterCount = paperSections.filter(
    (section) => section.placement === 'FRONT_MATTER',
  ).length;
  const groupedSections = useMemo(() => {
    const groups: Record<OutlineGroupId, SectionLike[]> = {
      main: [],
      backMatter: [],
      supplement: [],
    };
    paperSections
      .filter((section) => section.placement !== 'FRONT_MATTER')
      .forEach((section) => groups[groupIdForSection(section)].push(section));
    return groups;
  }, [paperSections]);
  const writingSectionCount = Object.values(groupedSections).reduce(
    (count, groupSections) => count + groupSections.length,
    0,
  );
  const groupedTrees = useMemo(
    () => ({
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
      {frontMatterCount > 0 ? (
        <StyledFrontMatterHint type="button" onClick={onEditFrontMatter}>
          {frontMatterCount} front-matter{' '}
          {frontMatterCount === 1 ? 'section' : 'sections'} — edit in the Front
          matter tab
        </StyledFrontMatterHint>
      ) : null}
      {writingSectionCount === 0 ? (
        <StyledEmpty>No writing sections yet.</StyledEmpty>
      ) : (
        GROUPS.map((group) => {
          const groupSections = groupedSections[group.id];
          const groupTree = groupedTrees[group.id];
          if (groupSections.length === 0) return null;
          const isCollapsed = collapsedOverrides[group.id] ?? false;
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
                      variantsByBaseId={variantsByBaseId}
                      activeVariantKey={activeVariantKey}
                      activeJournalLabel={activeJournalLabel}
                      onChangePlacement={onChangePlacement}
                      onSelectSection={onSelectSection}
                      onReorderSection={onReorderSection}
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
