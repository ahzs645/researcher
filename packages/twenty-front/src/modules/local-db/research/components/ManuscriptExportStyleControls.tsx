import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  MANUSCRIPT_STYLE_CONTROL_GROUPS,
  type ManuscriptStyleControlGroup,
} from '@/local-db/research/manuscript/manuscriptExportStyleControlDefinitions';
import { ManuscriptExportTemplateField } from '@/local-db/research/components/composer/export/ManuscriptExportTemplateField';
import {
  type ManuscriptExportStyleOverrideKey,
  type ManuscriptExportStyleOverrides,
} from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';
import { Select } from '@/ui/input/components/Select';

type ManuscriptExportStyleControlsProps = {
  style: JournalStyle;
  styleOverrides: ManuscriptExportStyleOverrides;
  onChange: (updates: ManuscriptExportStyleOverrides) => void;
};

const StyledSections = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSection = styled.details`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};

  & > summary {
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    font-size: ${themeCssVariables.font.size.sm};
    font-weight: ${themeCssVariables.font.weight.medium};
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  }
`;

const StyledGrid = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: ${themeCssVariables.spacing[3]};

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  grid-column: 1 / -1;
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
  field: ManuscriptExportStyleOverrideKey,
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

const customizedCount = (
  group: ManuscriptStyleControlGroup,
  styleOverrides: ManuscriptExportStyleOverrides,
): number =>
  [...group.texts, ...group.selects, ...(group.files ?? [])].filter(
    (control) => styleOverrides[control.field] !== undefined,
  ).length;

export const ManuscriptExportStyleControls = ({
  style,
  styleOverrides,
  onChange,
}: ManuscriptExportStyleControlsProps) => (
  <StyledSections>
    {MANUSCRIPT_STYLE_CONTROL_GROUPS.map((group) => (
      <StyledSection key={group.id}>
        <summary>
          {group.title}
          {customizedCount(group, styleOverrides) > 0
            ? ` · ${customizedCount(group, styleOverrides)} customized`
            : ''}
        </summary>
        <StyledGrid>
          <StyledDescription>{group.description}</StyledDescription>
          {(group.files ?? []).map((control) => (
            <ManuscriptExportTemplateField
              key={control.id}
              control={control}
              style={style}
              onChange={onChange}
            />
          ))}
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
          {group.selects
            .filter((control) => control.field !== 'citationMode')
            .map((control) => (
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
