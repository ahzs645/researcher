import { styled } from '@linaria/react';
import { H2Title } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  ManuscriptSubmissionDetailsPanel,
  type ManuscriptSubmissionDetails,
} from '@/local-db/research/components/ManuscriptSubmissionDetailsPanel';
import { type ManuscriptRecord } from '@/local-db/research/components/composer/manuscriptComposerData';

type ManuscriptSubmissionTabProps = {
  manuscript: ManuscriptRecord;
  journalName: string;
  requiredArtifacts: string[];
  onSave: (values: ManuscriptSubmissionDetails) => Promise<void>;
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
  journalName,
  requiredArtifacts,
  onSave,
}: ManuscriptSubmissionTabProps) => (
  <StyledTab>
    <H2Title title="Submission details" />
    <ManuscriptSubmissionDetailsPanel
      key={manuscript.id}
      initialValues={{
        authorLine: manuscript.authorLine,
        affiliations: manuscript.affiliations,
        correspondingAuthor: manuscript.correspondingAuthor,
        supplementTitle: manuscript.supplementTitle,
        supplementAuthorLine: manuscript.supplementAuthorLine,
        supplementAffiliations: manuscript.supplementAffiliations,
        coverLetter: manuscript.coverLetter,
        highlights: manuscript.highlights,
        competingInterests: manuscript.competingInterests,
        suggestedReviewers: manuscript.suggestedReviewers,
      }}
      journalName={journalName}
      requiredArtifacts={requiredArtifacts}
      onSave={onSave}
    />
  </StyledTab>
);
