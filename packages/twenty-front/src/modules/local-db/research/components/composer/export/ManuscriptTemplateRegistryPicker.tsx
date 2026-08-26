import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type PortableJournalProfile } from '@/local-db/research/manuscript/manuscriptJournalProfile';
import {
  mystTemplateProfile,
  mystTemplateSummaries,
} from '@/local-db/research/manuscript/mystTemplateRegistry';

type ManuscriptTemplateRegistryPickerProps = {
  disabled: boolean;
  onAdd: (profile: PortableJournalProfile) => void | Promise<void>;
};

const StyledPicker = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledRow = styled.div`
  align-items: end;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;

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
  min-width: 0;
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 32px;
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledNote = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

export const ManuscriptTemplateRegistryPicker = ({
  disabled,
  onAdd,
}: ManuscriptTemplateRegistryPickerProps) => {
  const templates = useMemo(() => mystTemplateSummaries(), []);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [journal, setJournal] = useState('');

  const selected = templates.find((template) => template.id === templateId);
  const journals = selected?.journals ?? [];
  const journalCount = templates.reduce(
    (count, template) => count + Math.max(template.journals.length, 1),
    0,
  );

  return (
    <StyledPicker>
      <StyledRow>
        <StyledField>
          Template
          <StyledSelect
            aria-label="Template"
            value={templateId}
            disabled={disabled}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setJournal('');
            }}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
                {template.journals.length > 0
                  ? ` · ${template.journals.length} journals`
                  : ''}
              </option>
            ))}
          </StyledSelect>
        </StyledField>
        <StyledField>
          Journal
          <StyledSelect
            aria-label="Journal"
            value={journal}
            disabled={disabled || journals.length === 0}
            onChange={(event) => setJournal(event.target.value)}
          >
            <option value="">
              {journals.length === 0 ? 'Single journal' : 'Choose…'}
            </option>
            {journals.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </StyledSelect>
        </StyledField>
        <Button
          title="Add profile"
          variant="secondary"
          size="small"
          disabled={disabled || templateId.length === 0}
          onClick={() =>
            void onAdd(
              mystTemplateProfile(
                templateId,
                journal.length > 0 ? journal : undefined,
              ),
            )
          }
        />
      </StyledRow>
      <StyledNote>
        {templates.length} templates reaching {journalCount} journals. What
        travels is the journal&rsquo;s submission checklist and section
        structure, in its own wording — not its LaTeX or Typst page layout,
        which this app writes for itself.
      </StyledNote>
    </StyledPicker>
  );
};
