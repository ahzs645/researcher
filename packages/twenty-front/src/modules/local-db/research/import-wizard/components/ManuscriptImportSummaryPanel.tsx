import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ManuscriptImportSummary } from '@/local-db/research/import-wizard/utils/buildManuscriptImportSummary';

type ManuscriptImportSummaryPanelProps = {
  summary: ManuscriptImportSummary;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledHeadline = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledCounts = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledGroups = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledGroupTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledGroupNames = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: 1.5;
`;

const StyledFactList = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledNote = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-left: 2px solid ${themeCssVariables.color.orange};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  line-height: 1.5;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledNoteTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledNoteList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  margin: 0;
  padding-left: ${themeCssVariables.spacing[4]};
`;

const StyledExcludedName = styled.span`
  color: ${themeCssVariables.font.color.primary};
`;

const formatCount = (count: number): string => count.toLocaleString('en-US');

const pluralize = (count: number, noun: string): string =>
  `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;

export const ManuscriptImportSummaryPanel = ({
  summary,
}: ManuscriptImportSummaryPanelProps) => {
  // Only asset records are enumerated here — inline math is reported apart so
  // the parts always add up to the asset total.
  const assetParts = [
    summary.figureCount > 0 ? pluralize(summary.figureCount, 'figure') : null,
    summary.tableCount > 0 ? pluralize(summary.tableCount, 'table') : null,
    summary.equationAssetCount > 0
      ? pluralize(summary.equationAssetCount, 'equation')
      : null,
    summary.otherAssetCount > 0
      ? pluralize(summary.otherAssetCount, 'other asset')
      : null,
  ].filter((part): part is string => part !== null);

  return (
    <StyledPanel>
      <StyledHeadline>
        This package is already structured, so every part of it is imported as
        it stands.
      </StyledHeadline>
      <StyledCounts>
        {pluralize(summary.sectionCount, 'section')} ·{' '}
        {pluralize(summary.wordCount, 'word')} ·{' '}
        {formatCount(summary.assetCount)} figures/tables ·{' '}
        {pluralize(summary.equationCount, 'equation')} ·{' '}
        {pluralize(summary.referenceCount, 'reference')}
      </StyledCounts>

      <StyledGroups>
        {summary.groups.map((group) => (
          <StyledGroup key={group.placement}>
            <StyledGroupTitle>
              {group.label} — {pluralize(group.sectionCount, 'section')} ·{' '}
              {pluralize(group.wordCount, 'word')}
            </StyledGroupTitle>
            <StyledGroupNames>
              {group.sectionNames.join(' · ')}
            </StyledGroupNames>
          </StyledGroup>
        ))}
      </StyledGroups>

      <StyledFactList>
        <div>
          Assets: {assetParts.length === 0 ? 'none' : assetParts.join(', ')}
          {summary.linkedAssetCount > 0
            ? ` — ${formatCount(summary.linkedAssetCount)} anchored to a section`
            : ''}
        </div>
        {summary.inlineEquationCount === 0 ? null : (
          <div>
            Equations: {pluralize(summary.inlineEquationCount, 'equation')}{' '}
            written inline in the section text
          </div>
        )}
        <div>
          References: {pluralize(summary.referenceCount, 'record')} ·{' '}
          {pluralize(summary.linkedCitationCount, 'citation')} resolved in the
          text
        </div>
      </StyledFactList>

      {summary.exclusions.length === 0 ? null : (
        <StyledNote>
          <StyledNoteTitle>
            All {pluralize(summary.sectionCount, 'section')} are imported.{' '}
            {summary.exclusions.length === 1
              ? 'One of them is'
              : `${formatCount(summary.exclusions.length)} of them are`}{' '}
            kept out of the exported document:
          </StyledNoteTitle>
          <StyledNoteList>
            {summary.exclusions.map((exclusion, exclusionIndex) => (
              // Section names are not unique, so pair the name with its index.
              <li key={`${exclusion.sectionName}-${exclusionIndex}`}>
                <StyledExcludedName>{exclusion.sectionName}</StyledExcludedName>{' '}
                — {exclusion.reason}.
              </li>
            ))}
          </StyledNoteList>
          The content is still saved and editable; only the export rendering
          skips it. You can flip that per section in the composer at any time.
        </StyledNote>
      )}
    </StyledPanel>
  );
};
