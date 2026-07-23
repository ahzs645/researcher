import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  formatManuscriptAuthorLine,
  parseManuscriptAffiliations,
} from '@/local-db/research/manuscript/manuscriptContributors';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';

import { StyledTitlePageCard } from './manuscriptTitlePageStyles';

type ManuscriptTitlePagePreviewProps = {
  title: string;
  authorLine: string;
  affiliations: string;
  correspondingAuthor: string;
  extraLines: string[];
  keywords: string;
  style: JournalStyle;
};

const StyledPreviewCard = styled(StyledTitlePageCard)`
  background: ${themeCssVariables.background.primary};
  min-height: 440px;
  position: sticky;
  top: 0;
`;

const StyledPreviewLabel = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  text-transform: uppercase;
`;

const StyledPaper = styled.div`
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  font-family: 'Times New Roman', serif;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[6]} ${themeCssVariables.spacing[4]};
`;

const StyledTitle = styled.div`
  font-weight: ${themeCssVariables.font.weight.semiBold};
  line-height: 1.25;
  text-align: center;
`;

const StyledAuthorLine = styled.div`
  font-weight: ${themeCssVariables.font.weight.semiBold};
  text-align: center;
`;

const StyledCorrespondence = styled.div`
  font-size: ${themeCssVariables.font.size.sm};
  text-align: center;
`;

const StyledKeywords = styled.div`
  font-size: ${themeCssVariables.font.size.sm};
  margin-top: ${themeCssVariables.spacing[4]};
`;

export const ManuscriptTitlePagePreview = ({
  title,
  authorLine,
  affiliations,
  correspondingAuthor,
  extraLines,
  keywords,
  style,
}: ManuscriptTitlePagePreviewProps) => {
  const affiliationAlignment =
    style.affiliationAlignment === 'CENTER'
      ? 'center'
      : style.affiliationAlignment === 'RIGHT'
        ? 'right'
        : 'left';

  return (
    <StyledPreviewCard>
      <StyledPreviewLabel>Preview</StyledPreviewLabel>
      <StyledPaper>
        <StyledTitle style={{ fontSize: `${style.titleFontSize ?? 16}px` }}>
          {title.trim() || 'Untitled manuscript'}
        </StyledTitle>
        {authorLine.trim().length > 0 ? (
          <StyledAuthorLine>
            {formatManuscriptAuthorLine(authorLine, affiliations)}
          </StyledAuthorLine>
        ) : null}
        <div style={{ textAlign: affiliationAlignment }}>
          {parseManuscriptAffiliations(affiliations).map(
            (affiliation, index) => (
              <div key={affiliation.id}>
                <sup>{index + 1}</sup> <em>{affiliation.name}</em>
              </div>
            ),
          )}
          {extraLines
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line, index) => (
              <div key={`${index}-${line}`}>{line}</div>
            ))}
        </div>
        {correspondingAuthor.trim().length > 0 ? (
          <StyledCorrespondence>{correspondingAuthor}</StyledCorrespondence>
        ) : null}
        {keywords.trim().length > 0 ? (
          <StyledKeywords>
            <strong>Keywords:</strong>{' '}
            {keywords.replace(/^keywords?\s*:\s*/i, '')}
          </StyledKeywords>
        ) : null}
      </StyledPaper>
    </StyledPreviewCard>
  );
};
