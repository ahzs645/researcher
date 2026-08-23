import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ManuscriptStyleFileControl } from '@/local-db/research/manuscript/manuscriptExportStyleControlDefinitions';
import { type ManuscriptExportStyleOverrides } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import {
  describeManuscriptDocxTemplate,
  manuscriptDocxTemplateRejection,
  readManuscriptDocxTemplate,
} from '@/local-db/research/manuscript/manuscriptDocxTemplate';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptExportTemplateFieldProps = {
  control: ManuscriptStyleFileControl;
  style: JournalStyle;
  onChange: (updates: ManuscriptExportStyleOverrides) => void;
};

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 32px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledSummary = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledRejection = styled.span`
  color: ${themeCssVariables.color.orange};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledClearButton = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-decoration: underline;
`;

const stringValue = (
  style: JournalStyle,
  field: keyof JournalStyle,
): string => {
  const value = style[field];
  return typeof value === 'string' ? value : '';
};

// Picks a .docx and keeps only its style definitions. Separate from the
// generic select/text controls because it has to read a file, say why one was
// rejected, and offer a way to take the template back off again.
export const ManuscriptExportTemplateField = ({
  control,
  style,
  onChange,
}: ManuscriptExportTemplateFieldProps) => {
  const [rejection, setRejection] = useState<string | null>(null);
  const storedStyles = stringValue(style, control.field);

  return (
    <StyledField>
      {control.label}
      <StyledRow>
        <StyledInput
          id={control.id}
          type="file"
          accept={control.accept}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file === undefined) return;
            const result = readManuscriptDocxTemplate(
              new Uint8Array(await file.arrayBuffer()),
            );
            event.target.value = '';
            if (!result.ok) {
              setRejection(manuscriptDocxTemplateRejection(result));
              return;
            }
            setRejection(null);
            onChange({
              [control.field]: result.stylesXml,
              [control.sourceNameField]: file.name,
            } as ManuscriptExportStyleOverrides);
          }}
        />
        <StyledSummary>
          {describeManuscriptDocxTemplate(
            storedStyles,
            stringValue(style, control.sourceNameField),
          )}
        </StyledSummary>
        {storedStyles.length > 0 ? (
          <StyledClearButton
            type="button"
            onClick={() => {
              setRejection(null);
              onChange({
                [control.field]: '',
                [control.sourceNameField]: '',
              } as ManuscriptExportStyleOverrides);
            }}
          >
            Remove
          </StyledClearButton>
        ) : null}
      </StyledRow>
      {rejection === null ? (
        <StyledSummary>{control.description}</StyledSummary>
      ) : (
        <StyledRejection>{rejection}</StyledRejection>
      )}
    </StyledField>
  );
};
