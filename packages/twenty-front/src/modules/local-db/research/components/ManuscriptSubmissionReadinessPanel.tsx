import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type SubmissionReadiness } from '@/local-db/research/manuscript/manuscriptSubmission';

type ManuscriptSubmissionReadinessPanelProps = {
  readiness: SubmissionReadiness;
  isExporting: boolean;
  onDownloadPackage: () => void;
};

const StyledPackage = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledStats = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCheck = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};

  &[data-severity='ERROR'] {
    color: ${themeCssVariables.font.color.danger};
  }

  &[data-severity='READY'] {
    color: ${themeCssVariables.font.color.tertiary};
  }
`;

export const ManuscriptSubmissionReadinessPanel = ({
  readiness,
  isExporting,
  onDownloadPackage,
}: ManuscriptSubmissionReadinessPanelProps) => (
  <StyledPackage>
    <StyledHeader>
      <div>
        <StyledTitle>
          {readiness.ready
            ? 'Ready to package'
            : 'Submission package needs attention'}
        </StyledTitle>
        <StyledStats>
          <span>{readiness.readyCount} ready</span>
          <span>{readiness.warningCount} warnings</span>
          <span>{readiness.errorCount} required items missing</span>
        </StyledStats>
      </div>
      <Button
        title={isExporting ? 'Packaging…' : 'Download package (.zip)'}
        variant="primary"
        accent="blue"
        size="small"
        disabled={isExporting}
        onClick={onDownloadPackage}
      />
    </StyledHeader>
    {readiness.checks.map((check) => (
      <StyledCheck key={check.id} data-severity={check.severity}>
        {check.severity === 'READY'
          ? '✓'
          : check.severity === 'ERROR'
            ? '!'
            : '•'}{' '}
        {check.label}: {check.detail}
      </StyledCheck>
    ))}
  </StyledPackage>
);
