import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type ReferenceFormValues,
  validateReferenceCslJson,
} from '@/local-db/research/manuscript/manuscriptReferenceForm';

type ManuscriptReferenceEditorProps = {
  initialValues: ReferenceFormValues;
  isCitationKeyGenerated?: boolean;
  onCancel: () => void;
  onSave: (values: ReferenceFormValues) => Promise<void>;
  saveTitle?: string;
};

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledAdvanced = styled.details`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};

  & > summary {
    cursor: pointer;
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  display: block;
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  margin-top: ${themeCssVariables.spacing[2]};
  min-height: 120px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
  width: 100%;
`;

const StyledError = styled.span`
  color: ${themeCssVariables.font.color.danger};
  display: block;
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const TEXT_FIELDS: Array<{
  key: Exclude<keyof ReferenceFormValues, 'cslJson' | 'year'>;
  label: string;
  placeholder?: string;
}> = [
  { key: 'citationKey', label: 'Citation key' },
  { key: 'authors', label: 'Authors', placeholder: 'Family, Given; …' },
  { key: 'name', label: 'Title/name' },
  { key: 'containerTitle', label: 'Container title' },
  { key: 'volume', label: 'Volume' },
  { key: 'issue', label: 'Issue' },
  { key: 'pages', label: 'Pages' },
  { key: 'doi', label: 'DOI' },
  { key: 'url', label: 'URL' },
];

export const ManuscriptReferenceEditor = ({
  initialValues,
  isCitationKeyGenerated = false,
  onCancel,
  onSave,
  saveTitle = 'Save reference',
}: ManuscriptReferenceEditorProps) => {
  const [values, setValues] = useState(initialValues);
  const [cslError, setCslError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateValue = (key: keyof ReferenceFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === 'cslJson') setCslError(null);
  };

  const save = async () => {
    const nextCslError = validateReferenceCslJson(values.cslJson);
    setCslError(nextCslError);
    if (nextCslError !== null || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(values);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledForm
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <StyledGrid>
        {TEXT_FIELDS.map((field) => (
          <StyledField key={field.key}>
            {field.label}
            <StyledInput
              disabled={field.key === 'citationKey' && isCitationKeyGenerated}
              placeholder={
                field.key === 'citationKey' && isCitationKeyGenerated
                  ? 'Generated from author and year'
                  : field.placeholder
              }
              value={values[field.key]}
              onChange={(event) =>
                updateValue(field.key, event.target.value)
              }
            />
            {field.key === 'citationKey' && isCitationKeyGenerated ? (
              <StyledHint>Generated uniquely when the reference is added.</StyledHint>
            ) : null}
          </StyledField>
        ))}
        <StyledField>
          Year
          <StyledInput
            inputMode="numeric"
            type="number"
            value={values.year}
            onChange={(event) => updateValue('year', event.target.value)}
          />
        </StyledField>
      </StyledGrid>
      <StyledAdvanced open={cslError !== null}>
        <summary>CSL-JSON (advanced)</summary>
        <StyledTextarea
          aria-label="CSL-JSON (advanced)"
          aria-invalid={cslError !== null}
          value={values.cslJson}
          onChange={(event) => updateValue('cslJson', event.target.value)}
        />
        {cslError === null ? null : (
          <StyledError role="alert">{cslError}</StyledError>
        )}
      </StyledAdvanced>
      <StyledActions>
        <Button
          title="Cancel"
          variant="secondary"
          size="small"
          onClick={onCancel}
        />
        <Button
          title={isSaving ? 'Saving…' : saveTitle}
          variant="primary"
          size="small"
          disabled={isSaving}
          type="submit"
        />
      </StyledActions>
    </StyledForm>
  );
};
