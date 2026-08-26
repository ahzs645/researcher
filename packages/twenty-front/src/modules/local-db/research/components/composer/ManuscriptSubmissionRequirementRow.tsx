import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type ScreeningFinding,
  type ScreeningVerdict,
} from '@/local-db/research/manuscript/manuscriptScreening';
import {
  type ResolvedSubmissionRequirementItem,
  type SubmissionConflict,
} from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';

type ManuscriptSubmissionRequirementRowProps = {
  item: ResolvedSubmissionRequirementItem;
  conflict?: SubmissionConflict;
  onChange: (value: string) => void;
  onRemove: () => void;
  onUseManuscriptValue: () => void;
  onKeepJournalValue: () => void;
};

const StyledRow = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledHeading = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledDot = styled.span<{ filled: boolean }>`
  background: ${({ filled }) =>
    filled ? themeCssVariables.color.green : themeCssVariables.color.orange};
  border-radius: 50%;
  height: 8px;
  width: 8px;
`;

const StyledLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledRequired = styled.span`
  color: ${themeCssVariables.color.red};
`;

const StyledButton = styled.button`
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 80px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledConflictBadge = styled.span`
  background: ${themeCssVariables.background.transparent.orange};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.color.orange};
  font-size: ${themeCssVariables.font.size.xs};
  padding: 1px ${themeCssVariables.spacing[1]};
`;

const StyledConflict = styled.div`
  background: ${themeCssVariables.background.transparent.orange};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledConflictActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

export const ManuscriptSubmissionRequirementRow = ({
  item,
  conflict,
  onChange,
  onRemove,
  onUseManuscriptValue,
  onKeepJournalValue,
}: ManuscriptSubmissionRequirementRowProps) => {
  const label = item.definition.label;
  const editor =
    item.definition.kind === 'SHORT_TEXT' ? (
      <StyledInput
        aria-label={label}
        value={item.value}
        onChange={(event) => onChange(event.target.value)}
      />
    ) : (
      <StyledTextarea
        aria-label={label}
        value={item.value}
        onChange={(event) => onChange(event.target.value)}
      />
    );

  return (
    <StyledRow>
      <StyledHeading>
        <StyledDot
          filled={item.filled}
          aria-label={item.filled ? 'Filled' : 'Empty'}
        />
        <StyledLabel>
          {label}{' '}
          {item.required ? (
            <StyledRequired aria-label="Required">*</StyledRequired>
          ) : null}
        </StyledLabel>
        {conflict !== undefined ? (
          <StyledConflictBadge>Conflict</StyledConflictBadge>
        ) : null}
        <StyledButton type="button" onClick={onRemove}>
          Remove
        </StyledButton>
      </StyledHeading>
      {editor}
      {item.definition.kind === 'LIST' ? (
        <StyledHint>Enter one item per line.</StyledHint>
      ) : null}
      {conflict !== undefined ? (
        <StyledConflict>
          <span>{conflict.message}</span>
          <span>Journal snapshot: {conflict.journalValue || 'Empty'}</span>
          <span>Manuscript: {conflict.manuscriptValue || 'Empty'}</span>
          <StyledConflictActions>
            <StyledButton type="button" onClick={onUseManuscriptValue}>
              Use manuscript value
            </StyledButton>
            <StyledButton type="button" onClick={onKeepJournalValue}>
              Keep journal value
            </StyledButton>
          </StyledConflictActions>
        </StyledConflict>
      ) : null}
    </StyledRow>
  );
};

type ManuscriptScreeningFindingRowProps = {
  finding: ScreeningFinding;
};

const VERDICT_LABELS: Record<ScreeningVerdict, string> = {
  PRESENT: 'Found',
  WEAK: 'Weak',
  ABSENT: 'Not found',
};

// A screening finding is read, not edited: the row is a verdict, the sentence
// it matched and where that sentence lives, so the author can disagree with it.
const StyledScreeningRow = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledScreeningHeading = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

// Absent is deliberately not red: most manuscripts are not clinical trials, and
// an alarm colour on an expected absence trains the author to ignore the panel.
const StyledVerdict = styled.span<{ verdict: ScreeningVerdict }>`
  background: ${({ verdict }) =>
    verdict === 'PRESENT'
      ? themeCssVariables.background.transparent.success
      : verdict === 'WEAK'
        ? themeCssVariables.background.transparent.orange
        : themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ verdict }) =>
    verdict === 'PRESENT'
      ? themeCssVariables.color.green
      : verdict === 'WEAK'
        ? themeCssVariables.color.orange
        : themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: 1px ${themeCssVariables.spacing[2]};
`;

const StyledScreeningLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledTool = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledEvidence = styled.blockquote`
  border-left: 2px solid ${themeCssVariables.border.color.medium};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
  padding-left: ${themeCssVariables.spacing[2]};
`;

const StyledDetail = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptScreeningFindingRow = ({
  finding,
}: ManuscriptScreeningFindingRowProps) => (
  <StyledScreeningRow>
    <StyledScreeningHeading>
      <StyledVerdict verdict={finding.verdict}>
        {VERDICT_LABELS[finding.verdict]}
      </StyledVerdict>
      <StyledScreeningLabel>{finding.label}</StyledScreeningLabel>
      <StyledTool>{finding.tool}</StyledTool>
    </StyledScreeningHeading>
    {finding.evidence.length > 0 ? (
      <StyledEvidence>
        “{finding.evidence}”
        {finding.sectionName === undefined ? null : ` — ${finding.sectionName}`}
      </StyledEvidence>
    ) : null}
    <StyledDetail>{finding.detail}</StyledDetail>
  </StyledScreeningRow>
);
