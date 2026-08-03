import { styled } from '@linaria/react';
import { H2Title } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  ManuscriptSubmissionDetailsPanel,
  type ManuscriptSubmissionDetails,
} from '@/local-db/research/components/ManuscriptSubmissionDetailsPanel';
import {
  type JournalRecord,
  type ManuscriptRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import { ManuscriptSubmissionRequirementsPanel } from '@/local-db/research/components/composer/ManuscriptSubmissionRequirementsPanel';
import {
  ManuscriptSubmissionTrackingPanel,
  type ManuscriptSubmissionTracking,
} from '@/local-db/research/components/composer/ManuscriptSubmissionTrackingPanel';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';
import {
  type JournalSubmissionRequirement,
  type SubmissionRequirementValues,
} from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';

type ManuscriptSubmissionTabProps = {
  manuscript: ManuscriptRecord;
  template?: JournalRecord;
  isExplicitTarget: boolean;
  onConfirmTargetJournal: () => Promise<void>;
  sections: SectionLike[];
  onSave: (values: ManuscriptSubmissionDetails) => Promise<void>;
  onSaveTracking: (values: ManuscriptSubmissionTracking) => Promise<void>;
  onPickTargetJournal: () => void;
  onSaveRequirementValues: (
    values: SubmissionRequirementValues,
  ) => Promise<void>;
  onSaveRequirements: (
    requirements: JournalSubmissionRequirement[],
  ) => Promise<void>;
  onKeepJournalValue: (key: string, value: string) => Promise<void>;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};

  & h2 {
    margin-bottom: 0;
  }
`;

export const ManuscriptSubmissionTab = ({
  manuscript,
  template,
  isExplicitTarget,
  onConfirmTargetJournal,
  sections,
  onSave,
  onSaveTracking,
  onPickTargetJournal,
  onSaveRequirementValues,
  onSaveRequirements,
  onKeepJournalValue,
}: ManuscriptSubmissionTabProps) => (
  <StyledTab>
    <ManuscriptSubmissionTrackingPanel
      key={`${manuscript.id}-tracking`}
      initialValues={{
        status: manuscript.status ?? 'DRAFTING',
        submittedAt: manuscript.submissionTracking?.submittedAt ?? '',
        version: manuscript.submissionTracking?.version ?? '',
        journalConfirmed:
          manuscript.submissionTracking?.journalConfirmed === true,
      }}
      onSave={onSaveTracking}
    />
    <ManuscriptSubmissionRequirementsPanel
      key={`${manuscript.id}-${template?.id ?? 'no-journal'}`}
      manuscript={{ ...manuscript, sections }}
      template={template}
      isExplicitTarget={isExplicitTarget}
      onConfirmTargetJournal={onConfirmTargetJournal}
      onPickTargetJournal={onPickTargetJournal}
      onSaveValues={onSaveRequirementValues}
      onSaveRequirements={onSaveRequirements}
      onKeepJournalValue={onKeepJournalValue}
    />
    <H2Title title="Supplement details" />
    <ManuscriptSubmissionDetailsPanel
      key={manuscript.id}
      initialValues={{
        supplementTitle: manuscript.supplementTitle,
        supplementAuthorLine: manuscript.supplementAuthorLine,
        supplementAffiliations: manuscript.supplementAffiliations,
      }}
      onSave={onSave}
    />
  </StyledTab>
);
