import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { H2Title } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptReferencePanel } from '@/local-db/research/components/ManuscriptReferencePanel';
import { ManuscriptCitationLinkPanel } from '@/local-db/research/components/composer/ManuscriptCitationLinkPanel';
import { citationStyleTitle } from '@/local-db/research/components/composer/ManuscriptCitationStylePicker';
import { ManuscriptReferenceImportTools } from '@/local-db/research/components/composer/ManuscriptReferenceImportTools';
import { ManuscriptDuplicateReferenceReview } from '@/local-db/research/components/composer/references/ManuscriptDuplicateReferenceReview';
import {
  applyCitationLinks,
  collectUnlinkedCitations,
  type CitationLinkDecision,
} from '@/local-db/research/manuscript/manuscriptCitationLink';
import { citationStyleKeyFromStyle } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { findDuplicateReferenceGroups } from '@/local-db/research/manuscript/manuscriptReferenceDuplicates';
import { type ReferenceRecordUpdate } from '@/local-db/research/manuscript/manuscriptReferenceForm';
import {
  collectReferenceUsage,
  summarizeReferenceUsage,
} from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type ManuscriptReferencesTabProps = {
  figures: FigureLike[];
  manuscriptId: string;
  onApplyCitationLinks: (sections: SectionLike[]) => Promise<void>;
  onChanged: () => void;
  onDeleteReferences: (referenceIds: string[]) => Promise<void>;
  onGoToExport: () => void;
  onMergeDuplicateReferences: (
    keptReference: ReferenceLike,
    removedReferences: ReferenceLike[],
  ) => Promise<void>;
  onSelectSection: (sectionId: string) => void;
  onUpdateReference: (
    reference: ReferenceLike,
    update: ReferenceRecordUpdate,
  ) => Promise<void>;
  references: ReferenceLike[];
  sections: SectionLike[];
  style: JournalStyle;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};

  & h2 {
    margin-bottom: 0;
  }
`;

const StyledHeader = styled.div`
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledHeading = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledStats = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledHeaderActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledStyleAffordance = styled.button`
  align-self: flex-start;
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  padding: 0;
  text-align: left;

  &:hover {
    color: ${themeCssVariables.font.color.secondary};
  }
`;

export const ManuscriptReferencesTab = ({
  figures,
  manuscriptId,
  onApplyCitationLinks,
  onChanged,
  onDeleteReferences,
  onGoToExport,
  onMergeDuplicateReferences,
  onSelectSection,
  onUpdateReference,
  references,
  sections,
  style,
}: ManuscriptReferencesTabProps) => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const { enqueueDialog } = useDialogManager();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isLinkPanelOpen, setIsLinkPanelOpen] = useState(false);
  const occurrences = useMemo(
    () => collectUnlinkedCitations(sections, references),
    [references, sections],
  );
  const usage = useMemo(
    () => collectReferenceUsage(sections, figures, references),
    [figures, references, sections],
  );
  const usageSummary = useMemo(
    () => summarizeReferenceUsage(references, usage),
    [references, usage],
  );
  const unusedReferences = useMemo(
    () =>
      references.filter(
        (reference) =>
          (usage.get(reference.citationKey?.trim() ?? '')?.count ?? 0) === 0,
      ),
    [references, usage],
  );
  const duplicateGroups = useMemo(
    () => findDuplicateReferenceGroups(references),
    [references],
  );
  const occurrenceSignature = occurrences
    .map(
      (occurrence) =>
        `${occurrence.sectionId}:${occurrence.index}:${occurrence.marker}`,
    )
    .join('|');
  const citationStyleKey = citationStyleKeyFromStyle(style);

  const applyLinks = async (decisions: CitationLinkDecision[]) => {
    const changedSections = applyCitationLinks(sections, decisions);
    if (changedSections.length === 0) return;
    try {
      await onApplyCitationLinks(changedSections);
      enqueueSuccessSnackBar({
        message: `Linked ${decisions.length} in-text citation(s)`,
      });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not link in-text citations' });
      throw new Error('Could not link in-text citations');
    }
  };

  const deleteUnusedReferences = async () => {
    try {
      await onDeleteReferences(unusedReferences.map(({ id }) => id));
      enqueueSuccessSnackBar({
        message: `Deleted ${unusedReferences.length} unused reference(s)`,
      });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not delete unused references' });
    }
  };

  const mergeDuplicateReferences = async (
    keptReference: ReferenceLike,
    removedReferences: ReferenceLike[],
  ) => {
    const keptKey = keptReference.citationKey?.trim() || keptReference.id;
    try {
      await onMergeDuplicateReferences(keptReference, removedReferences);
      enqueueSuccessSnackBar({
        message: `Merged ${removedReferences.length} reference${removedReferences.length === 1 ? '' : 's'} into [@${keptKey}]`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        message: `Could not merge duplicate references${error instanceof Error ? `: ${error.message}` : ''}`,
      });
    }
  };

  return (
    <StyledTab>
      <StyledHeader>
        <StyledHeading>
          <H2Title title="References" />
          <StyledStats>
            {usageSummary.total} references · {usageSummary.cited} cited ·{' '}
            {usageSummary.unused} unused
          </StyledStats>
        </StyledHeading>
        <StyledHeaderActions>
          <Button
            title={isImportOpen ? 'Close add references' : 'Add references'}
            variant="secondary"
            size="small"
            onClick={() => setIsImportOpen((current) => !current)}
          />
          {occurrences.length > 0 ? (
            <Button
              title={`Link in-text citations (${occurrences.length} unlinked)`}
              variant="secondary"
              size="small"
              onClick={() => setIsLinkPanelOpen(true)}
            />
          ) : null}
          {unusedReferences.length > 0 ? (
            <Button
              title={`Delete all unused (${unusedReferences.length})`}
              variant="secondary"
              size="small"
              onClick={() =>
                enqueueDialog({
                  title: 'Delete unused references',
                  message: `Delete ${unusedReferences.length} uncited reference record${unusedReferences.length === 1 ? '' : 's'}? ${unusedReferences
                    .map(
                      (reference) =>
                        reference.citationKey?.trim() || reference.id,
                    )
                    .join(', ')}`,
                  buttons: [
                    { title: 'Cancel' },
                    {
                      title: 'Delete',
                      accent: 'danger',
                      role: 'confirm',
                      onClick: () => void deleteUnusedReferences(),
                    },
                  ],
                })
              }
            />
          ) : null}
        </StyledHeaderActions>
      </StyledHeader>
      <StyledStyleAffordance type="button" onClick={onGoToExport}>
        Citation style: {citationStyleTitle(citationStyleKey)} · change in
        Export
      </StyledStyleAffordance>
      {isImportOpen ? (
        <ManuscriptReferenceImportTools
          manuscriptId={manuscriptId}
          references={references}
          onChanged={onChanged}
        />
      ) : null}
      {isLinkPanelOpen && occurrences.length > 0 ? (
        <ManuscriptCitationLinkPanel
          key={occurrenceSignature}
          occurrences={occurrences}
          references={references}
          onApply={applyLinks}
          onClose={() => setIsLinkPanelOpen(false)}
        />
      ) : null}
      <ManuscriptDuplicateReferenceReview
        groups={duplicateGroups}
        usage={usage}
        onApply={mergeDuplicateReferences}
      />
      <ManuscriptReferencePanel
        figures={figures}
        sections={sections}
        references={references}
        usage={usage}
        onDeleteReference={(reference) => onDeleteReferences([reference.id])}
        onSelectSection={onSelectSection}
        onUpdateReference={onUpdateReference}
      />
    </StyledTab>
  );
};
