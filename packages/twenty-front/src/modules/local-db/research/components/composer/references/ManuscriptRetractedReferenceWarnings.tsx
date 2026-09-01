import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  summarizeRetractionScan,
  type ReferenceRetractionResult,
  type RetractionScanSummary,
  type RetractionStatus,
} from '@/local-db/research/manuscript/manuscriptRetraction';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

import { runRetractionScan } from './manuscriptRetractionFetch';
import {
  manuscriptRetractionScanState,
  retractionScanSignature,
} from './manuscriptRetractionScanState';

type ManuscriptRetractedReferenceWarningsProps = {
  manuscriptId: string;
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

const CHECKING_SUMMARY: RetractionScanSummary = summarizeRetractionScan({
  state: 'CHECKING',
  results: [],
  withoutDoiCount: 0,
  uncheckedCount: 0,
});

// A scan whose bibliography has changed underneath it is worth no more than no
// scan at all, so it goes back to IDLE — with wording that says why, rather
// than quietly forgetting the author ever ran it.
const STALE_SUMMARY: RetractionScanSummary = {
  ...IDLE_SUMMARY,
  message: 'The reference list changed since the last check — check again.',
};

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
  manuscriptId,
  references,
}: ManuscriptRetractedReferenceWarningsProps) => {
  // The result is shared state rather than local state because the export
  // panel has to report what this scan found, and it cannot run one itself.
  const [manuscriptRetractionScan, setManuscriptRetractionScan] = useAtomState(
    manuscriptRetractionScanState,
  );
  const [isChecking, setIsChecking] = useState(false);

  const referenceIds = references.map((reference) => reference.id);
  const referenceSignature = retractionScanSignature(referenceIds);
  const storedScan =
    manuscriptRetractionScan !== null &&
    manuscriptRetractionScan.manuscriptId === manuscriptId
      ? manuscriptRetractionScan
      : null;
  const isStale =
    storedScan !== null &&
    retractionScanSignature(storedScan.checkedReferenceIds) !==
      referenceSignature;

  // Staleness is decided here because this is where the reference ids are; the
  // export panel sees only a bundle, and a count of references is not evidence
  // that they are the same references.
  useEffect(() => {
    if (!isStale) return;
    setManuscriptRetractionScan({
      manuscriptId,
      summary: STALE_SUMMARY,
      checkedReferenceIds:
        referenceSignature.length === 0 ? [] : referenceSignature.split('|'),
    });
  }, [isStale, manuscriptId, referenceSignature, setManuscriptRetractionScan]);

  const summary = isChecking
    ? CHECKING_SUMMARY
    : isStale
      ? STALE_SUMMARY
      : (storedScan?.summary ?? IDLE_SUMMARY);

  const check = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const scanned = await runRetractionScan(references);
      // Every reference the scan ran over, not just the ones with a DOI: the
      // summary counts the DOI-less ones too, so adding one dates it.
      setManuscriptRetractionScan({
        manuscriptId,
        summary: scanned,
        checkedReferenceIds: referenceIds,
      });
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
