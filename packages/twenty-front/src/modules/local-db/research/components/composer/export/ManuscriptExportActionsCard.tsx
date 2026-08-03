import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptSubmissionReadinessPanel } from '@/local-db/research/components/ManuscriptSubmissionReadinessPanel';
import {
  StyledExportCard,
  StyledExportCardDescription,
  StyledExportCardHeader,
  StyledExportCardTitle,
} from '@/local-db/research/components/composer/export/ManuscriptExportCard';
import { type ManuscriptExporter } from '@/local-db/research/manuscript/manuscriptExport';
import {
  type SubmissionCheckTarget,
  type SubmissionReadiness,
} from '@/local-db/research/manuscript/manuscriptSubmission';

type ManuscriptExportActionsCardProps = {
  activeExportId: string | null;
  exporters: ManuscriptExporter[];
  readiness: SubmissionReadiness;
  warnings: string[];
  onExport: (exporterId: string) => void;
  onPortableResearchExport: () => void;
  onSubmissionPackageExport: () => void;
  onNavigateToFix?: (target: SubmissionCheckTarget) => void;
};

type ExportAction = {
  id: string;
  label: string;
  busyLabel: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
};

const EXPORTER_PRESENTATION: Record<
  string,
  { label: string; description: string }
> = {
  'blocknote-docx': {
    label: 'Word (.docx)',
    description: 'Editable manuscript document for journal submission.',
  },
  'blocknote-pdf': {
    label: 'PDF',
    description: 'Print-ready preview using the selected journal formatting.',
  },
  'markdown-bundle': {
    label: 'Markdown bundle',
    description: 'Pandoc-ready manuscript with its structured bibliography.',
  },
};

const StyledActions = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
`;

const StyledAction = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} 0;
`;

const StyledActionCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledActionTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledActionDescription = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledWarnings = styled.details`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};

  & > summary {
    color: ${themeCssVariables.color.orange};
    cursor: pointer;
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledWarningList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]} 0 0 ${themeCssVariables.spacing[3]};
`;

export const ManuscriptExportActionsCard = ({
  activeExportId,
  exporters,
  readiness,
  warnings,
  onExport,
  onPortableResearchExport,
  onSubmissionPackageExport,
  onNavigateToFix,
}: ManuscriptExportActionsCardProps) => {
  const actions: ExportAction[] = [
    ...exporters.map((exporter) => ({
      id: exporter.id,
      label: EXPORTER_PRESENTATION[exporter.id]?.label ?? exporter.label,
      busyLabel: 'Exporting…',
      description:
        EXPORTER_PRESENTATION[exporter.id]?.description ??
        `${exporter.formats.join(', ')} export${exporter.offline ? ' · available offline' : ''}.`,
      onClick: () => onExport(exporter.id),
    })),
    {
      id: 'portable-research',
      label: 'Portable research ZIP',
      busyLabel: 'Packaging…',
      description:
        'Re-importable research package with sections, figures, references, and settings.',
      onClick: onPortableResearchExport,
    },
    {
      id: 'submission-package',
      label: 'Submission package',
      busyLabel: 'Packaging…',
      description: readiness.ready
        ? 'Journal-ready ZIP with the manuscript, materials, figures, and readiness manifest.'
        : `Resolve ${readiness.errorCount} required item${readiness.errorCount === 1 ? '' : 's'} before creating the submission package.`,
      onClick: onSubmissionPackageExport,
      disabled: !readiness.ready,
    },
  ];

  return (
    <StyledExportCard>
      <StyledExportCardHeader>
        <StyledExportCardTitle>Export</StyledExportCardTitle>
        <StyledExportCardDescription>
          Download the manuscript in the format needed for review, handoff, or
          submission.
        </StyledExportCardDescription>
      </StyledExportCardHeader>
      <ManuscriptSubmissionReadinessPanel
        readiness={readiness}
        onNavigate={onNavigateToFix}
      />
      <StyledActions>
        {actions.map((action) => (
          <StyledAction key={action.id}>
            <StyledActionCopy>
              <StyledActionTitle>{action.label}</StyledActionTitle>
              <StyledActionDescription>
                {action.description}
              </StyledActionDescription>
            </StyledActionCopy>
            <Button
              title={
                activeExportId === action.id ? action.busyLabel : action.label
              }
              variant="primary"
              accent="blue"
              size="small"
              disabled={activeExportId !== null || action.disabled === true}
              onClick={action.onClick}
            />
          </StyledAction>
        ))}
      </StyledActions>
      {warnings.length > 0 ? (
        <StyledWarnings>
          <summary>
            {warnings.length} formatting issue
            {warnings.length === 1 ? '' : 's'} to review
          </summary>
          <StyledWarningList>
            {warnings.map((warning) => (
              <div key={warning}>• {warning}</div>
            ))}
          </StyledWarningList>
        </StyledWarnings>
      ) : null}
    </StyledExportCard>
  );
};
