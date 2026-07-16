import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { MANUSCRIPT_STYLE_CONTROL_GROUPS } from '@/local-db/research/manuscript/manuscriptExportStyleControlDefinitions';
import { type ManuscriptExportStyleOverrides } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';
import { Select } from '@/ui/input/components/Select';

type ManuscriptExportStyleControlsProps = {
  style: JournalStyle;
  onChange: (updates: ManuscriptExportStyleOverrides) => void;
};

const StyledSections = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSectionTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
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
  min-height: 32px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const selectValue = (
  style: JournalStyle,
  field: keyof ManuscriptExportStyleOverrides,
  defaultValue: string,
): string => {
  const value = style[field];
  if (field === 'headingColor') {
    if (value === '0F4761') return 'ADDIS_BLUE';
    if (value === '000000') return 'BLACK';
  }
  if (field === 'supplementStartLayout' && value === 'NEW_COVER_PAGE') {
    return 'NEW_PAGE';
  }
  if (
    field === 'supplementCoverPage' &&
    value === undefined &&
    style.supplementStartLayout === 'NEW_COVER_PAGE'
  ) {
    return 'true';
  }
  return value === null || value === undefined ? defaultValue : String(value);
};

export const ManuscriptExportStyleControls = ({
  style,
  onChange,
}: ManuscriptExportStyleControlsProps) => (
  <StyledSections>
    {MANUSCRIPT_STYLE_CONTROL_GROUPS.map((group) => (
      <StyledSection key={group.id}>
        <div>
          <StyledSectionTitle>{group.title}</StyledSectionTitle>
          <StyledDescription>{group.description}</StyledDescription>
        </div>
        <StyledGrid>
          {group.texts.map((control) => (
            <StyledField key={control.id}>
              {control.label}
              <StyledInput
                id={control.id}
                value={String(style[control.field] ?? control.defaultValue)}
                placeholder={control.placeholder}
                onChange={(event) =>
                  onChange({
                    [control.field]: event.target.value,
                  } as ManuscriptExportStyleOverrides)
                }
              />
            </StyledField>
          ))}
          {group.selects.map((control) => (
            <Select
              key={control.id}
              dropdownId={control.id}
              label={control.label}
              fullWidth
              options={control.options}
              value={selectValue(style, control.field, control.defaultValue)}
              onChange={(value) => {
                const parsedValue =
                  control.valueType === 'NUMBER'
                    ? Number(value)
                    : control.valueType === 'BOOLEAN'
                      ? value === 'true'
                      : value;
                onChange({
                  [control.field]: parsedValue,
                } as ManuscriptExportStyleOverrides);
              }}
            />
          ))}
        </StyledGrid>
      </StyledSection>
    ))}
  </StyledSections>
);
