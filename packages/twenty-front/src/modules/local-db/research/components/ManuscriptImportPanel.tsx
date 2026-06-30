import { styled } from '@linaria/react';
import { type ChangeEvent, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  parseMarkdownDocument,
  type ImportedDocument,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  ACCEPTED_IMPORT_EXTENSIONS,
  readImportedDocumentFile,
} from '@/local-db/research/manuscript/manuscriptDocxFile';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// Bring an existing paper *in* instead of retyping it: drop a .docx / .md / .txt
// (or paste text) and the document is split into classified manuscript sections.
// The parsing is the pure, tested `manuscriptDocImport`; this panel only handles
// I/O and record creation, appending after any sections already present.

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
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pasteText, setPasteText] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const importDocument = async (document: ImportedDocument) => {
    if (document.sections.length === 0) {
      enqueueErrorSnackBar({
        message: 'No sections found — add headings (e.g. ## Methods) and retry',
      });
      return;
    }
    for (const section of document.sections) {
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
    enqueueSuccessSnackBar({
      message: `Imported ${document.sections.length} section(s)`,
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
        Import an existing paper as sections — Word (.docx), Markdown or plain
        text. Headings become sections (Abstract, Methods, …); tables stay inline.
      </StyledHint>
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
