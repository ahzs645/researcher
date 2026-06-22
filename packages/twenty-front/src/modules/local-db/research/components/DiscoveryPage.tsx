import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { RESEARCH_GRANT_SOURCE_SEEDS } from '@/local-db/research/researchGrantSourceData';
import {
  buildTeamProfileFromRecords,
  scanSourceToOpportunities,
  type DiscoveredOpportunityDraft,
  type DiscoverySource,
} from '@/local-db/research/researchDiscovery';
import {
  assessOpportunity,
  relevanceVerdictForRecord,
  type ResearchProfile,
} from '@/local-db/research/researchRelevance';
import { buildApplicationPlan } from '@/local-db/research/researchStartApplication';
import { getTwentyDataBridgeConfig } from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// Records as the Discovery page reads them. The research objects use flat scalar
// fields, so only the columns the scan/score/assess/convert need are requested.
type SourceRecord = {
  id: string;
  name?: string | null;
  url?: string | null;
  funder?: string | null;
  funderType?: string | null;
  opportunityKind?: string | null;
  topicTags?: string[] | null;
  eligibilityTags?: string[] | null;
};
type TeamRecord = { name?: string | null; focusAreas?: string[] | null };
type GrantRecord = { funder?: string | null };
type OpportunityRecord = {
  id: string;
  name?: string | null;
  funder?: string | null;
  program?: string | null;
  opportunityKind?: string | null;
  opportunityUrl?: string | null;
  applicationDueDate?: string | null;
  amountText?: string | null;
  fitScore?: number | null;
  confidence?: string | null;
  status?: string | null;
  eligibility?: string | null;
  eligibilityNotes?: string | null;
  careerStage?: string | null;
  relevanceVerdict?: string | null;
  relevanceReason?: string | null;
  topicTags?: string[] | null;
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

const StyledReason = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
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

const StyledBadge = styled.span<{
  tone: 'eligible' | 'warn' | 'blocked' | 'neutral';
}>`
  background: ${({ tone }) =>
    tone === 'eligible'
      ? themeCssVariables.tag.background.green
      : tone === 'warn'
        ? themeCssVariables.tag.background.yellow
        : tone === 'blocked'
          ? themeCssVariables.tag.background.red
          : themeCssVariables.tag.background.gray};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ tone }) =>
    tone === 'eligible'
      ? themeCssVariables.tag.text.green
      : tone === 'warn'
        ? themeCssVariables.tag.text.yellow
        : tone === 'blocked'
          ? themeCssVariables.tag.text.red
          : themeCssVariables.tag.text.gray};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: 2px 6px;
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
  opportunityKind: true,
  topicTags: true,
  eligibilityTags: true,
};

const OPPORTUNITY_GQL_FIELDS = {
  id: true,
  name: true,
  funder: true,
  program: true,
  opportunityKind: true,
  opportunityUrl: true,
  applicationDueDate: true,
  amountText: true,
  fitScore: true,
  confidence: true,
  status: true,
  eligibility: true,
  eligibilityNotes: true,
  careerStage: true,
  relevanceVerdict: true,
  relevanceReason: true,
  topicTags: true,
};

const KIND_LABELS: Record<string, string> = {
  GRANT: 'Grant',
  SCHOLARSHIP: 'Scholarship',
  FELLOWSHIP: 'Fellowship',
  STUDENTSHIP: 'Studentship',
  PRIZE: 'Prize',
};

const verdictTone = (
  verdict: string | null | undefined,
): 'eligible' | 'warn' | 'blocked' | 'neutral' => {
  if (verdict === 'ELIGIBLE') return 'eligible';
  if (verdict === 'LIKELY') return 'warn';
  if (verdict === 'INELIGIBLE') return 'blocked';
  return 'neutral';
};

export const DiscoveryPage = () => {
  const isConvexMode = getTwentyDataBridgeConfig()?.mode === 'convex';
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

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
    recordGqlFields: OPPORTUNITY_GQL_FIELDS,
  });

  const { createOneRecord: createOpportunityRecord } = useCreateOneRecord({
    objectNameSingular: 'grantOpportunity',
  });
  const { createOneRecord: createApplicationRecord } = useCreateOneRecord({
    objectNameSingular: 'grantApplication',
  });
  const { createOneRecord: createRequirementRecord } = useCreateOneRecord({
    objectNameSingular: 'applicationRequirement',
  });
  const { createOneRecord: createSectionRecord } = useCreateOneRecord({
    objectNameSingular: 'applicationSection',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar } = useSnackBar();

  const teams = teamRecords as unknown as TeamRecord[];
  const grants = grantRecords as unknown as GrantRecord[];
  const opportunities = opportunityRecords as unknown as OpportunityRecord[];

  const profile: ResearchProfile = useMemo(
    () => buildTeamProfileFromRecords(teams, grants),
    [teams, grants],
  );

  const teamName = teams[0]?.name ?? '';

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
        opportunityKind: record.opportunityKind,
        topicTags: record.topicTags,
        eligibilityTags: record.eligibilityTags,
      }));
    }
    return RESEARCH_GRANT_SOURCE_SEEDS.map((seed) => ({
      libraryKey: seed.libraryKey,
      name: seed.name,
      url: seed.url,
      funderType: seed.funderType,
      opportunityKind: seed.opportunityKind,
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

  // Assess an opportunity on the fly for display when it has no stored verdict.
  const verdictFor = (opportunity: OpportunityRecord): string => {
    if (isDefined(opportunity.relevanceVerdict)) {
      return opportunity.relevanceVerdict;
    }
    return relevanceVerdictForRecord(
      assessOpportunity(
        {
          topicTags: opportunity.topicTags,
          eligibility: opportunity.eligibility,
          eligibilityNotes: opportunity.eligibilityNotes,
          funder: opportunity.funder,
          program: opportunity.program,
          opportunityKind: opportunity.opportunityKind,
          careerStage: opportunity.careerStage,
          applicationDueDate: opportunity.applicationDueDate,
        },
        profile,
      ),
    );
  };

  // Create a discovered opportunity, enriching it with a relevance assessment so
  // the review queue surfaces eligibility, not just fit, from the first scan.
  const createOpportunityFromDraft = async (
    draft: DiscoveredOpportunityDraft,
  ): Promise<void> => {
    const assessment = assessOpportunity(
      {
        topicTags: draft.topicTags,
        eligibility: draft.eligibility,
        funder: draft.funder,
        program: draft.program,
        opportunityKind: draft.opportunityKind,
      },
      profile,
    );
    await createOpportunityRecord({
      ...draft,
      relevanceVerdict: relevanceVerdictForRecord(assessment),
      relevanceReason: assessment.relevanceReason,
    });
  };

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
          await createOpportunityFromDraft(draft);
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
        await createOpportunityFromDraft(draft);
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

  // Convert an opportunity into a draft application: a linked grantApplication,
  // a requirement checklist, and starter narrative sections — all derived from
  // the funding kind. Submission stays manual; this just stages the work.
  const startApplication = async (opportunity: OpportunityRecord) => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const plan = buildApplicationPlan(
        {
          id: opportunity.id,
          name: opportunity.name,
          funder: opportunity.funder,
          program: opportunity.program,
          opportunityKind: opportunity.opportunityKind,
          amountText: opportunity.amountText,
          applicationDueDate: opportunity.applicationDueDate,
          eligibility: opportunity.eligibility,
          eligibilityNotes: opportunity.eligibilityNotes,
        },
        { organization: teamName },
      );
      const application = await createApplicationRecord(plan.application);
      const applicationId = (application as { id?: string } | undefined)?.id;
      if (isDefined(applicationId)) {
        for (const requirement of plan.requirements) {
          await createRequirementRecord({ ...requirement, applicationId });
        }
        for (const section of plan.sections) {
          await createSectionRecord({ ...section, applicationId });
        }
      }
      await setOpportunityStatus(opportunity, 'ACCEPTED');
      enqueueSuccessSnackBar({
        message: `Started "${plan.application.name}" — ${plan.requirements.length} checklist items and ${plan.sections.length} sections drafted under Funding`,
      });
    } finally {
      setIsStarting(false);
    }
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
            : 'Opportunities are derived from each source’s topics, scored against your team’s focus areas and funders, and assessed for eligibility.'}
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
                  {[
                    KIND_LABELS[source.opportunityKind ?? 'GRANT'],
                    source.funderType,
                    (source.topicTags ?? []).join(', '),
                  ]
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
            {reviewQueue.map((opportunity) => {
              const verdict = verdictFor(opportunity);
              return (
                <StyledRow key={opportunity.id}>
                  <StyledRowMain>
                    <StyledRowTitle>{opportunity.name}</StyledRowTitle>
                    <StyledRowMeta>
                      {[
                        KIND_LABELS[opportunity.opportunityKind ?? 'GRANT'],
                        opportunity.funder,
                        opportunity.amountText,
                      ]
                        .filter((part) => isDefined(part) && part.length > 0)
                        .join(' · ')}
                    </StyledRowMeta>
                    {isDefined(opportunity.relevanceReason) &&
                    opportunity.relevanceReason.length > 0 ? (
                      <StyledReason>{opportunity.relevanceReason}</StyledReason>
                    ) : null}
                  </StyledRowMain>
                  <StyledRowActions>
                    <StyledBadge tone={verdictTone(verdict)}>
                      {verdict === 'ELIGIBLE'
                        ? 'Eligible'
                        : verdict === 'LIKELY'
                          ? 'Likely'
                          : verdict === 'INELIGIBLE'
                            ? 'Ineligible'
                            : 'Review'}
                    </StyledBadge>
                    <StyledFitScore>
                      Fit {opportunity.fitScore ?? '–'}/5
                    </StyledFitScore>
                    <Button
                      title="Start application"
                      variant="primary"
                      size="small"
                      accent="blue"
                      disabled={isStarting || verdict === 'INELIGIBLE'}
                      onClick={() => startApplication(opportunity)}
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
              );
            })}
          </StyledList>
        )}
      </div>
    </StyledPage>
  );
};
