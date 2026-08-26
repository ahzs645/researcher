import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptExportActionsCard } from '@/local-db/research/components/composer/export/ManuscriptExportActionsCard';
import { ManuscriptExportStyleCard } from '@/local-db/research/components/composer/export/ManuscriptExportStyleCard';
import { ManuscriptJournalFormatCard } from '@/local-db/research/components/composer/export/ManuscriptJournalFormatCard';
import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  citationStyleKeyFromStyle,
  CITATION_MODE_SETTING_KEYS,
  type CitationModeStyleSettings,
  type ManuscriptExportStyleOverrides,
  withCitationStyle,
  withCitationModeSetting,
} from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import {
  downloadExportFile,
  getManuscriptExporters,
} from '@/local-db/research/manuscript/manuscriptExport';
import { type PortableManuscriptSource } from '@/local-db/research/manuscript/manuscriptPortableManifest';
import {
  type SubmissionCheckTarget,
  type SubmissionMaterials,
  validateSubmission,
} from '@/local-db/research/manuscript/manuscriptSubmission';
import {
  createPortableResearchPackage,
  createSubmissionPackage,
} from '@/local-db/research/manuscript/manuscriptSubmissionPackage';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useManuscriptSaveStatus } from '@/local-db/research/components/composer/ManuscriptSaveStatusContext';

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
  onNavigateToFix?: (target: SubmissionCheckTarget) => void;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
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
  onNavigateToFix,
}: ManuscriptExportPanelProps) => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const { markUnsaved, trackSave } = useManuscriptSaveStatus();
  const [activeExportId, setActiveExportId] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [styleOverrides, setStyleOverrides] =
    useState<ManuscriptExportStyleOverrides>(initialStyleOverrides);
  const effectiveStyle = { ...bundle.style, ...styleOverrides };
  const exportBundle = { ...bundle, style: effectiveStyle };
  const citationStyleKey = citationStyleKeyFromStyle(effectiveStyle);
  const exporters = getManuscriptExporters();
  const readiness = validateSubmission(exportBundle, materials);

  const updateStyleOverrides = (updates: ManuscriptExportStyleOverrides) => {
    markUnsaved();
    setStyleOverrides((current) => {
      let next = { ...current, ...updates };
      for (const key of CITATION_MODE_SETTING_KEYS) {
        const value = updates[key];
        if (typeof value !== 'string') continue;
        next = withCitationModeSetting(next, citationStyleKey, {
          [key]: value,
        } as CitationModeStyleSettings);
      }
      return next;
    });
  };

  const changeCitationStyle = async (nextStyleKey: string) => {
    if (isSavingSettings || nextStyleKey === citationStyleKey) return;
    const previous = styleOverrides;
    const next = withCitationStyle(previous, citationStyleKey, nextStyleKey);
    setStyleOverrides(next);
    setIsSavingSettings(true);
    try {
      await trackSave(() => onSaveStyleOverrides(next));
      enqueueSuccessSnackBar({ message: 'Citation style updated' });
    } catch {
      setStyleOverrides(previous);
      enqueueErrorSnackBar({ message: 'Could not update citation style' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const saveStyleOverrides = async () => {
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    try {
      await trackSave(() => onSaveStyleOverrides(styleOverrides));
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
      await trackSave(() => onSaveStyleOverrides({}));
      setStyleOverrides({});
      enqueueSuccessSnackBar({ message: 'Journal defaults restored' });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not reset export settings' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const runExport = async (exporterId: string) => {
    if (activeExportId !== null) return;
    const exporter = exporters.find((candidate) => candidate.id === exporterId);
    if (exporter === undefined) return;
    setActiveExportId(exporterId);
    try {
      const files = await exporter.export(exportBundle);
      for (const file of files) downloadExportFile(file);
      enqueueSuccessSnackBar({
        message: `Exported ${files.length} file(s) via ${exporter.label}`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        message: `Export via ${exporter.label} failed${
          error instanceof Error ? `: ${error.message}` : ''
        }`,
      });
    } finally {
      setActiveExportId(null);
    }
  };

  const runPortableResearchExport = async () => {
    if (activeExportId !== null) return;
    setActiveExportId('portable-research');
    try {
      const portablePackage = await createPortableResearchPackage(
        exportBundle,
        materials,
        portableSource,
      );
      downloadExportFile({
        filename: portablePackage.filename,
        mimeType: 'application/zip',
        content: portablePackage.blob,
      });
      enqueueSuccessSnackBar({
        message: `Portable research ZIP created with ${portablePackage.includedFiles.length} files`,
      });
    } catch {
      enqueueErrorSnackBar({
        message: 'Could not create the portable research ZIP',
      });
    } finally {
      setActiveExportId(null);
    }
  };

  const runSubmissionPackageExport = async () => {
    if (activeExportId !== null || !readiness.ready) return;
    setActiveExportId('submission-package');
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
      setActiveExportId(null);
    }
  };

  return (
    <StyledPanel>
      <ManuscriptExportActionsCard
        activeExportId={activeExportId}
        exporters={exporters}
        readiness={readiness}
        warnings={bundle.warnings}
        onExport={(exporterId) => void runExport(exporterId)}
        onPortableResearchExport={() => void runPortableResearchExport()}
        onSubmissionPackageExport={() => void runSubmissionPackageExport()}
        onNavigateToFix={onNavigateToFix}
      />
      <ManuscriptJournalFormatCard
        citationStyleKey={citationStyleKey}
        effectiveStyle={effectiveStyle}
        hasStyleOverrides={Object.keys(styleOverrides).length > 0}
        isSavingSettings={isSavingSettings}
        journals={journals}
        selectedJournalId={selectedJournalId}
        onCitationStyleChange={(nextStyleKey) =>
          void changeCitationStyle(nextStyleKey)
        }
        onResetStyleOverrides={() => void resetStyleOverrides()}
        onSelectJournal={onSelectJournal}
      />
      <ManuscriptExportStyleCard
        bundle={exportBundle}
        isSavingSettings={isSavingSettings}
        style={effectiveStyle}
        styleOverrides={styleOverrides}
        onChange={updateStyleOverrides}
        onSave={() => void saveStyleOverrides()}
      />
    </StyledPanel>
  );
};
