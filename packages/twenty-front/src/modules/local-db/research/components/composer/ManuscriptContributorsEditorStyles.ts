import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledContributorRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto;
  padding: ${themeCssVariables.spacing[2]};

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

export const StyledAffiliationRow = styled.div`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 28px minmax(0, 1fr) auto;
`;

export const StyledReferenceOptions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

export const StyledCheckboxLabel = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

// The structured fields are the exception, not the rule: two or three people
// get an ORCID and a few roles, nobody fills in twelve fields for twenty
// authors. They live in a panel that stays shut until asked for.
export const StyledDetailPanel = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  grid-column: 1 / -1;
  padding-top: ${themeCssVariables.spacing[2]};
`;

export const StyledDetailGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
`;

export const StyledFieldWarning = styled.span`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const StyledRoleOptions = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
`;

export const StyledFundingRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
`;

export const StyledStatementPreview = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;
