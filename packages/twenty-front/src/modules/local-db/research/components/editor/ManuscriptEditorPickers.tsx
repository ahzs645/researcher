import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  manuscriptReferenceKey,
  useManuscriptEditorContext,
} from '@/local-db/research/components/editor/ManuscriptEditorContext';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

const StyledSearch = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  padding: ${themeCssVariables.spacing[2]};
  width: 100%;
`;

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  max-height: 240px;
  overflow-y: auto;
`;

const StyledItem = styled.button`
  background: transparent;
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledItemMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: block;
  font-size: ${themeCssVariables.font.size.xs};
  margin-top: ${themeCssVariables.spacing[0.5]};
`;

const referenceSearchText = (reference: ReferenceLike): string =>
  [manuscriptReferenceKey(reference), reference.authors, reference.name]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase();

type ManuscriptReferencePickerProps = {
  onRemove?: () => void;
  onSelect: (citationKey: string) => void;
};

export const ManuscriptReferencePicker = ({
  onRemove,
  onSelect,
}: ManuscriptReferencePickerProps) => {
  const { references } = useManuscriptEditorContext();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized.length === 0
      ? references
      : references.filter((reference) =>
          referenceSearchText(reference).includes(normalized),
        );
  }, [query, references]);

  return (
    <>
      <StyledSearch
        autoFocus
        aria-label="Search references"
        placeholder="Search key, author, or title"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <StyledList>
        {filtered.map((reference) => {
          const key = manuscriptReferenceKey(reference);
          return (
            <StyledItem key={reference.id} onClick={() => onSelect(key)}>
              {reference.name ?? key}
              <StyledItemMeta>
                {key}
                {reference.authors ? ` · ${reference.authors}` : ''}
              </StyledItemMeta>
            </StyledItem>
          );
        })}
      </StyledList>
      {onRemove === undefined ? null : (
        <Button
          title="Remove citation"
          variant="secondary"
          size="small"
          onClick={onRemove}
        />
      )}
    </>
  );
};

type ManuscriptCrossRefPickerProps = {
  onSelect: (refKey: string) => void;
};

export const ManuscriptCrossRefPicker = ({
  onSelect,
}: ManuscriptCrossRefPickerProps) => {
  const { figures, numberedSections } = useManuscriptEditorContext();
  return (
    <StyledList>
      {figures.map((figure) => {
        const key = figure.refKey?.trim() || figure.id;
        return (
          <StyledItem key={figure.id} onClick={() => onSelect(key)}>
            {figure.crossRefLabel}
            <StyledItemMeta>
              {key}
              {figure.name ? ` · ${figure.name}` : ''}
            </StyledItemMeta>
          </StyledItem>
        );
      })}
      {/* Only a section the author has actually named can be pointed at: a
          record id would resolve today and mean nothing on another machine. */}
      {numberedSections
        .filter((section) => isNonEmptyString(section.refKey?.trim()))
        .map((section) => (
          <StyledItem
            key={section.id}
            onClick={() => onSelect(section.referenceKey)}
          >
            {section.crossRefLabel}
            <StyledItemMeta>
              {section.referenceKey} · {section.heading}
            </StyledItemMeta>
          </StyledItem>
        ))}
    </StyledList>
  );
};
