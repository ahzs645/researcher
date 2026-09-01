import {
  renderManuscriptContributionsStatement,
  renderManuscriptEqualContributionStatement,
  renderManuscriptFundingStatement,
  type ManuscriptContributorMetadata,
} from '@/local-db/research/manuscript/manuscriptContributorMetadata';
import { type ManuscriptAuthor } from '@/local-db/research/manuscript/manuscriptContributors';

import { StyledStatementPreview } from './ManuscriptContributorsEditorStyles';

// The two statements a journal asks for in prose, rendered from the roles and
// awards as they are ticked — so the author can see the sentence they will be
// asked to paste into the submission form.

type ManuscriptContributorStatementsProps = {
  authors: ManuscriptAuthor[];
  metadata: ManuscriptContributorMetadata;
};

export const ManuscriptContributorStatements = ({
  authors,
  metadata,
}: ManuscriptContributorStatementsProps) => {
  const contributions = renderManuscriptContributionsStatement(
    authors,
    metadata,
  );
  const equalContribution = renderManuscriptEqualContributionStatement(
    authors,
    metadata,
  );
  const funding = renderManuscriptFundingStatement(authors, metadata);

  return (
    <>
      {contributions.length > 0 && (
        <StyledStatementPreview>
          Author contributions: {contributions}
          {equalContribution.length > 0 ? ` ${equalContribution}` : ''}
        </StyledStatementPreview>
      )}
      {funding.length > 0 && (
        <StyledStatementPreview>{funding}</StyledStatementPreview>
      )}
    </>
  );
};
