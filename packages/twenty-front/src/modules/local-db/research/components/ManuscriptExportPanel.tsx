import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';
import {
  downloadExportFile,
  getManuscriptExporters,
} from '@/local-db/research/manuscript/manuscriptExport';
import {
  type SubmissionMaterials,
  validateSubmission,
} from '@/local-db/research/manuscript/manuscriptSubmission';
import { createSubmissionPackage } from '@/local-db/research/manuscript/manuscriptSubmissionPackage';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';

// Pick the target journal format and export. Numbering, captions and citations
// in the bundle already reflect the selected template, so the warnings + stats
// shown here are exactly what the exported document will carry.

type JournalOption = { id: string; name: string };

type ExportStyleOverrides = Pick<
  JournalStyle,
  | 'headingColor'
  | 'lineSpacing'
  | 'paragraphSpacingAfter'
  | 'affiliationAlignment'
  | 'affiliationNumberStyle'
  | 'affiliationLineSpacing'
  | 'affiliationSpacingAfter'
  | 'tableStyle'
  | 'tableFontSize'
  | 'tableLineSpacing'
  | 'figureCaptionPosition'
  | 'tableCaptionPosition'
  | 'figurePageLayout'
>;

const HEADING_COLOR_OPTIONS: SelectOption<string>[] = [
  { value: 'BLACK', label: 'Black' },
  { value: 'ADDIS_BLUE', label: 'Addis blue' },
];

const LINE_SPACING_OPTIONS: SelectOption<string>[] = [
  { value: '1', label: 'Single (1.0×)' },
  { value: '1.15', label: 'Compact (1.15×)' },
  { value: '1.5', label: 'One-and-a-half (1.5×)' },
  { value: '2', label: 'Double (2.0×)' },
];

const PARAGRAPH_SPACING_OPTIONS: SelectOption<string>[] = [
  { value: '0', label: 'No extra space' },
  { value: '6', label: '6 pt after' },
  { value: '12', label: '12 pt after' },
];

const AFFILIATION_ALIGNMENT_OPTIONS: SelectOption<string>[] = [
  { value: 'LEFT', label: 'Left aligned (Addis)' },
  { value: 'CENTER', label: 'Centered' },
  { value: 'RIGHT', label: 'Right aligned' },
];

const AFFILIATION_NUMBER_STYLE_OPTIONS: SelectOption<string>[] = [
  { value: 'SUPERSCRIPT', label: 'Superscript (Addis)' },
  { value: 'BASELINE', label: 'Baseline' },
];

const AFFILIATION_GAP_OPTIONS: SelectOption<string>[] = [
  { value: '0', label: 'Tight (0 pt)' },
  { value: '3', label: 'Compact (3 pt)' },
  { value: '6', label: 'Open (6 pt)' },
];

const TABLE_STYLE_OPTIONS: SelectOption<string>[] = [
  { value: 'ACADEMIC', label: 'Academic rules (Addis)' },
  { value: 'GRID', label: 'Full grid' },
  { value: 'SHADED_HEADER', label: 'Shaded header' },
  { value: 'BORDERLESS', label: 'Borderless' },
];

const TABLE_FONT_SIZE_OPTIONS: SelectOption<string>[] = [
  { value: '9', label: '9 pt' },
  { value: '10', label: '10 pt' },
  { value: '11', label: '11 pt' },
  { value: '12', label: '12 pt' },
];

const CAPTION_POSITION_OPTIONS: SelectOption<string>[] = [
  { value: 'BELOW', label: 'Below figure (Addis)' },
  { value: 'ABOVE', label: 'Above figure' },
];

const TABLE_CAPTION_POSITION_OPTIONS: SelectOption<string>[] = [
  { value: 'ABOVE', label: 'Above table (Addis)' },
  { value: 'BELOW', label: 'Below table' },
];

const FIGURE_PAGE_LAYOUT_OPTIONS: SelectOption<string>[] = [
  {
    value: 'SUPPLEMENT_ONE_PER_PAGE',
    label: 'Main inline; supplement one per page (Addis)',
  },
  { value: 'ONE_PER_PAGE', label: 'Every figure on a separate page' },
  { value: 'INLINE', label: 'All figures flow with section text' },
];

