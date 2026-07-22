import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptSubmissionRequirementRow } from '@/local-db/research/components/composer/ManuscriptSubmissionRequirementRow';
import { ManuscriptSubmissionRequirementPicker } from '@/local-db/research/components/composer/ManuscriptSubmissionRequirementPicker';
import {
  collectSubmissionConflicts,
  parseJournalSubmissionRequirements,
  resolveSubmissionRequirementItems,
  serializeJournalSubmissionRequirements,
  type JournalSubmissionRequirement,
  type SubmissionRequirementManuscript,
  type SubmissionRequirementTemplate,
  type SubmissionRequirementValues,
} from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type ManuscriptSubmissionRequirementsPanelProps = {
  manuscript: SubmissionRequirementManuscript;
  template?: SubmissionRequirementTemplate & { name?: string | null };
  isExplicitTarget: boolean;
  onConfirmTargetJournal: () => void;
  onPickTargetJournal: () => void;
  onSaveValues: (values: SubmissionRequirementValues) => Promise<void>;
  onSaveRequirements: (
    requirements: JournalSubmissionRequirement[],
  ) => Promise<void>;
  onKeepJournalValue: (key: string, value: string) => Promise<void>;
};

const StyledPanel = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledHeader = styled.div`
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  margin: 0;
`;

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledEmpty = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledWarning = styled.div`
  color: ${themeCssVariables.color.orange};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptSubmissionRequirementsPanel = ({
  manuscript,
  template,
  isExplicitTarget,
  onConfirmTargetJournal,
  onPickTargetJournal,
  onSaveValues,
  onSaveRequirements,
  onKeepJournalValue,
}: ManuscriptSubmissionRequirementsPanelProps) => {
  const { enqueueDialog } = useDialogManager();
  const { enqueueErrorSnackBar } = useSnackBar();
  const [requirements, setRequirements] = useState(() =>
    parseJournalSubmissionRequirements(template?.submissionRequirements),
  );
  const initialItems = useMemo(
    () =>
      template === undefined
        ? []
        : resolveSubmissionRequirementItems(template, manuscript),
    [manuscript, template],
  );
  const [values, setValues] = useState<SubmissionRequirementValues>(() =>
    Object.fromEntries(
      initialItems.map((item) => [item.definition.key, item.value]),
    ),
  );
  const persistValues = useDebouncedCallback(
    (nextValues: SubmissionRequirementValues) => {
      void onSaveValues(nextValues).catch(() =>
        enqueueErrorSnackBar({
          message: 'Could not save submission requirement',
        }),
      );
    },
    800,
  );

  if (template === undefined) {
    return (
      <StyledPanel>
        <StyledTitle>Journal submission checklist</StyledTitle>
        <StyledEmpty>
          Pick a target journal to see and complete its submission checklist.
          <div>
            <Button
              title="Pick target journal"
              variant="secondary"
              size="small"
              onClick={onPickTargetJournal}
            />
          </div>
        </StyledEmpty>
      </StyledPanel>
    );
  }

  const resolvedItems = resolveSubmissionRequirementItems(
    {
      ...template,
      submissionRequirements:
        serializeJournalSubmissionRequirements(requirements),
    },
    manuscript,
  ).map((item) => {
    const value = values[item.definition.key] ?? item.value;
    return { ...item, value, filled: value.trim().length > 0 };
  });
  const effectiveValues = Object.fromEntries(
    resolvedItems.map((item) => [item.definition.key, item.value]),
  );
  const conflicts = collectSubmissionConflicts({
    manuscript,
    values: effectiveValues,
  });
  const usedKeys = new Set(requirements.map((requirement) => requirement.key));
  const filledCount = resolvedItems.filter((item) => item.filled).length;

  const updateValue = (key: string, value: string, immediate = false) => {
    const nextValues = { ...values, [key]: value };
    setValues(nextValues);
    if (immediate) {
      persistValues.cancel();
      void onSaveValues(nextValues).catch(() =>
        enqueueErrorSnackBar({
          message: 'Could not resolve submission conflict',
        }),
      );
    } else {
      persistValues(nextValues);
    }
  };
  const saveRequirements = async (next: JournalSubmissionRequirement[]) => {
    const previous = requirements;
    setRequirements(next);
    try {
      await onSaveRequirements(next);
    } catch {
      setRequirements(previous);
      enqueueErrorSnackBar({ message: 'Could not update journal checklist' });
    }
  };
  return (
    <StyledPanel>
      <StyledHeader>
        <StyledTitle>
          {template.name ?? 'Journal'} submission checklist
        </StyledTitle>
        <StyledMeta>
          {filledCount} of {resolvedItems.length} complete
        </StyledMeta>
      </StyledHeader>
      {!isExplicitTarget ? (
        <StyledEmpty>
          Showing the {template.name ?? 'default'} checklist — this journal is
          not yet set as the manuscript&apos;s target.
          <div>
            <Button
              title={`Set ${template.name ?? 'journal'} as target`}
              variant="secondary"
              size="small"
              onClick={onConfirmTargetJournal}
            />
          </div>
        </StyledEmpty>
      ) : null}
      {conflicts.length > 0 ? (
        <StyledWarning>
          {conflicts.length} checklist conflict
          {conflicts.length === 1 ? '' : 's'} need review.
        </StyledWarning>
      ) : null}
      {resolvedItems.map((item) => {
        const conflict = conflicts.find(
          ({ key }) => key === item.definition.key,
        );
        return (
          <ManuscriptSubmissionRequirementRow
            key={item.definition.key}
            item={item}
            conflict={conflict}
            onChange={(value) => updateValue(item.definition.key, value)}
            onRemove={() =>
              enqueueDialog({
                title: 'Remove requirement',
                message: `Remove ${item.definition.label} from the ${template.name ?? 'journal'} checklist?`,
                buttons: [
                  { title: 'Cancel' },
                  {
                    title: 'Remove',
                    accent: 'danger',
                    role: 'confirm',
                    onClick: () =>
                      void saveRequirements(
                        requirements.filter(
                          ({ key }) => key !== item.definition.key,
                        ),
                      ),
                  },
                ],
              })
            }
            onUseManuscriptValue={() =>
              conflict !== undefined &&
              updateValue(conflict.key, conflict.manuscriptValue, true)
            }
            onKeepJournalValue={() =>
              conflict === undefined
                ? undefined
                : void onKeepJournalValue(
                    conflict.key,
                    conflict.journalValue,
                  ).catch(() =>
                    enqueueErrorSnackBar({
                      message: 'Could not resolve submission conflict',
                    }),
                  )
            }
          />
        );
      })}
      <ManuscriptSubmissionRequirementPicker
        journalName={template.name ?? 'journal'}
        usedKeys={usedKeys}
        onAdd={(requirement) =>
          void saveRequirements([...requirements, requirement])
        }
      />
    </StyledPanel>
  );
};
