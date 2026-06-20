import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { RESEARCH_GRANT_SOURCE_SEEDS } from '@/local-db/research/researchGrantSourceData';
import {
  buildTeamProfileFromRecords,
  scanSourceToOpportunities,
  type DiscoverySource,
} from '@/local-db/research/researchDiscovery';
import { getTwentyDataBridgeConfig } from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// Records as the Discovery page reads them. The research objects use flat scalar
// fields, so only the columns the scan/score needs are requested.
type SourceRecord = {
  id: string;
  name?: string | null;
  url?: string | null;
  funder?: string | null;
  funderType?: string | null;
  topicTags?: string[] | null;
  eligibilityTags?: string[] | null;
};
type TeamRecord = { focusAreas?: string[] | null };
type GrantRecord = { funder?: string | null };
type OpportunityRecord = {
  id: string;
  name?: string | null;
  funder?: string | null;
  opportunityUrl?: string | null;
  fitScore?: number | null;
  confidence?: string | null;
  status?: string | null;
  amountText?: string | null;
};

const StyledPage = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  height: 100%;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[8]};
  width: 100%;
`;

const StyledHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTitleRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  justify-content: space-between;
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledSubtitle = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledSectionTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledRowMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledRowTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledRowMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledRowActions = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledFitScore = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  white-space: nowrap;
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const SOURCE_GQL_FIELDS = {
  id: true,
  name: true,
  url: true,
  funder: true,
  funderType: true,
  topicTags: true,
  eligibilityTags: true,
};

export const DiscoveryPage = () => {
  const isConvexMode = getTwentyDataBridgeConfig()?.mode === 'convex';
  const [isScanning, setIsScanning] = useState(false);

  const { records: sourceRecords } = useFindManyRecords({
    objectNameSingular: 'grantSource',
    recordGqlFields: SOURCE_GQL_FIELDS,
  });
  const { records: teamRecords } = useFindManyRecords({
    objectNameSingular: 'researchTeam',
    recordGqlFields: { id: true, name: true, focusAreas: true },
  });
  const { records: grantRecords } = useFindManyRecords({
    objectNameSingular: 'grant',
    recordGqlFields: { id: true, funder: true },
  });
  const { records: opportunityRecords } = useFindManyRecords({
    objectNameSingular: 'grantOpportunity',
    recordGqlFields: {
      id: true,
      name: true,
      funder: true,
      opportunityUrl: true,
      fitScore: true,
      confidence: true,
      status: true,
      amountText: true,
    },
  });

  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'grantOpportunity',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar } = useSnackBar();

  const teams = teamRecords as unknown as TeamRecord[];
  const grants = grantRecords as unknown as GrantRecord[];
  const opportunities = opportunityRecords as unknown as OpportunityRecord[];

  const profile = useMemo(
    () => buildTeamProfileFromRecords(teams, grants),
    [teams, grants],
  );

  // Prefer the workspace's own grantSource records; fall back to the built-in
  // library so Discovery is useful even before any sources are saved.
  const sources: DiscoverySource[] = useMemo(() => {
    const records = sourceRecords as unknown as SourceRecord[];
    if (records.length > 0) {
      return records.map((record) => ({
        id: record.id,
        name: record.name ?? 'Untitled source',
        url: record.url,
        funder: record.funder,
        funderType: record.funderType,
        topicTags: record.topicTags,
        eligibilityTags: record.eligibilityTags,
      }));
    }
    return RESEARCH_GRANT_SOURCE_SEEDS.map((seed) => ({
      libraryKey: seed.libraryKey,
      name: seed.name,
      url: seed.url,
      funderType: seed.funderType,
      topicTags: seed.topicTags,
      eligibilityTags: seed.eligibilityTags,
    }));
  }, [sourceRecords]);

  const existingUrls = useMemo(
    () =>
      opportunities
        .map((opportunity) => opportunity.opportunityUrl)
        .filter((url): url is string => isDefined(url) && url.length > 0),
    [opportunities],
  );

  const reviewQueue = useMemo(
    () =>
      opportunities
        .filter((opportunity) => opportunity.status === 'NEW')
        .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)),
    [opportunities],
  );

  const scanAll = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const seen = new Set(existingUrls);
      let created = 0;
      for (const source of sources) {
        const drafts = scanSourceToOpportunities(source, profile, seen);
        for (const draft of drafts) {
          seen.add(draft.opportunityUrl);
          await createOneRecord(draft);
          created += 1;
        }
      }
      enqueueSuccessSnackBar({
        message: `Found ${created} new opportunit${created === 1 ? 'y' : 'ies'} across ${sources.length} sources`,
      });
    } finally {
      setIsScanning(false);
    }
  };

  const scanOne = async (source: DiscoverySource) => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const drafts = scanSourceToOpportunities(source, profile, existingUrls);
      for (const draft of drafts) {
        await createOneRecord(draft);
      }
      enqueueSuccessSnackBar({
        message: `Found ${drafts.length} opportunit${drafts.length === 1 ? 'y' : 'ies'} from ${source.name}`,
      });
    } finally {
      setIsScanning(false);
    }
  };

  const setOpportunityStatus = async (
    opportunity: OpportunityRecord,
    status: 'ACCEPTED' | 'REJECTED',
  ) => {
    await updateOneRecord({
      objectNameSingular: 'grantOpportunity',
      idToUpdate: opportunity.id,
      updateOneRecordInput: { status },
    });
  };

  return (
    <StyledPage>
      <StyledHeader>
        <StyledTitleRow>
          <StyledTitle>Discovery</StyledTitle>
          <Button
            title={isScanning ? 'Scanning…' : 'Scan all sources'}
            variant="primary"
            accent="blue"
            disabled={isScanning}
            onClick={scanAll}
          />
        </StyledTitleRow>
        <StyledSubtitle>
          {isConvexMode
            ? 'Live discovery: sources are pulled and scored on the backend, then surfaced here.'
            : 'Opportunities are derived from each source’s topics and scored against your team’s focus areas and funders.'}
        </StyledSubtitle>
      </StyledHeader>

      <div>
        <StyledSectionTitle>Sources ({sources.length})</StyledSectionTitle>
        <StyledList>
          {sources.map((source) => (
            <StyledRow key={source.id ?? source.libraryKey ?? source.name}>
              <StyledRowMain>
                <StyledRowTitle>{source.name}</StyledRowTitle>
                <StyledRowMeta>
                  {[source.funderType, (source.topicTags ?? []).join(', ')]
                    .filter((part) => isDefined(part) && part.length > 0)
                    .join(' · ')}
                </StyledRowMeta>
              </StyledRowMain>
              <StyledRowActions>
                <Button
                  title="Scan"
                  variant="secondary"
                  size="small"
                  disabled={isScanning}
                  onClick={() => scanOne(source)}
                />
              </StyledRowActions>
            </StyledRow>
          ))}
        </StyledList>
      </div>

      <div>
        <StyledSectionTitle>
          Review queue ({reviewQueue.length})
        </StyledSectionTitle>
        {reviewQueue.length === 0 ? (
          <StyledEmpty>
            No new opportunities yet — scan a source to discover some.
          </StyledEmpty>
        ) : (
          <StyledList>
            {reviewQueue.map((opportunity) => (
              <StyledRow key={opportunity.id}>
                <StyledRowMain>
                  <StyledRowTitle>{opportunity.name}</StyledRowTitle>
                  <StyledRowMeta>
                    {[opportunity.funder, opportunity.amountText]
                      .filter((part) => isDefined(part) && part.length > 0)
                      .join(' · ')}
                  </StyledRowMeta>
                </StyledRowMain>
                <StyledRowActions>
                  <StyledFitScore>
                    Fit {opportunity.fitScore ?? '–'}/5 ·{' '}
                    {opportunity.confidence ?? '—'}
                  </StyledFitScore>
                  <Button
                    title="Accept"
                    variant="secondary"
                    size="small"
                    accent="blue"
                    onClick={() =>
                      setOpportunityStatus(opportunity, 'ACCEPTED')
                    }
                  />
                  <Button
                    title="Reject"
                    variant="secondary"
                    size="small"
                    onClick={() =>
                      setOpportunityStatus(opportunity, 'REJECTED')
                    }
                  />
                </StyledRowActions>
              </StyledRow>
            ))}
          </StyledList>
        )}
      </div>
    </StyledPage>
  );
};