type ManuscriptExportPanelProps = {
  bundle: ManuscriptBundle;
  journals: JournalOption[];
  selectedJournalId: string | null;
  onSelectJournal: (journalId: string) => void;
  materials: SubmissionMaterials;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledStats = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledProfileSummary = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: 1.5;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledControlGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
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

const StyledPackage = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledPackageHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledPackageTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
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

export const ManuscriptExportPanel = ({
  bundle,
  journals,
  selectedJournalId,
  onSelectJournal,
  materials,
}: ManuscriptExportPanelProps) => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [isExporting, setIsExporting] = useState(false);
  const [styleOverrides, setStyleOverrides] = useState<ExportStyleOverrides>(
    {},
  );
  const effectiveStyle = { ...bundle.style, ...styleOverrides };
  const exportBundle = { ...bundle, style: effectiveStyle };
  const exporters = getManuscriptExporters();
  const readiness = validateSubmission(exportBundle, materials);
  const frontMatterLabel =
    effectiveStyle.frontMatterLayout === 'SEPARATE_TITLE_PAGE'
      ? 'Separate title page'
      : effectiveStyle.frontMatterLayout === 'TITLE_WITH_ABSTRACT'
        ? 'Title + abstract on page 1'
        : 'Continuous front matter';
  const spacingLabel =
    effectiveStyle.lineSpacing === 2
      ? 'double-spaced'
      : `${effectiveStyle.lineSpacing ?? 1.5}× spacing`;

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
        onChange={(journalId) => {
          setStyleOverrides({});
          onSelectJournal(journalId);
        }}
      />

      <StyledControlGrid>
        <Select
          dropdownId="manuscript-export-heading-color-select"
          label="Heading color"
          fullWidth
          options={HEADING_COLOR_OPTIONS}
          value={
            effectiveStyle.headingColor === '0F4761'
              ? 'ADDIS_BLUE'
              : effectiveStyle.headingColor === '000000'
                ? 'BLACK'
                : (effectiveStyle.headingColor ?? 'BLACK')
          }
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              headingColor: value,
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-line-spacing-select"
          label="Body line spacing"
          fullWidth
          options={LINE_SPACING_OPTIONS}
          value={String(effectiveStyle.lineSpacing ?? 1.5)}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              lineSpacing: Number(value),
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-paragraph-spacing-select"
          label="Paragraph spacing"
          fullWidth
          options={PARAGRAPH_SPACING_OPTIONS}
          value={String(effectiveStyle.paragraphSpacingAfter ?? 0)}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              paragraphSpacingAfter: Number(value),
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-affiliation-alignment-select"
          label="Affiliation alignment"
          fullWidth
          options={AFFILIATION_ALIGNMENT_OPTIONS}
          value={effectiveStyle.affiliationAlignment ?? 'LEFT'}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              affiliationAlignment: value,
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-affiliation-spacing-select"
          label="Affiliation line spacing"
          fullWidth
          options={LINE_SPACING_OPTIONS}
          value={String(effectiveStyle.affiliationLineSpacing ?? 1)}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              affiliationLineSpacing: Number(value),
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-affiliation-number-style-select"
          label="Affiliation numbering"
          fullWidth
          options={AFFILIATION_NUMBER_STYLE_OPTIONS}
          value={effectiveStyle.affiliationNumberStyle ?? 'SUPERSCRIPT'}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              affiliationNumberStyle: value,
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-affiliation-gap-select"
          label="Affiliation gap"
          fullWidth
          options={AFFILIATION_GAP_OPTIONS}
          value={String(effectiveStyle.affiliationSpacingAfter ?? 0)}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              affiliationSpacingAfter: Number(value),
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-table-style-select"
          label="Table style"
          fullWidth
          options={TABLE_STYLE_OPTIONS}
          value={effectiveStyle.tableStyle ?? 'ACADEMIC'}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              tableStyle: value,
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-table-font-size-select"
          label="Table text size"
          fullWidth
          options={TABLE_FONT_SIZE_OPTIONS}
          value={String(
            effectiveStyle.tableFontSize ?? effectiveStyle.bodyFontSize ?? 12,
          )}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              tableFontSize: Number(value),
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-table-spacing-select"
          label="Table line spacing"
          fullWidth
          options={LINE_SPACING_OPTIONS}
          value={String(effectiveStyle.tableLineSpacing ?? 1)}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              tableLineSpacing: Number(value),
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-figure-caption-position-select"
          label="Figure caption position"
          fullWidth
          options={CAPTION_POSITION_OPTIONS}
          value={effectiveStyle.figureCaptionPosition ?? 'BELOW'}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              figureCaptionPosition: value,
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-figure-page-layout-select"
          label="Figure pagination"
          fullWidth
          options={FIGURE_PAGE_LAYOUT_OPTIONS}
          value={effectiveStyle.figurePageLayout ?? 'INLINE'}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              figurePageLayout: value,
            }))
          }
        />
        <Select
          dropdownId="manuscript-export-table-caption-position-select"
          label="Table caption position"
          fullWidth
          options={TABLE_CAPTION_POSITION_OPTIONS}
          value={effectiveStyle.tableCaptionPosition ?? 'ABOVE'}
          onChange={(value) =>
            setStyleOverrides((current) => ({
              ...current,
              tableCaptionPosition: value,
            }))
          }
        />
      </StyledControlGrid>

      <StyledProfileSummary>
        <strong>Export styling:</strong> {frontMatterLabel} ·{' '}
        {effectiveStyle.fontFamily ?? 'Times New Roman'}{' '}
        {effectiveStyle.bodyFontSize ?? 12} pt · {spacingLabel} ·{' '}
        {effectiveStyle.bodyAlignment === 'JUSTIFIED'
          ? 'justified text'
          : 'left-aligned text'}
        {effectiveStyle.abstractLineSpacing !== undefined &&
        effectiveStyle.abstractLineSpacing !== null &&
        effectiveStyle.abstractLineSpacing !== effectiveStyle.lineSpacing
          ? ` · ${effectiveStyle.abstractLineSpacing}× abstract spacing`
          : ''}
        {` · ${['ADDIS_BLUE', '0F4761'].includes(effectiveStyle.headingColor ?? '') ? 'Addis-blue' : 'black'} headings`}
        {` · ${(effectiveStyle.affiliationAlignment ?? 'LEFT').toLowerCase()}-aligned affiliations`}
        {` · ${(effectiveStyle.affiliationNumberStyle ?? 'SUPERSCRIPT').toLowerCase()} affiliation numbers`}
        {` · ${effectiveStyle.affiliationLineSpacing ?? 1}× affiliation spacing`}
        {` · ${effectiveStyle.affiliationSpacingAfter ?? 0} pt affiliation gap`}
        {` · ${(effectiveStyle.tableStyle ?? 'ACADEMIC').toLowerCase()} tables`}
        {` · ${effectiveStyle.tableLineSpacing ?? 1}× table spacing`}
        {` · figure captions ${(effectiveStyle.figureCaptionPosition ?? 'BELOW').toLowerCase()}`}
        {effectiveStyle.figurePageLayout === 'ONE_PER_PAGE'
          ? ' · every figure on a separate page'
          : effectiveStyle.figurePageLayout === 'SUPPLEMENT_ONE_PER_PAGE'
            ? ' · main figures inline; supplementary figures one per page'
            : ' · all figures flow with sections'}
        {' · native Word equations'}
        {effectiveStyle.lineNumbering === true ? ' · line numbers' : ''}
        {effectiveStyle.pageNumbering === true ? ' · page numbers' : ''}
        {effectiveStyle.sectionNumbering === true ? ' · numbered sections' : ''}
      </StyledProfileSummary>

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

      <StyledPackage>
        <StyledPackageHeader>
          <div>
            <StyledPackageTitle>
              {readiness.ready
                ? 'Ready to package'
                : 'Submission package needs attention'}
            </StyledPackageTitle>
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
            onClick={runPackageExport}
          />
        </StyledPackageHeader>
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
