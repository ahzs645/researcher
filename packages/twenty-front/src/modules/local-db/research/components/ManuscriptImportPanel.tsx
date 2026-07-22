import { styled } from '@linaria/react';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportWizardRoot } from '@/local-db/research/import-wizard/components/ManuscriptImportWizardRoot';
import { useOpenManuscriptImportWizard } from '@/local-db/research/import-wizard/hooks/useOpenManuscriptImportWizard';
import {
  parseMarkdownDocument,
  type ImportedDocument,
  type ImportedSectionDraft,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  ACCEPTED_MANUSCRIPT_IMPORT_EXTENSIONS,
  readImportedDocumentFile,
} from '@/local-db/research/manuscript/manuscriptDocxFile';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';
import { portableManuscriptRecordUpdate } from '@/local-db/research/manuscript/manuscriptPortableImport';
import { dedupeReferenceDrafts } from '@/local-db/research/manuscript/manuscriptReferenceStore';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// Bring an existing paper *in* instead of retyping it: drop a .docx / .pdf / .md
// / .txt (or paste text) and the document is split into classified manuscript
// sections. With "reconcile" on, the References section is parsed into reference
// records and in-text [1] / (Author, Year) markers are rewritten to live [@key]
// citations, and standalone tables become numbered figures. The parsing is the
// pure, tested layer; this panel only does I/O and record creation.

