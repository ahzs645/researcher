import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  ManuscriptScreeningFindingRow,
  ManuscriptSubmissionRequirementRow,
} from '@/local-db/research/components/composer/ManuscriptSubmissionRequirementRow';
import { ManuscriptSubmissionRequirementPicker } from '@/local-db/research/components/composer/ManuscriptSubmissionRequirementPicker';
import {
  screenManuscript,
  summarizeScreeningFindings,
} from '@/local-db/research/manuscript/manuscriptScreening';
import {
  collectSubmissionConflicts,
  collectSubmissionNotices,
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
  onConfirmTargetJournal: () => Promise<void>;
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

const StyledScreening = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[3]};
`;

const StyledScreeningNote = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
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
  // Screening reads the manuscript itself, so it does not depend on a target
  // journal and is rendered whether or not one is picked.
  const screeningFindings = useMemo(
    () => screenManuscript(manuscript),
    [manuscript],
  );
  const screeningSummary = summarizeScreeningFindings(screeningFindings);
  const screeningPanel = (
    <StyledScreening aria-label="Automated screening">
      <StyledHeader>
        <StyledTitle>Automated screening</StyledTitle>
        <StyledMeta>
          {screeningSummary.present} found · {screeningSummary.weak} weak ·{' '}
          {screeningSummary.absent} not found
        </StyledMeta>
      </StyledHeader>
      <StyledScreeningNote>
        What the BIH Charité screening tools look for in a finished paper, run
        over the manuscript text. These are screening findings, not journal
        requirements, and none of them blocks an export — a journal that does
        not ask for a data statement is not a reason to submit without one.
      </StyledScreeningNote>
      {screeningFindings.map((finding) => (
        <ManuscriptScreeningFindingRow key={finding.key} finding={finding} />
      ))}
    </StyledScreening>
  );
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
  const [pendingValues, setPendingValues] =
    useState<SubmissionRequirementValues>({});
  // Re-sync when the resolved items change underneath us (journal switch, an
  // import, a "keep journal value" write) — except keys with a debounced save
  // still in flight, which would otherwise lose their just-typed text.
  const itemsSignature = JSON.stringify(
    initialItems.map((item) => [item.definition.key, item.value]),
  );
  const [lastItemsSignature, setLastItemsSignature] = useState(itemsSignature);
  useEffect(() => {
    if (itemsSignature === lastItemsSignature) return;
    setLastItemsSignature(itemsSignature);
    setValues((current) => {
      const next = Object.fromEntries(
        initialItems.map((item) => [item.definition.key, item.value]),
      );
      for (const key of Object.keys(pendingValues)) {
        if (current[key] !== undefined) next[key] = current[key];
      }
      return next;
    });
  }, [initialItems, itemsSignature, lastItemsSignature, pendingValues]);

  useEffect(() => {
    setRequirements(
      parseJournalSubmissionRequirements(template?.submissionRequirements),
    );
  }, [template?.submissionRequirements]);

  const persistValues = useDebouncedCallback(
    (changedValues: SubmissionRequirementValues) => {
      setPendingValues({});
      void onSaveValues(changedValues).catch(() =>
        enqueueErrorSnackBar({
          message: 'Could not save submission requirement',
        }),
      );
    },
    800,
  );

  useEffect(
    () => () => {
      persistValues.flush();
    },
    [persistValues],
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
        {screeningPanel}
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
  const notices = collectSubmissionNotices({ manuscript });
  const usedKeys = new Set(requirements.map((requirement) => requirement.key));
  const filledCount = resolvedItems.filter((item) => item.filled).length;

  const updateValue = (key: string, value: string, immediate = false) => {
    const nextValues = { ...values, [key]: value };
    const changedValues = { ...pendingValues, [key]: value };
    setValues(nextValues);
    if (immediate) {
      persistValues.cancel();
      setPendingValues({});
      void onSaveValues(changedValues).catch(() =>
        enqueueErrorSnackBar({
          message: 'Could not resolve submission conflict',
        }),
      );
    } else {
      setPendingValues(changedValues);
      persistValues(changedValues);
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
              onClick={() =>
                void onConfirmTargetJournal().catch(() =>
                  enqueueErrorSnackBar({
                    message: 'Could not set the target journal',
                  }),
                )
              }
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
      {notices.map((notice) => (
        <StyledWarning key={notice.key}>{notice.message}</StyledWarning>
      ))}
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
      {screeningPanel}
    </StyledPanel>
  );
};
