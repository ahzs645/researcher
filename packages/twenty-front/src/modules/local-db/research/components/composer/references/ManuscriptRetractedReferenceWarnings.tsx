import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  summarizeRetractionScan,
  type ReferenceRetractionResult,
  type RetractionScanSummary,
  type RetractionStatus,
} from '@/local-db/research/manuscript/manuscriptRetraction';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

import { runRetractionScan } from './manuscriptRetractionFetch';

type ManuscriptRetractedReferenceWarningsProps = {
  references: ReferenceLike[];
};

const STATUS_LABELS: Record<RetractionStatus, string> = {
  RETRACTED: 'Retracted',
  CONCERN: 'Expression of concern',
  CORRECTED: 'Corrected',
  CLEAN: 'Clean',
  UNKNOWN: 'Not checked',
};

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSummary = styled.span<{ tone: 'alert' | 'caution' | 'neutral' }>`
  color: ${({ tone }) =>
    tone === 'alert'
      ? themeCssVariables.font.color.danger
      : tone === 'caution'
        ? themeCssVariables.font.color.secondary
        : themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledItem = styled.li<{ isRetracted: boolean }>`
  background: ${themeCssVariables.background.primary};
  border: 1px solid
    ${({ isRetracted }) =>
      isRetracted
        ? themeCssVariables.color.red
        : themeCssVariables.color.orange};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: 2px;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledItemHeader = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledItemDetail = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledNoticeLink = styled.a`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const IDLE_SUMMARY: RetractionScanSummary = summarizeRetractionScan({
  state: 'IDLE',
  results: [],
  withoutDoiCount: 0,
  uncheckedCount: 0,
});

const summaryTone = (
  summary: RetractionScanSummary,
): 'alert' | 'caution' | 'neutral' => {
  if (summary.flagged.some((result) => result.verdict.status === 'RETRACTED')) {
    return 'alert';
  }
  if (summary.flagged.length > 0) return 'caution';
  // "Could not check" is not good news, so it must not read as neutral grey
  // alongside a genuine all-clear.
  return summary.state === 'OFFLINE' || summary.state === 'FAILED'
    ? 'caution'
    : 'neutral';
};

const referenceLabel = (result: ReferenceRetractionResult): string =>
  result.citationKey.length > 0 ? `[@${result.citationKey}]` : result.doi;

// Crossref carries the Retraction Watch database, so a reference whose DOI has
// an `update-to` relation of type "retraction" is flagged here the way Zotero's
// Retraction Scanner badges a library item. Corrections and expressions of
// concern come through the same relation and are worth seeing too.
export const ManuscriptRetractedReferenceWarnings = ({
  references,
}: ManuscriptRetractedReferenceWarningsProps) => {
  const [summary, setSummary] = useState<RetractionScanSummary>(IDLE_SUMMARY);
  const [isChecking, setIsChecking] = useState(false);

  const check = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setSummary(
      summarizeRetractionScan({
        state: 'CHECKING',
        results: [],
        withoutDoiCount: 0,
        uncheckedCount: 0,
      }),
    );
    try {
      setSummary(await runRetractionScan(references));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <StyledSection>
      <Button
        title={isChecking ? 'Checking…' : 'Check references for retractions'}
        variant="secondary"
        size="small"
        disabled={isChecking || references.length === 0}
        onClick={check}
      />
      <StyledSummary tone={summaryTone(summary)}>
        {summary.message}
      </StyledSummary>
      {summary.flagged.length > 0 ? (
        <StyledList>
          {summary.flagged.map((result) => (
            <StyledItem
              key={result.referenceId}
              isRetracted={result.verdict.status === 'RETRACTED'}
            >
              <StyledItemHeader>
                {STATUS_LABELS[result.verdict.status]} ·{' '}
                {referenceLabel(result)}
              </StyledItemHeader>
              <StyledItemDetail>{result.title}</StyledItemDetail>
              <StyledItemDetail>{result.verdict.summary}</StyledItemDetail>
              {result.verdict.notices.map((notice) =>
                notice.doi === null ? null : (
                  <StyledNoticeLink
                    key={notice.doi}
                    href={`https://doi.org/${notice.doi}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {notice.label}: {notice.doi}
                  </StyledNoticeLink>
                ),
              )}
            </StyledItem>
          ))}
        </StyledList>
      ) : null}
    </StyledSection>
  );
};
