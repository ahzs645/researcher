import { styled } from '@linaria/react';
import { type ChangeEvent, useState } from 'react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptCitationStylePicker } from '@/local-db/research/components/composer/ManuscriptCitationStylePicker';
import {
  StyledExportCard,
  StyledExportCardDescription,
  StyledExportCardHeader,
  StyledExportCardTitle,
} from '@/local-db/research/components/composer/export/ManuscriptExportCard';
import {
  buildJournalProfile,
  journalProfileFilename,
  journalProfileRecordInput,
  parseJournalProfile,
  serializeJournalProfile,
} from '@/local-db/research/manuscript/manuscriptJournalProfile';
import { downloadExportFile } from '@/local-db/research/manuscript/manuscriptExport';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';

type JournalOption = { id: string; name: string };

type ManuscriptJournalFormatCardProps = {
  citationStyleKey: string;
  // The style as it currently resolves, overrides included — which is what a
  // colleague actually wants when they ask how a paper is formatted.
  effectiveStyle: JournalStyle;
  hasStyleOverrides: boolean;
  isSavingSettings: boolean;
  journals: JournalOption[];
  selectedJournalId: string | null;
  onCitationStyleChange: (citationStyleKey: string) => void;
  onResetStyleOverrides: () => void;
  onSelectJournal: (journalId: string) => void | Promise<void>;
};

const StyledFields = styled.div`
  align-items: end;
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledCustomization = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledProfileExchange = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledProfileActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledImportLabel = styled.label`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  min-height: 24px;
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledCustomizationLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptJournalFormatCard = ({
  citationStyleKey,
  effectiveStyle,
  hasStyleOverrides,
  isSavingSettings,
  journals,
  selectedJournalId,
  onCitationStyleChange,
  onResetStyleOverrides,
  onSelectJournal,
}: ManuscriptJournalFormatCardProps) => {
  const { enqueueDialog } = useDialogManager();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { createOneRecord: createJournalTemplate } = useCreateOneRecord({
    objectNameSingular: 'journalTemplate',
  });
  const [isImporting, setIsImporting] = useState(false);
  const journalOptions: SelectOption<string>[] = journals.map((journal) => ({
    value: journal.id,
    label: journal.name,
  }));
  const selectedJournal =
    journals.find((journal) => journal.id === selectedJournalId) ?? journals[0];
  const journalName = selectedJournal?.name ?? 'journal';

  const exportProfile = () => {
    const profile = buildJournalProfile({
      ...effectiveStyle,
      name: selectedJournal?.name ?? journalName,
    });
    downloadExportFile({
      filename: journalProfileFilename(profile.name),
      mimeType: 'application/json',
      content: serializeJournalProfile(profile, new Date().toISOString()),
    });
  };

  const importProfile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setIsImporting(true);
    try {
      const profile = parseJournalProfile(await file.text());
      const created = await createJournalTemplate(
        journalProfileRecordInput(profile),
      );
      if (created?.id === undefined) {
        throw new Error('The profile could not be saved');
      }
      await onSelectJournal(created.id);
      enqueueSuccessSnackBar({ message: `Added ${profile.name}` });
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error ? error.message : 'Could not read that file',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <StyledExportCard>
      <StyledExportCardHeader>
        <StyledExportCardTitle>Journal format</StyledExportCardTitle>
        <StyledExportCardDescription>
          Choose the journal profile and citation convention used by every
          export.
        </StyledExportCardDescription>
      </StyledExportCardHeader>
      <StyledFields>
        <Select
          dropdownId="manuscript-export-journal-select"
          label="Journal format"
          fullWidth
          options={journalOptions}
          value={selectedJournalId ?? journalOptions[0]?.value}
          onChange={(journalId) =>
            void Promise.resolve(onSelectJournal(journalId)).catch(() =>
              enqueueErrorSnackBar({
                message: 'Could not switch the journal format',
              }),
            )
          }
        />
        <ManuscriptCitationStylePicker
          disabled={isSavingSettings}
          value={citationStyleKey}
          onChange={onCitationStyleChange}
        />
      </StyledFields>
      <StyledProfileExchange>
        <StyledCustomizationLabel>
          A profile is one file: send it to a collaborator, or add one they
          sent you.
        </StyledCustomizationLabel>
        <StyledProfileActions>
          <Button
            title="Export profile"
            variant="secondary"
            size="small"
            disabled={isSavingSettings || isImporting}
            onClick={exportProfile}
          />
          <StyledImportLabel>
            {isImporting ? 'Adding…' : 'Import profile…'}
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={isImporting}
              onChange={(event) => void importProfile(event)}
            />
          </StyledImportLabel>
        </StyledProfileActions>
      </StyledProfileExchange>
      {hasStyleOverrides ? (
        <StyledCustomization>
          <StyledCustomizationLabel>
            Customized from {journalName} profile
          </StyledCustomizationLabel>
          <Button
            title="Reset to profile defaults"
            variant="secondary"
            size="small"
            disabled={isSavingSettings}
            onClick={() =>
              enqueueDialog({
                title: 'Reset export style',
                message: `Reset all custom export settings to the ${journalName} profile defaults?`,
                buttons: [
                  { title: 'Cancel' },
                  {
                    title: 'Reset',
                    accent: 'danger',
                    role: 'confirm',
                    onClick: onResetStyleOverrides,
                  },
                ],
              })
            }
          />
        </StyledCustomization>
      ) : null}
    </StyledExportCard>
  );
};
