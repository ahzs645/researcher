import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type SubmissionCheckTarget,
  type SubmissionReadiness,
} from '@/local-db/research/manuscript/manuscriptSubmission';

type ManuscriptSubmissionReadinessPanelProps = {
  readiness: SubmissionReadiness;
  onNavigate?: (target: SubmissionCheckTarget) => void;
};

const StyledReadiness = styled.details`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};

  & > summary {
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    font-size: ${themeCssVariables.font.size.xs};
    font-weight: ${themeCssVariables.font.weight.medium};
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  }
`;

const StyledCheck = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;

  &[data-severity='ERROR'] {
    color: ${themeCssVariables.font.color.danger};
  }

  &[data-severity='READY'] {
    color: ${themeCssVariables.font.color.tertiary};
  }
`;

const StyledCheckCopy = styled.span`
  min-width: 0;
`;

const StyledChecks = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]}
    ${themeCssVariables.spacing[3]};
`;

export const ManuscriptSubmissionReadinessPanel = ({
  readiness,
  onNavigate,
}: ManuscriptSubmissionReadinessPanelProps) => (
  <StyledReadiness open={!readiness.ready}>
    <summary>
      Submission readiness · {readiness.readyCount} ready /{' '}
      {readiness.warningCount} warnings
      {readiness.errorCount > 0
        ? ` / ${readiness.errorCount} required items missing`
        : ''}
    </summary>
    <StyledChecks>
      {readiness.checks.map((check) => (
        <StyledCheck key={check.id} data-severity={check.severity}>
          <StyledCheckCopy>
            {check.severity === 'READY'
              ? '✓'
              : check.severity === 'ERROR'
                ? '!'
                : '•'}{' '}
            {check.label}: {check.detail}
          </StyledCheckCopy>
          {check.severity !== 'READY' &&
          check.target !== undefined &&
          onNavigate !== undefined ? (
            <Button
              title="Go fix"
              variant="tertiary"
              size="small"
              onClick={() => onNavigate(check.target!)}
            />
          ) : null}
        </StyledCheck>
      ))}
    </StyledChecks>
  </StyledReadiness>
);
