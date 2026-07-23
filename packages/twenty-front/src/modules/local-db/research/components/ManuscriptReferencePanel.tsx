import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  ManuscriptReferenceRow,
  missingReferenceFields,
} from '@/local-db/research/components/composer/references/ManuscriptReferenceRow';
import { type ReferenceUsageByCitationKey } from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import {
  type FigureLike,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptReferencePanelProps = {
  figures: FigureLike[];
  onSelectSection: (sectionId: string) => void;
  references: ReferenceLike[];
  sections: SectionLike[];
  usage: ReferenceUsageByCitationKey;
};

type ReferenceFilter = 'all' | 'cited' | 'unused' | 'incomplete';

const REFERENCE_FILTERS: Array<{
  id: ReferenceFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'cited', label: 'Cited' },
  { id: 'unused', label: 'Unused' },
  { id: 'incomplete', label: 'Incomplete' },
];

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledControls = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSearch = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 240px;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledFilter = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};

  &[aria-pressed='true'] {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.border.color.strong};
    color: ${themeCssVariables.font.color.primary};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledEmpty = styled.div`
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[4]};
  text-align: center;
`;

export const referenceSearchText = (reference: ReferenceLike): string =>
  [reference.citationKey, reference.authors, reference.name, reference.year]
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase();

export const ManuscriptReferencePanel = ({
  figures,
  onSelectSection,
  references,
  sections,
  usage,
}: ManuscriptReferencePanelProps) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ReferenceFilter>('all');
  const filteredReferences = useMemo(() => {
    const query = search.trim().toLowerCase();
    return references.filter((reference) => {
      const key = reference.citationKey?.trim() ?? '';
      const count = usage.get(key)?.count ?? 0;
      const matchesFilter =
        filter === 'all' ||
        (filter === 'cited' && count > 0) ||
        (filter === 'unused' && count === 0) ||
        (filter === 'incomplete' &&
          missingReferenceFields(reference).length > 0);
      return (
        matchesFilter &&
        (query.length === 0 || referenceSearchText(reference).includes(query))
      );
    });
  }, [filter, references, search, usage]);

  return (
    <StyledPanel>
      <StyledControls>
        <StyledSearch
          aria-label="Search references"
          placeholder="Search citation key, authors, title, or year…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <StyledFilters aria-label="Filter references">
          {REFERENCE_FILTERS.map((option) => (
            <StyledFilter
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </StyledFilter>
          ))}
        </StyledFilters>
      </StyledControls>
      <StyledCount>
        {filteredReferences.length} of {references.length} references
      </StyledCount>
      {filteredReferences.map((reference) => (
        <ManuscriptReferenceRow
          key={reference.id}
          reference={reference}
          usage={
            usage.get(reference.citationKey?.trim() ?? '') ?? {
              count: 0,
              sectionIds: [],
            }
          }
          sections={sections}
          figures={figures}
          onSelectSection={onSelectSection}
        />
      ))}
      {filteredReferences.length === 0 ? (
        <StyledEmpty>No references match this search and filter.</StyledEmpty>
      ) : null}
    </StyledPanel>
  );
};