type ManuscriptImportPanelProps = {
  manuscriptId: string;
  manuscriptName?: string | null;
  existingSectionCount: number;
  onChanged: () => void;
  exportTableStyle?: ManuscriptTableStyle;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  min-height: 96px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledPreview = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledPreviewHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledPreviewTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledSectionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  max-height: 440px;
  overflow-y: auto;
`;

const StyledSectionRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns:
    minmax(160px, 1fr) minmax(130px, 0.7fr) minmax(120px, 0.6fr)
    auto;
  padding: ${themeCssVariables.spacing[2]};

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledInclude = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSectionPreview = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  grid-column: 1 / -1;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledWarning = styled.div`
  color: ${themeCssVariables.color.orange};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledCheckboxLabel = styled.label`
  align-items: flex-start;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const UNTITLED = /^untitled/i;

const SECTION_TYPES = [
  'TITLE_PAGE',
  'ABSTRACT',
  'KEYWORDS',
  'INTRODUCTION',
  'BACKGROUND',
  'METHODS',
  'RESULTS',
  'DISCUSSION',
  'CONCLUSION',
  'ACKNOWLEDGMENTS',
  'AUTHOR_CONTRIBUTIONS',
  'FUNDING',
  'CONFLICTS',
  'DATA_AVAILABILITY',
  'ETHICS',
  'REFERENCES',
  'APPENDIX',
  'SUPPLEMENT',
  'OTHER',
] as const;

const SECTION_PLACEMENTS = [
  'FRONT_MATTER',
  'MAIN',
  'BACK_MATTER',
  'SUPPLEMENT',
] as const;

const optionLabel = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

export const ManuscriptImportPanel = ({
  manuscriptId,
  manuscriptName,
  existingSectionCount,
  onChanged,
  exportTableStyle,
}: ManuscriptImportPanelProps) => {
  const { openManuscriptImportWizard } = useOpenManuscriptImportWizard();
  const { createOneRecord: createSection } = useCreateOneRecord({
    objectNameSingular: 'manuscriptSection',
  });
  const { createOneRecord: createReference } = useCreateOneRecord({
    objectNameSingular: 'reference',
  });
  const { createOneRecord: createFigure } = useCreateOneRecord({
    objectNameSingular: 'figure',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pasteText, setPasteText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [reconcile, setReconcile] = useState(true);
  const [pendingDocument, setPendingDocument] =
    useState<ImportedDocument | null>(null);
  const [pendingSourceName, setPendingSourceName] = useState<string | null>(
    null,
  );

  const preparedImport = useMemo(() => {
    if (pendingDocument === null) return null;
    return prepareManuscriptImport(pendingDocument, reconcile);
  }, [pendingDocument, reconcile]);

  const importDocument = async () => {
    if (pendingDocument === null || preparedImport === null) return;
    if (preparedImport.sections.length === 0) {
      enqueueErrorSnackBar({
        message: 'No sections found — add headings (e.g. ## Methods) and retry',
      });
      return;
    }

    const { added } = dedupeReferenceDrafts([], preparedImport.references);
    for (const reference of added) {
      await createReference({ ...reference, manuscriptId });
    }
    const sectionIdsByOrder = new Map<number, string>();
    for (const section of preparedImport.sections) {
      const created = await createSection({
        name: section.name,
        manuscriptId,
        sectionType: section.sectionType,
        placement: section.placement,
        content: section.content,
        orderIndex: existingSectionCount + section.orderIndex,
        wordCount: section.wordCount,
        // Once references have been reconstructed as records, keep the raw
        // imported list for provenance but exclude it from generated output.
        includeInExport:
          section.sectionType === 'REFERENCES' && added.length > 0
            ? false
            : section.includeInExport,
        status: section.status ?? 'DRAFTING',
        ...(section.wordLimit !== undefined
          ? { wordLimit: section.wordLimit }
          : {}),
      });
      const createdId = (created as { id?: string } | undefined)?.id;
      if (isDefined(createdId)) {
        sectionIdsByOrder.set(section.orderIndex, createdId);
      }
    }
    for (const figure of preparedImport.figures) {
      const {
        sectionOrderIndex,
        sourceLabel: _sourceLabel,
        ...record
      } = figure;
      await createFigure({
        ...record,
        manuscriptId,
        ...(sectionOrderIndex !== undefined &&
        sectionIdsByOrder.has(sectionOrderIndex)
          ? { sectionId: sectionIdsByOrder.get(sectionOrderIndex) }
          : {}),
      });
    }
    const manuscriptUpdate: {
      name?: string;
      authorLine?: string;
      affiliations?: string;
      correspondingAuthor?: string;
      manuscriptType?: string;
      status?: string;
      targetVenue?: string;
      doi?: string;
      supplementTitle?: string;
      supplementAuthorLine?: string;
      supplementAffiliations?: string;
      exportStyleOverrides?: string;
      coverLetter?: string;
      highlights?: string;
      competingInterests?: string;
      suggestedReviewers?: string;
    } = {};
    if (
      isDefined(pendingDocument.title) &&
      (!isDefined(manuscriptName) || UNTITLED.test(manuscriptName ?? ''))
    ) {
      manuscriptUpdate.name = pendingDocument.title;
    }
    if (isDefined(pendingDocument.authorLine)) {
      manuscriptUpdate.authorLine = pendingDocument.authorLine;
    }
    if (isDefined(pendingDocument.affiliations)) {
      manuscriptUpdate.affiliations = pendingDocument.affiliations;
    }
    if (isDefined(pendingDocument.correspondingAuthor)) {
      manuscriptUpdate.correspondingAuthor =
        pendingDocument.correspondingAuthor;
    }
    const portable = pendingDocument.portablePackage;
    if (portable !== undefined) {
      Object.assign(manuscriptUpdate, portableManuscriptRecordUpdate(portable));
    }
    if (Object.keys(manuscriptUpdate).length > 0) {
      await updateOneRecord({
        objectNameSingular: 'manuscript',
        idToUpdate: manuscriptId,
        updateOneRecordInput: manuscriptUpdate,
      });
    }
    enqueueSuccessSnackBar({
      message: `${preparedImport.portable ? 'Reconstructed' : 'Imported'} ${preparedImport.sections.length} sections · ${added.length} references · ${preparedImport.linkedCount} citations · ${preparedImport.linkedAssetCount} figure/table links · ${preparedImport.figures.length} figures/tables`,
    });
    setPendingDocument(null);
    setPendingSourceName(null);
    onChanged();
  };

  const stageDocument = (document: ImportedDocument, sourceName: string) => {
    if (document.sections.length === 0) {
      enqueueErrorSnackBar({
        message: 'No sections found — add headings (e.g. ## Methods) and retry',
      });
      return;
    }
    setPendingDocument(document);
    setPendingSourceName(sourceName);
  };

  const updatePendingSection = (
    index: number,
    update: Partial<ImportedSectionDraft>,
  ) => {
    setPendingDocument((current) =>
      current === null
        ? current
        : {
            ...current,
            sections: current.sections.map((section, sectionIndex) =>
              sectionIndex === index ? { ...section, ...update } : section,
            ),
          },
    );
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isDefined(file) || isBusy) return;
    setIsBusy(true);
    try {
      stageDocument(await readImportedDocumentFile(file), file.name);
    } catch {
      enqueueErrorSnackBar({
        message:
          'Could not read that file — is it a valid .docx / .pdf / .md / .txt or portable .zip?',
      });
    } finally {
      setIsBusy(false);
      if (isDefined(fileInputRef.current)) fileInputRef.current.value = '';
    }
  };

  const handlePaste = async () => {
    if (isBusy || pasteText.trim().length === 0) return;
    setIsBusy(true);
    try {
      stageDocument(parseMarkdownDocument(pasteText), 'Pasted text');
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await importDocument();
      setPasteText('');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <StyledPanel>
      <StyledHint>
        Choose a Word/PDF paper or a portable research ZIP, review the detected
        structure, then confirm. Nothing is saved until you approve the preview.
      </StyledHint>
      <StyledCheckboxLabel>
        <input
          type="checkbox"
          checked={reconcile}
          onChange={(event) => setReconcile(event.target.checked)}
        />
        Reconcile citations &amp; tables (parse References into records, link
        [1]/(Author, Year) → [@key], lift tables to figures)
      </StyledCheckboxLabel>
      <StyledActions>
        <Button
          title="Import with wizard…"
          variant="primary"
          accent="blue"
          size="small"
          onClick={() =>
            openManuscriptImportWizard({
              manuscriptId,
              manuscriptName,
              existingSectionCount,
              onChanged,
              exportTableStyle,
            })
          }
        />
        <Button
          title={isBusy ? 'Importing…' : 'Import file…'}
          variant="secondary"
          size="small"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MANUSCRIPT_IMPORT_EXTENSIONS}
          hidden
          onChange={handleFile}
        />
      </StyledActions>
      <StyledTextarea
        placeholder={
          '…or paste Markdown / text here:\n\n## Abstract\nWe measured…\n\n## Methods\n…'
        }
        value={pasteText}
        onChange={(event) => setPasteText(event.target.value)}
      />
      <Button
        title={isBusy ? 'Reading…' : 'Preview pasted text'}
        variant="secondary"
        size="small"
        disabled={isBusy || pasteText.trim().length === 0}
        onClick={handlePaste}
      />

      {pendingDocument !== null && preparedImport !== null ? (
        <StyledPreview>
          <StyledPreviewHeader>
            <StyledPreviewTitle>
              Review import · {pendingSourceName ?? 'Document'}
            </StyledPreviewTitle>
            <StyledHint>
              {preparedImport.sections.length} sections ·{' '}
              {preparedImport.tableCount} tables · {preparedImport.imageCount}{' '}
              figures · {pendingDocument.stats?.equationCount ?? 0} equations ·{' '}
              {preparedImport.references.length} references
            </StyledHint>
            {preparedImport.portable ? (
              <StyledHint>
                Portable package detected — sections, citations, figure/table
                links, contributors, styles, and submission materials will be
                reconstructed.
              </StyledHint>
            ) : null}
            {isDefined(pendingDocument.title) ? (
              <StyledHint>Detected title: {pendingDocument.title}</StyledHint>
            ) : null}
            {isDefined(pendingDocument.authorLine) ? (
              <StyledHint>
                Detected authors: {pendingDocument.authorLine}
              </StyledHint>
            ) : null}
          </StyledPreviewHeader>

          {(pendingDocument.warnings ?? []).map((warning) => (
            <StyledWarning key={warning}>{warning}</StyledWarning>
          ))}

          <StyledSectionList>
            {pendingDocument.sections.map((section, index) => (
              <StyledSectionRow key={`${section.orderIndex}-${index}`}>
                <StyledInput
                  aria-label={`Section ${index + 1} name`}
                  value={section.name}
                  onChange={(event) =>
                    updatePendingSection(index, { name: event.target.value })
                  }
                />
                <StyledSelect
                  aria-label={`Section ${index + 1} type`}
                  value={section.sectionType}
                  onChange={(event) =>
                    updatePendingSection(index, {
                      sectionType: event.target.value,
                    })
                  }
                >
                  {SECTION_TYPES.map((sectionType) => (
                    <option key={sectionType} value={sectionType}>
                      {optionLabel(sectionType)}
                    </option>
                  ))}
                </StyledSelect>
                <StyledSelect
                  aria-label={`Section ${index + 1} placement`}
                  value={section.placement}
                  onChange={(event) =>
                    updatePendingSection(index, {
                      placement: event.target.value,
                    })
                  }
                >
                  {SECTION_PLACEMENTS.map((placement) => (
                    <option key={placement} value={placement}>
                      {optionLabel(placement)}
                    </option>
                  ))}
                </StyledSelect>
                <StyledInclude>
                  <input
                    type="checkbox"
                    checked={section.includeInExport}
                    onChange={(event) =>
                      updatePendingSection(index, {
                        includeInExport: event.target.checked,
                      })
                    }
                  />
                  Export
                </StyledInclude>
                <StyledSectionPreview>
                  {section.wordCount} words ·{' '}
                  {section.content.replace(/\s+/g, ' ').slice(0, 180) ||
                    'Empty section'}
                </StyledSectionPreview>
              </StyledSectionRow>
            ))}
          </StyledSectionList>

          <StyledActions>
            <Button
              title={isBusy ? 'Importing…' : 'Confirm import'}
              variant="primary"
              accent="blue"
              size="small"
              disabled={isBusy}
              onClick={handleConfirmImport}
            />
            <Button
              title="Cancel"
              variant="secondary"
              size="small"
              disabled={isBusy}
              onClick={() => {
                setPendingDocument(null);
                setPendingSourceName(null);
              }}
            />
          </StyledActions>
        </StyledPreview>
      ) : null}
      <ManuscriptImportWizardRoot />
    </StyledPanel>
  );
};
