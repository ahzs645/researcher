import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptReferenceImportTools } from '@/local-db/research/components/composer/ManuscriptReferenceImportTools';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptReferencePanelProps = {
  manuscriptId: string;
  projectId?: string | null;
  references: ReferenceLike[];
  onChanged: () => void;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSearch = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  width: 100%;
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledKey = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const referenceSearchText = (reference: ReferenceLike): string =>
  [reference.citationKey, reference.authors, reference.name, reference.year]
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase();

export const ManuscriptReferencePanel = ({
  manuscriptId,
  projectId,
  references,
  onChanged,
}: ManuscriptReferencePanelProps) => {
  const [search, setSearch] = useState('');
  const filteredReferences = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) return references;
    return references.filter((reference) =>
      referenceSearchText(reference).includes(query),
    );
  }, [references, search]);

  return (
    <StyledPanel>
      <StyledSearch
        aria-label="Search references"
        placeholder="Search citation key, authors, title, or year…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ManuscriptReferenceImportTools
        manuscriptId={manuscriptId}
        projectId={projectId}
        references={references}
        onChanged={onChanged}
      />
      <StyledCount>
        {filteredReferences.length} of {references.length} references
      </StyledCount>
      {filteredReferences.map((reference) => (
        <StyledRow key={reference.id}>
          <StyledKey>[@{reference.citationKey ?? reference.id}]</StyledKey>{' '}
          {reference.authors} ({reference.year ?? 'n.d.'}). {reference.name}
        </StyledRow>
      ))}
    </StyledPanel>
  );
};
