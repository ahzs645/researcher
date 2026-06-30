import { styled } from '@linaria/react';
import { type ChangeEvent, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  extractTablesToFigures,
  parseMarkdownDocument,
  type ImportedDocument,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  ACCEPTED_IMPORT_EXTENSIONS,
  readImportedDocumentFile,
} from '@/local-db/research/manuscript/manuscriptDocxFile';
import { reconcileImportedCitations } from '@/local-db/research/manuscript/manuscriptCitationReconcile';
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
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCheckboxLabel = styled.label`
  align-items: flex-start;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const UNTITLED = /^untitled/i;

export const ManuscriptImportPanel = ({
  manuscriptId,
  manuscriptName,
  existingSectionCount,
  onChanged,
}: ManuscriptImportPanelProps) => {
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

  const importDocument = async (document: ImportedDocument) => {
    if (document.sections.length === 0) {
      enqueueErrorSnackBar({
        message: 'No sections found — add headings (e.g. ## Methods) and retry',
      });
      return;
    }

    let sections = document.sections;
    let referenceCount = 0;
    let figureCount = 0;
    let linkedCount = 0;

    // Reconcile: References → records, in-text markers → [@key], tables → figures.
    if (reconcile) {
      const reconciled = reconcileImportedCitations(sections);
      linkedCount = reconciled.linkedCount;
      const { added } = dedupeReferenceDrafts([], reconciled.references);
      for (const reference of added) {
        await createReference({ ...reference, manuscriptId });
      }
      referenceCount = added.length;

      const lifted = extractTablesToFigures(reconciled.sections);
      sections = lifted.sections;
      for (const figure of lifted.figures) {
        await createFigure({ ...figure, manuscriptId });
      }
      figureCount = lifted.figures.length;
    }

    for (const section of sections) {
      await createSection({
        name: section.name,
        manuscriptId,
        sectionType: section.sectionType,
        placement: section.placement,
        content: section.content,
        orderIndex: existingSectionCount + section.orderIndex,
        wordCount: section.wordCount,
        includeInExport: section.includeInExport,
        status: 'DRAFTING',
      });
    }
    // Adopt the document title only when the manuscript is still untitled.
    if (
      isDefined(document.title) &&
      (!isDefined(manuscriptName) || UNTITLED.test(manuscriptName ?? ''))
    ) {
      await updateOneRecord({
        objectNameSingular: 'manuscript',
        idToUpdate: manuscriptId,
        updateOneRecordInput: { name: document.title },
      });
    }
    const extras = reconcile
      ? ` · ${referenceCount} reference(s), ${linkedCount} citation(s) linked, ${figureCount} table(s)`
      : '';
    enqueueSuccessSnackBar({
      message: `Imported ${sections.length} section(s)${extras}`,
    });
    onChanged();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isDefined(file) || isBusy) return;
    setIsBusy(true);
    try {
      await importDocument(await readImportedDocumentFile(file));
    } catch {
      enqueueErrorSnackBar({
        message: 'Could not read that file — is it a valid .docx / .md / .txt?',
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
      await importDocument(parseMarkdownDocument(pasteText));
      setPasteText('');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <StyledPanel>
      <StyledHint>
        Import an existing paper as sections — Word (.docx), PDF (text-based,
        best-effort), Markdown or plain text. Headings become sections (Abstract,
        Methods, …).
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
          title={isBusy ? 'Importing…' : 'Import file…'}
          variant="secondary"
          size="small"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMPORT_EXTENSIONS}
          hidden
          onChange={handleFile}
        />
      </StyledActions>
      <StyledTextarea
        placeholder={'…or paste Markdown / text here:\n\n## Abstract\nWe measured…\n\n## Methods\n…'}
        value={pasteText}
        onChange={(event) => setPasteText(event.target.value)}
      />
      <Button
        title={isBusy ? 'Importing…' : 'Import pasted text'}
        variant="secondary"
        size="small"
        disabled={isBusy || pasteText.trim().length === 0}
        onClick={handlePaste}
      />
    </StyledPanel>
  );
};
