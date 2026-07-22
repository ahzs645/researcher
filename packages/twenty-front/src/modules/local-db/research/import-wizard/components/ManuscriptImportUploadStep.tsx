import { styled } from '@linaria/react';
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  deriveImportBlocksFromMarkdown,
  type ImportedSourceInfo,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';
import {
  ACCEPTED_MANUSCRIPT_IMPORT_EXTENSIONS,
  readImportedDocumentSource,
  type ImportedDocumentSource,
} from '@/local-db/research/manuscript/manuscriptDocxFile';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';

type BlocksDocumentSource = Extract<ImportedDocumentSource, { kind: 'blocks' }>;

type ManuscriptImportUploadStepProps = {
  onBlocksLoaded: (source: BlocksDocumentSource, reconcile: boolean) => void;
  onPortableLoaded: (
    document: ImportedDocument,
    sourceName: string,
    reconcile: boolean,
  ) => void;
  registerEnterHandler: (handler: (() => void) | null) => void;
};

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
`;

const StyledIntro = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
`;

const StyledDropZone = styled.button<{ isDragging: boolean }>`
  align-items: center;
  background: ${({ isDragging }) =>
    isDragging
      ? themeCssVariables.accent.quaternary
      : themeCssVariables.background.secondary};
  border: 1px ${({ isDragging }) => (isDragging ? 'solid' : 'dashed')}
    ${({ isDragging }) =>
      isDragging
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  min-height: 180px;
  padding: ${themeCssVariables.spacing[5]};
  width: 100%;

  &:disabled {
    cursor: wait;
  }
`;

const StyledDropTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledChooseFile = styled.span`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledDivider = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[3]};

  &::before,
  &::after {
    background: ${themeCssVariables.border.color.medium};
    content: '';
    flex: 1;
    height: 1px;
  }
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.sm};
  min-height: 150px;
  padding: ${themeCssVariables.spacing[3]};
  resize: vertical;
`;

const StyledCheckboxLabel = styled.label`
  align-items: flex-start;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledFooter = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const StyledError = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: ${themeCssVariables.font.size.xs};
`;

const sourceInfoForPaste = (): ImportedSourceInfo => ({});

export const ManuscriptImportUploadStep = ({
  onBlocksLoaded,
  onPortableLoaded,
  registerEnterHandler,
}: ManuscriptImportUploadStepProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState('');
  const [reconcile, setReconcile] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePaste = useCallback(() => {
    const normalizedText = pasteText.trim();
    if (normalizedText.length === 0 || isBusy) return;
    const blocks = deriveImportBlocksFromMarkdown(normalizedText);
    if (blocks.length === 0) {
      setError('No importable content was found in the pasted text.');
      return;
    }
    onBlocksLoaded(
      {
        kind: 'blocks',
        blocks,
        sourceInfo: sourceInfoForPaste(),
        sourceName: 'Pasted text',
      },
      reconcile,
    );
  }, [isBusy, onBlocksLoaded, pasteText, reconcile]);

  useEffect(() => {
    registerEnterHandler(handlePaste);
    return () => registerEnterHandler(null);
  }, [handlePaste, registerEnterHandler]);

  const readFile = async (file: File) => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const source = await readImportedDocumentSource(file);
      if (source.kind === 'portable') {
        onPortableLoaded(source.document, file.name, reconcile);
      } else {
        onBlocksLoaded(source, reconcile);
      }
    } catch {
      setError(
        'Could not read that file. Choose a valid DOCX, PDF, Markdown, text, or portable ZIP file.',
      );
    } finally {
      setIsBusy(false);
      if (isDefined(fileInputRef.current)) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (isDefined(file)) void readFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (isDefined(file)) void readFile(file);
  };

  return (
    <StyledContainer>
      <StyledIntro>
        Choose a manuscript file or paste Markdown. Documents are analyzed in
        your browser and nothing is saved until the final confirmation.
      </StyledIntro>
      <StyledDropZone
        type="button"
        isDragging={isDragging}
        disabled={isBusy}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <StyledDropTitle>
          {isBusy ? 'Reading document…' : 'Drop a manuscript here'}
        </StyledDropTitle>
        <StyledHint>
          DOCX, PDF, Markdown, text, or portable research ZIP
        </StyledHint>
        <StyledChooseFile>Choose file…</StyledChooseFile>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MANUSCRIPT_IMPORT_EXTENSIONS}
          hidden
          onChange={handleFileChange}
        />
      </StyledDropZone>
      <StyledDivider>or paste text</StyledDivider>
      <StyledTextarea
        aria-label="Manuscript Markdown or text"
        placeholder={
          '## Abstract\nWe measured…\n\n## Methods\nDescribe the method…'
        }
        value={pasteText}
        onChange={(event) => setPasteText(event.target.value)}
      />
      <StyledCheckboxLabel>
        <input
          type="checkbox"
          checked={reconcile}
          onChange={(event) => setReconcile(event.target.checked)}
        />
        Reconcile citations and tables after mapping: parse references, link
        in-text citations, and lift tables into manuscript assets.
      </StyledCheckboxLabel>
      {error !== null ? <StyledError>{error}</StyledError> : null}
      <StyledFooter>
        <Button
          title="Map pasted text"
          variant="primary"
          accent="blue"
          size="small"
          disabled={isBusy || pasteText.trim().length === 0}
          onClick={handlePaste}
        />
      </StyledFooter>
    </StyledContainer>
  );
};
