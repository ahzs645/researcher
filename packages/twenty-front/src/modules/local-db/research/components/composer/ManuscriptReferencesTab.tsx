import { styled } from '@linaria/react';
import { H2Title } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptReferencePanel } from '@/local-db/research/components/ManuscriptReferencePanel';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptReferencesTabProps = {
  manuscriptId: string;
  references: ReferenceLike[];
  onChanged: () => void;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};

  & h2 {
    margin-bottom: 0;
  }
`;

export const ManuscriptReferencesTab = ({
  manuscriptId,
  references,
  onChanged,
}: ManuscriptReferencesTabProps) => (
  <StyledTab>
    <H2Title title="References" />
    <ManuscriptReferencePanel
      manuscriptId={manuscriptId}
      references={references}
      onChanged={onChanged}
    />
  </StyledTab>
);
