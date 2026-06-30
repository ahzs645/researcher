import { styled } from '@linaria/react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { H1Title, H2Title } from 'twenty-ui/display';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  parseMarkdownDocument,
  type ImportedDocument,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  ACCEPTED_IMPORT_EXTENSIONS,
  readImportedDocumentFile,
} from '@/local-db/research/manuscript/manuscriptDocxFile';
import {
  applicationSectionDraftsFromDocument,
  type ApplicationSectionDraft,
} from '@/local-db/research/researchApplicationImport';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';

// Bring an existing grant proposal (.docx / .md / .txt) into the Funding pipeline
// as `applicationSection` records on a chosen application. Reuses the manuscript
// importer's engine via `researchApplicationImport` — same parsing, grant-shaped
// output.

type ApplicationRecord = { id: string; name?: string | null };

const StyledPage = styled.div`
  box-sizing: border-box;
  display: flex;
  height: 100%;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
  width: 100%;
`;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  max-width: 880px;
  width: 100%;
`;

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
  min-height: 120px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

export const ApplicationImportPage = () => {
  const { records } = useFindManyRecords({
    objectNameSingular: 'grantApplication',
    recordGqlFields: { id: true, name: true },
  });
  const applications = records as unknown as ApplicationRecord[];

  const { createOneRecord: createSection } = useCreateOneRecord({
    objectNameSingular: 'applicationSection',
  });
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isDefined(applicationId) && applications.length > 0) {
      setApplicationId(applications[0].id);
    }
  }, [applications, applicationId]);

  const createDrafts = async (drafts: ApplicationSectionDraft[]) => {
    if (!isDefined(applicationId)) {
      enqueueErrorSnackBar({ message: 'Pick a grant application first' });
      return;
    }
    if (drafts.length === 0) {
      enqueueErrorSnackBar({
        message: 'No sections found — add headings and retry',
      });
      return;
    }
    for (const draft of drafts) {
      await createSection({
        name: draft.name,
        applicationId,
        sectionType: draft.sectionType,
        content: draft.content,
        wordCount: draft.wordCount,
        status: draft.status,
      });
    }
    enqueueSuccessSnackBar({
      message: `Imported ${drafts.length} section(s) into the application`,
    });
  };

  const importDocument = (document: ImportedDocument) =>
    createDrafts(applicationSectionDraftsFromDocument(document));

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

  const applicationOptions: SelectOption<string>[] = applications.map(
    (application) => ({
      value: application.id,
      label: application.name ?? 'Untitled application',
    }),
  );

  return (
    <StyledPage>
      <StyledContent>
        <H1Title title="Import proposal" />
        {applications.length === 0 ? (
          <StyledHint>
            No grant applications yet — start one from Funding › Discovery, then
            import your proposal here.
          </StyledHint>
        ) : (
          <>
            <StyledPanel>
              <H2Title title="Target application" />
              <Select
                dropdownId="application-import-select"
                options={applicationOptions}
                value={applicationId ?? applications[0].id}
                onChange={setApplicationId}
              />
            </StyledPanel>

            <StyledPanel>
              <H2Title title="Import" />
              <StyledHint>
                Import an existing proposal — Word (.docx), Markdown or plain
                text. Headings become application sections (Lay summary,
                Objectives, Budget justification, …).
              </StyledHint>
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
              <StyledTextarea
                placeholder={'…or paste proposal text here:\n\n## Lay summary\n…\n\n## Objectives\n…'}
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
          </>
        )}
      </StyledContent>
    </StyledPage>
  );
};
