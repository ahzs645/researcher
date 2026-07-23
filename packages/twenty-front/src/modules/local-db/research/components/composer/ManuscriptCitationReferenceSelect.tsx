import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { referenceSearchText } from '@/local-db/research/components/ManuscriptReferencePanel';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptCitationReferenceSelectProps = {
  label: string;
  onChange: (citationKey: string) => void;
  references: ReferenceLike[];
  value: string;
};

const StyledPicker = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  grid-template-columns: minmax(130px, 0.8fr) minmax(180px, 1.2fr);
`;

const StyledSearch = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xs};
  min-height: 30px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xs};
  min-height: 30px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const referenceLabel = (reference: ReferenceLike): string =>
  `[@${reference.citationKey ?? reference.id}] ${reference.authors ?? 'Unknown'} (${reference.year ?? 'n.d.'}) ${reference.name ?? ''}`;

export const ManuscriptCitationReferenceSelect = ({
  label,
  onChange,
  references,
  value,
}: ManuscriptCitationReferenceSelectProps) => {
  const [search, setSearch] = useState('');
  const options = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (query.length === 0) return references;
    return references.filter(
      (reference) =>
        referenceSearchText(reference).includes(query) ||
        reference.citationKey === value,
    );
  }, [references, search, value]);

  return (
    <StyledPicker>
      <StyledSearch
        aria-label={`Search references for ${label}`}
        placeholder="Search key, author, title, year…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <StyledSelect
        aria-label={`Link ${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a reference…</option>
        {options.map((reference) => {
          const citationKey = reference.citationKey?.trim();
          if (citationKey === undefined || citationKey.length === 0)
            return null;
          return (
            <option key={reference.id} value={citationKey}>
              {referenceLabel(reference)}
            </option>
          );
        })}
      </StyledSelect>
    </StyledPicker>
  );
};
