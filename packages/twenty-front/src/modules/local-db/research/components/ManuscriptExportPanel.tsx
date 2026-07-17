import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ManuscriptExportStyleOverrides } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { type PortableManuscriptSource } from '@/local-db/research/manuscript/manuscriptPortableManifest';
import {
  downloadExportFile,
  getManuscriptExporters,
} from '@/local-db/research/manuscript/manuscriptExport';
import {
  type SubmissionMaterials,
  validateSubmission,
} from '@/local-db/research/manuscript/manuscriptSubmission';
import { createSubmissionPackage } from '@/local-db/research/manuscript/manuscriptSubmissionPackage';
import { ManuscriptExportProfileSummary } from '@/local-db/research/components/ManuscriptExportProfileSummary';
import { ManuscriptExportStyleControls } from '@/local-db/research/components/ManuscriptExportStyleControls';
import { ManuscriptSubmissionReadinessPanel } from '@/local-db/research/components/ManuscriptSubmissionReadinessPanel';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';

// Pick the target journal format and export. Numbering, captions and citations
// in the bundle already reflect the selected template, so the warnings + stats
// shown here are exactly what the exported document will carry.

type JournalOption = { id: string; name: string };

type ManuscriptExportPanelProps = {
  bundle: ManuscriptBundle;
  journals: JournalOption[];
  selectedJournalId: string | null;
  onSelectJournal: (journalId: string) => void;
  initialStyleOverrides: ManuscriptExportStyleOverrides;
  onSaveStyleOverrides: (
    overrides: ManuscriptExportStyleOverrides,
  ) => Promise<void>;
  materials: SubmissionMaterials;
  portableSource: PortableManuscriptSource;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
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

const StyledSettingsActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

export const ManuscriptExportPanel = ({
  bundle,
  journals,
  selectedJournalId,
  onSelectJournal,
  initialStyleOverrides,
  onSaveStyleOverrides,
  materials,
  portableSource,
}: ManuscriptExportPanelProps) => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [styleOverrides, setStyleOverrides] =
    useState<ManuscriptExportStyleOverrides>(initialStyleOverrides);
  const effectiveStyle = { ...bundle.style, ...styleOverrides };
  const exportBundle = { ...bundle, style: effectiveStyle };
  const updateStyleOverrides = (updates: ManuscriptExportStyleOverrides) =>
    setStyleOverrides((current) => ({ ...current, ...updates }));
  const saveStyleOverrides = async () => {
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    try {
      await onSaveStyleOverrides(styleOverrides);
      enqueueSuccessSnackBar({ message: 'Export settings saved' });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not save export settings' });
    } finally {
      setIsSavingSettings(false);
    }
  };
  const resetStyleOverrides = async () => {
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    try {
      await onSaveStyleOverrides({});
      setStyleOverrides({});
      enqueueSuccessSnackBar({ message: 'Journal defaults restored' });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not reset export settings' });
    } finally {
      setIsSavingSettings(false);
    }
  };
  const exporters = getManuscriptExporters();
  const readiness = validateSubmission(exportBundle, materials);
  const journalOptions: SelectOption<string>[] = journals.map((journal) => ({
    value: journal.id,
    label: journal.name,
  }));

  const runExport = async (exporterId: string) => {
    if (isExporting) return;
    const exporter = exporters.find((candidate) => candidate.id === exporterId);
    if (exporter === undefined) return;
    setIsExporting(true);
    try {
      const files = await exporter.export(exportBundle);
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

  const runPackageExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const submissionPackage = await createSubmissionPackage(
        exportBundle,
        materials,
        portableSource,
      );
      downloadExportFile({
        filename: submissionPackage.filename,
        mimeType: 'application/zip',
        content: submissionPackage.blob,
      });
      enqueueSuccessSnackBar({
        message: `Submission package created with ${submissionPackage.includedFiles.length} files`,
      });
    } catch {
      enqueueErrorSnackBar({
        message: 'Could not create the submission package',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <StyledPanel>
      <Select
        dropdownId="manuscript-export-journal-select"
        label="Journal format"
        fullWidth
        options={journalOptions}
        value={selectedJournalId ?? journalOptions[0]?.value}
        onChange={onSelectJournal}
      />

      <ManuscriptExportStyleControls
        style={effectiveStyle}
        onChange={updateStyleOverrides}
      />
      <StyledSettingsActions>
        <Button
          title={isSavingSettings ? 'Saving settings…' : 'Save export settings'}
          variant="primary"
          accent="blue"
          size="small"
          disabled={isSavingSettings}
          onClick={saveStyleOverrides}
        />
        <Button
          title="Reset to journal defaults"
          variant="secondary"
          size="small"
          disabled={isSavingSettings}
          onClick={resetStyleOverrides}
        />
        <StyledFormats>
          Saved settings apply only to this manuscript; the journal profile
          remains reusable.
        </StyledFormats>
      </StyledSettingsActions>

      <ManuscriptExportProfileSummary bundle={exportBundle} />
      <ManuscriptSubmissionReadinessPanel
        readiness={readiness}
        isExporting={isExporting}
        onDownloadPackage={runPackageExport}
      />

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
