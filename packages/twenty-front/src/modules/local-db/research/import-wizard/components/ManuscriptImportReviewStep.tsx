import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import { type PreparedManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';

type ManuscriptImportReviewStepProps = {
  document: ImportedDocument;
  preparedImport: PreparedManuscriptImport;
  sourceName: string;
};

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  margin: 0;
`;

const StyledHint = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledSummary = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.primary};
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledMetric = styled.div`
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledMetricValue = styled.span`
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledNotice = styled.div`
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[4]};
`;

export const ManuscriptImportReviewStep = ({
  document,
  preparedImport,
  sourceName,
}: ManuscriptImportReviewStepProps) => (
  <StyledContainer>
    <StyledTitle>Review import</StyledTitle>
    <StyledHint>
      {sourceName}
      {document.title === undefined ? '' : ` · ${document.title}`}
    </StyledHint>
    <StyledSummary>
      <StyledMetric>
        <StyledMetricValue>{preparedImport.sections.length}</StyledMetricValue>
        Sections
      </StyledMetric>
      <StyledMetric>
        <StyledMetricValue>{preparedImport.figures.length}</StyledMetricValue>
        Figures and tables
      </StyledMetric>
      <StyledMetric>
        <StyledMetricValue>
          {preparedImport.references.length}
        </StyledMetricValue>
        References
      </StyledMetric>
      <StyledMetric>
        <StyledMetricValue>{preparedImport.linkedCount}</StyledMetricValue>
        Linked citations
      </StyledMetric>
    </StyledSummary>
    <StyledNotice>
      Review and commit controls arrive in the next implementation step. The
      document has been assembled and prepared once for this review.
    </StyledNotice>
  </StyledContainer>
);
