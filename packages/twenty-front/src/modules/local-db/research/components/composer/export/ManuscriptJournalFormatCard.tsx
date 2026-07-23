import { styled } from '@linaria/react';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptCitationStylePicker } from '@/local-db/research/components/composer/ManuscriptCitationStylePicker';
import {
  StyledExportCard,
  StyledExportCardDescription,
  StyledExportCardHeader,
  StyledExportCardTitle,
} from '@/local-db/research/components/composer/export/ManuscriptExportCard';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { Select } from '@/ui/input/components/Select';

type JournalOption = { id: string; name: string };

type ManuscriptJournalFormatCardProps = {
  citationStyleKey: string;
  hasStyleOverrides: boolean;
  isSavingSettings: boolean;
  journals: JournalOption[];
  selectedJournalId: string | null;
  onCitationStyleChange: (citationStyleKey: string) => void;
  onResetStyleOverrides: () => void;
  onSelectJournal: (journalId: string) => void;
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

const StyledCustomizationLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptJournalFormatCard = ({
  citationStyleKey,
  hasStyleOverrides,
  isSavingSettings,
  journals,
  selectedJournalId,
  onCitationStyleChange,
  onResetStyleOverrides,
  onSelectJournal,
}: ManuscriptJournalFormatCardProps) => {
  const { enqueueDialog } = useDialogManager();
  const journalOptions: SelectOption<string>[] = journals.map((journal) => ({
    value: journal.id,
    label: journal.name,
  }));
  const selectedJournal =
    journals.find((journal) => journal.id === selectedJournalId) ?? journals[0];
  const journalName = selectedJournal?.name ?? 'journal';

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
          onChange={onSelectJournal}
        />
        <ManuscriptCitationStylePicker
          disabled={isSavingSettings}
          value={citationStyleKey}
          onChange={onCitationStyleChange}
        />
      </StyledFields>
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
