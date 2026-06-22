import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  downloadExportFile,
  getManuscriptExporters,
} from '@/local-db/research/manuscript/manuscriptExport';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// Pick the target journal format and export. Numbering, captions and citations
// in the bundle already reflect the selected template, so the warnings + stats
// shown here are exactly what the exported document will carry.

type JournalOption = { id: string; name: string };

type ManuscriptExportPanelProps = {
  bundle: ManuscriptBundle;
  journals: JournalOption[];
  selectedJournalId: string | null;
  onSelectJournal: (journalId: string) => void;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledStats = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledWarning = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledWarningTitle = styled.div`
  color: ${themeCssVariables.color.orange};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledExporterRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledFormats = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptExportPanel = ({
  bundle,
  journals,
  selectedJournalId,
  onSelectJournal,
}: ManuscriptExportPanelProps) => {
  const { enqueueSuccessSnackBar } = useSnackBar();
  const [isExporting, setIsExporting] = useState(false);
  const exporters = getManuscriptExporters();

  const runExport = async (exporterId: string) => {
    if (isExporting) return;
    const exporter = exporters.find((candidate) => candidate.id === exporterId);
    if (exporter === undefined) return;
    setIsExporting(true);
    try {
      const files = await exporter.export(bundle);
      for (const file of files) {
        downloadExportFile(file);
      }
      enqueueSuccessSnackBar({
        message: `Exported ${files.length} file(s) via ${exporter.label}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <StyledPanel>
      <StyledSelect
        value={selectedJournalId ?? ''}
        onChange={(event) => onSelectJournal(event.target.value)}
      >
        {journals.map((journal) => (
          <option key={journal.id} value={journal.id}>
            {journal.name}
          </option>
        ))}
      </StyledSelect>

      <StyledStats>
        <span>{bundle.stats.wordCount} words</span>
        <span>{bundle.stats.sectionCount} sections</span>
        <span>{bundle.stats.figureCount} figures</span>
        <span>{bundle.stats.referenceCount} refs</span>
        {bundle.stats.supplementSectionCount > 0 ||
        bundle.stats.supplementFigureCount > 0 ? (
          <span>
            +{bundle.stats.supplementSectionCount} suppl. sections /{' '}
            {bundle.stats.supplementFigureCount} suppl. figures
          </span>
        ) : null}
      </StyledStats>

      {bundle.warnings.length > 0 ? (
        <div>
          <StyledWarningTitle>
            {bundle.warnings.length} issue(s) before submission
          </StyledWarningTitle>
          {bundle.warnings.slice(0, 6).map((warning) => (
            <StyledWarning key={warning}>• {warning}</StyledWarning>
          ))}
        </div>
      ) : null}

      {exporters.map((exporter) => (
        <StyledExporterRow key={exporter.id}>
          <StyledFormats>
            {exporter.label} · {exporter.formats.join(', ')}
            {exporter.offline ? ' · offline' : ''}
          </StyledFormats>
          <Button
            title={isExporting ? 'Exporting…' : 'Export'}
            variant="primary"
            accent="blue"
            size="small"
            disabled={isExporting}
            onClick={() => runExport(exporter.id)}
          />
        </StyledExporterRow>
      ))}
    </StyledPanel>
  );
};
