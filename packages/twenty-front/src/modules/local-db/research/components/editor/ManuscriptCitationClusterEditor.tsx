import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptReferencePicker } from '@/local-db/research/components/editor/ManuscriptEditorPickers';
import {
  citationClusterFromProp,
  citationClusterToProp,
  type CitationClusterItem,
} from '@/local-db/research/manuscript/manuscriptEditorContent';

type ManuscriptCitationClusterEditorProps = {
  citationKey: string;
  onRemove: () => void;
  onSave: (citationKey: string) => void;
};

const StyledEditor = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  min-width: min(520px, calc(100vw - 48px));
`;

const StyledItem = styled.fieldset`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledItemHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledKey = styled.strong`
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledFields = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: grid;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-width: 0;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledCheckbox = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledAdd = styled.details`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};

  & > summary {
    cursor: pointer;
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

export const ManuscriptCitationClusterEditor = ({
  citationKey,
  onRemove,
  onSave,
}: ManuscriptCitationClusterEditorProps) => {
  const [items, setItems] = useState(() =>
    citationClusterFromProp(citationKey),
  );

  const updateItem = (
    index: number,
    update: (item: CitationClusterItem) => CitationClusterItem,
  ) =>
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? update(item) : item,
      ),
    );

  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(destination, 0, item);
      return next;
    });
  };

  return (
    <StyledEditor aria-label="Citation cluster editor">
      {items.map((item, index) => (
        <StyledItem key={`${item.citationKey}-${index}`}>
          <StyledItemHeader>
            <StyledKey>@{item.citationKey}</StyledKey>
            <Button
              title="Move up"
              variant="secondary"
              size="small"
              disabled={index === 0}
              onClick={() => moveItem(index, -1)}
            />
            <Button
              title="Move down"
              variant="secondary"
              size="small"
              disabled={index === items.length - 1}
              onClick={() => moveItem(index, 1)}
            />
            <Button
              title="Remove source"
              variant="secondary"
              size="small"
              onClick={() =>
                setItems((current) =>
                  current.filter(
                    (_candidate, itemIndex) => itemIndex !== index,
                  ),
                )
              }
            />
          </StyledItemHeader>
          <StyledFields>
            {(
              [
                ['prefix', 'Prefix', 'e.g. see'],
                ['locator', 'Locator', 'e.g. p. 42'],
                ['suffix', 'Suffix', 'e.g. emphasis added'],
              ] as const
            ).map(([field, label, placeholder]) => (
              <StyledField key={field}>
                {label}
                <StyledInput
                  value={item[field]}
                  placeholder={placeholder}
                  onChange={(event) =>
                    updateItem(index, (current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                />
              </StyledField>
            ))}
          </StyledFields>
          <StyledCheckbox>
            <input
              type="checkbox"
              checked={item.suppressAuthor}
              onChange={(event) =>
                updateItem(index, (current) => ({
                  ...current,
                  suppressAuthor: event.target.checked,
                }))
              }
            />
            Suppress author
          </StyledCheckbox>
        </StyledItem>
      ))}
      <StyledAdd>
        <summary>Add another source</summary>
        <ManuscriptReferencePicker
          onSelect={(nextCitationKey) =>
            setItems((current) =>
              current.some((item) => item.citationKey === nextCitationKey)
                ? current
                : [
                    ...current,
                    {
                      citationKey: nextCitationKey,
                      locator: '',
                      prefix: '',
                      suffix: '',
                      suppressAuthor: false,
                    },
                  ],
            )
          }
        />
      </StyledAdd>
      <StyledActions>
        <Button
          title="Remove citation"
          variant="secondary"
          size="small"
          onClick={onRemove}
        />
        <Button
          title="Save citation"
          variant="primary"
          size="small"
          disabled={items.length === 0}
          onClick={() => onSave(citationClusterToProp(items))}
        />
      </StyledActions>
    </StyledEditor>
  );
};
