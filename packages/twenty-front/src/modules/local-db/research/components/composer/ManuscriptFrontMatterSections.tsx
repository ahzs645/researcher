import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { H3Title, IconChevronDown, IconChevronRight } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptSectionEditor } from '@/local-db/research/components/ManuscriptSectionEditor';
import { extractCitationKeys } from '@/local-db/research/manuscript/manuscriptCrossReference';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
  type SectionPlacement,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

const PLACEMENTS: Array<{ value: SectionPlacement; label: string }> = [
  { value: 'FRONT_MATTER', label: 'Front matter' },
  { value: 'MAIN', label: 'Main text' },
  { value: 'BACK_MATTER', label: 'Back matter' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

const isSectionPlacement = (value: string): value is SectionPlacement =>
  PLACEMENTS.some((placement) => placement.value === value);

const sectionTypeLabel = (sectionType?: string | null) =>
  (sectionType ?? 'OTHER').toLowerCase().replaceAll('_', ' ');

type ManuscriptFrontMatterSectionsProps = {
  figures: FigureLike[];
  onChangeIncludeInExport: (
    sectionId: string,
    includeInExport: boolean,
  ) => Promise<void>;
  onChangePlacement: (
    sectionId: string,
    placement: SectionPlacement,
  ) => Promise<void>;
  onPersistSection: (sectionId: string, markdown: string) => void;
  references: ReferenceLike[];
  sections: SectionLike[];
  selectedSectionId?: string;
  style: JournalStyle;
};

const StyledArea = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[4]};

  & h3 {
    margin: 0;
  }
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledSection = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  overflow: hidden;
`;

const StyledRowButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-align: left;
  width: 100%;
`;

const StyledName = styled.span`
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledBadge = styled.span`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: 1px ${themeCssVariables.spacing[1]};
`;

const StyledWordCount = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  white-space: nowrap;
`;

const StyledExpanded = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledPlacement = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};

  & select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font: inherit;
    padding: ${themeCssVariables.spacing[1]};
  }
`;

const StyledCheckbox = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

export const ManuscriptFrontMatterSections = ({
  figures,
  onChangeIncludeInExport,
  onChangePlacement,
  onPersistSection,
  references,
  sections,
  selectedSectionId,
  style,
}: ManuscriptFrontMatterSectionsProps) => {
  const { enqueueErrorSnackBar } = useSnackBar();
  const frontMatterSections = useMemo(
    () =>
      sections.filter(
        (section) =>
          section.placement === 'FRONT_MATTER' &&
          section.sectionType?.toUpperCase() !== 'KEYWORDS',
      ),
    [sections],
  );
  const citationKeys = useMemo(
    () =>
      sections.reduce<string[]>((keys, section) => {
        for (const key of extractCitationKeys(section.content ?? '')) {
          if (!keys.includes(key)) keys.push(key);
        }
        return keys;
      }, []),
    [sections],
  );
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (
      selectedSectionId === undefined ||
      !frontMatterSections.some((section) => section.id === selectedSectionId)
    ) {
      return;
    }
    setExpandedSectionIds((current) => new Set(current).add(selectedSectionId));
  }, [frontMatterSections, selectedSectionId]);

  const reportUpdateFailure = () =>
    enqueueErrorSnackBar({ message: 'Could not update front-matter section' });

  return (
    <StyledArea aria-label="Front-matter sections">
      <H3Title title="Front-matter sections" />
      {frontMatterSections.length === 0 ? (
        <StyledHint>No additional front-matter sections.</StyledHint>
      ) : (
        frontMatterSections.map((section) => {
          const isExpanded = expandedSectionIds.has(section.id);
          return (
            <StyledSection key={section.id}>
              <StyledRowButton
                type="button"
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedSectionIds((current) => {
                    const next = new Set(current);
                    if (isExpanded) next.delete(section.id);
                    else next.add(section.id);
                    return next;
                  })
                }
              >
                {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
                <StyledName>{section.name ?? 'Untitled section'}</StyledName>
                <StyledBadge>
                  {sectionTypeLabel(section.sectionType)}
                </StyledBadge>
                <StyledWordCount>
                  {section.wordCount ?? 0} words
                </StyledWordCount>
              </StyledRowButton>
              {isExpanded ? (
                <StyledExpanded>
                  <StyledActions>
                    <StyledPlacement>
                      Placement
                      <select
                        aria-label={`Move ${section.name ?? 'section'} to another group`}
                        value={section.placement ?? 'FRONT_MATTER'}
                        onChange={(event) => {
                          if (isSectionPlacement(event.target.value)) {
                            void onChangePlacement(
                              section.id,
                              event.target.value,
                            ).catch(reportUpdateFailure);
                          }
                        }}
                      >
                        {PLACEMENTS.map((placement) => (
                          <option key={placement.value} value={placement.value}>
                            {placement.label}
                          </option>
                        ))}
                      </select>
                    </StyledPlacement>
                    <StyledCheckbox>
                      <input
                        type="checkbox"
                        aria-label="Include section in export"
                        checked={section.includeInExport !== false}
                        onChange={(event) =>
                          void onChangeIncludeInExport(
                            section.id,
                            event.target.checked,
                          ).catch(reportUpdateFailure)
                        }
                      />
                      Include in export
                    </StyledCheckbox>
                  </StyledActions>
                  <ManuscriptSectionEditor
                    citationKeys={citationKeys}
                    figures={figures}
                    initialMarkdown={section.content ?? ''}
                    onPersist={(markdown) =>
                      onPersistSection(section.id, markdown)
                    }
                    references={references}
                    style={style}
                  />
                </StyledExpanded>
              ) : null}
            </StyledSection>
          );
        })
      )}
    </StyledArea>
  );
};
