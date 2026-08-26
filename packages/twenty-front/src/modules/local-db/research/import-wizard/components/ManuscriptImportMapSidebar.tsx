import { styled } from '@linaria/react';
import katex from 'katex';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ManuscriptRevisions } from '@/local-db/research/import-wizard/utils/readManuscriptWordRevisions';
import {
  collectImportBlockWarnings,
  countImportBlocksNeedingReview,
  type ImportBlock,
  type ImportBlockOverrides,
  type ImportBlockRole,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';
import { type TrackedChangeResolution } from '@/local-db/research/manuscript/manuscriptDocImport';

type ManuscriptImportMapSidebarProps = {
  blocks: ImportBlock[];
  overrides: ImportBlockOverrides;
  sourceName: string;
  revisions?: ManuscriptRevisions;
  isResolvingTrackedChanges: boolean;
  onTrackedChangesChange: (resolution: TrackedChangeResolution) => void;
  isPreparing: boolean;
  onBack: () => void;
  onContinue: () => void;
};

const TRACKED_CHANGE_CHOICES: {
  resolution: TrackedChangeResolution;
  label: string;
  description: string;
}[] = [
  {
    resolution: 'ACCEPT',
    label: 'Accept changes',
    description: 'Import inserted text and drop deleted text.',
  },
  {
    resolution: 'REJECT',
    label: 'Reject changes',
    description: 'Drop inserted text and restore deleted text.',
  },
];

const StyledSidebar = styled.aside`
  background: ${themeCssVariables.background.secondary};
  border-left: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};

  @media (max-width: 720px) {
    border-left: 0;
    border-top: 1px solid ${themeCssVariables.border.color.medium};
    overflow-y: visible;
  }
`;

const StyledTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  margin: 0 0 ${themeCssVariables.spacing[1]};
`;

const StyledSource = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledSection = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  margin-top: ${themeCssVariables.spacing[4]};
  padding-top: ${themeCssVariables.spacing[3]};
`;

const StyledSectionTitle = styled.h4`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0 0 ${themeCssVariables.spacing[2]};
  text-transform: uppercase;
`;

const StyledOutline = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledOutlineItem = styled.div<{ level: number }>`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  margin-left: ${({ level }) => `${Math.max(level - 1, 0) * 12}px`};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEmpty = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledCounts = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const StyledCount = styled.div`
  background: ${themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledCountValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledChoice = styled.label<{ isDisabled: boolean }>`
  align-items: flex-start;
  color: ${themeCssVariables.font.color.secondary};
  cursor: ${({ isDisabled }) => (isDisabled ? 'wait' : 'pointer')};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[1]} 0;
`;

const StyledChoiceLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledNote = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: 1.4;
  margin-top: ${themeCssVariables.spacing[2]};
`;

const StyledWarnings = styled.ul`
  color: ${themeCssVariables.color.orange};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;
  padding-left: ${themeCssVariables.spacing[4]};
`;

const StyledFooter = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: auto;
  padding-top: ${themeCssVariables.spacing[4]};
`;

const StyledReviewCount = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  text-align: center;
`;

const effectiveRole = (
  block: ImportBlock,
  overrides: ImportBlockOverrides,
): ImportBlockRole => overrides[block.id]?.role ?? block.role;

const equationSource = (markdown: string): string =>
  markdown.trim().replace(/^\$\$/, '').replace(/\$\$$/, '').trim();

const hasInvalidLatex = (markdown: string): boolean => {
  try {
    return katex
      .renderToString(equationSource(markdown), { throwOnError: false })
      .includes('katex-error');
  } catch {
    return true;
  }
};

export const ManuscriptImportMapSidebar = ({
  blocks,
  overrides,
  sourceName,
  revisions,
  isResolvingTrackedChanges,
  onTrackedChangesChange,
  isPreparing,
  onBack,
  onContinue,
}: ManuscriptImportMapSidebarProps) => {
  const activeBlocks = blocks.filter(
    (block) => overrides[block.id]?.excluded !== true,
  );
  const headings = activeBlocks.filter(
    (block) => effectiveRole(block, overrides) === 'heading',
  );
  const counts = activeBlocks.reduce(
    (currentCounts, block) => {
      const role = effectiveRole(block, overrides);
      return { ...currentCounts, [role]: currentCounts[role] + 1 };
    },
    {
      heading: 0,
      body: 0,
      caption: 0,
      image: 0,
      table: 0,
      equation: 0,
    } satisfies Record<ImportBlockRole, number>,
  );
  const links = activeBlocks.filter(
    (block) =>
      effectiveRole(block, overrides) === 'caption' &&
      overrides[block.id]?.linkedAssetBlockId !== undefined,
  ).length;
  const equationWarnings = activeBlocks
    .filter(
      (block) =>
        effectiveRole(block, overrides) === 'equation' &&
        hasInvalidLatex(overrides[block.id]?.markdown ?? block.markdown),
    )
    .map((block) => `Equation ${block.index + 1} has invalid LaTeX.`);
  const warnings = [
    ...collectImportBlockWarnings(blocks, overrides),
    ...equationWarnings,
  ];
  const reviewCount = countImportBlocksNeedingReview(blocks, overrides);
  // A document can carry comments without carrying a single revision, and then
  // there is nothing to accept or reject.
  //
  // Two counts, because they answer different questions. The insertion and
  // deletion tiles are about text, and a formatting-only document would show
  // them as a pair of zeros; the accept/reject choice is about every revision,
  // and a document whose only revisions are formatting still has to be told
  // which side of them to import.
  const textChangeCount =
    (revisions?.summary.insertionCount ?? 0) +
    (revisions?.summary.deletionCount ?? 0);
  const trackedChangeCount =
    textChangeCount + (revisions?.summary.formattingChangeCount ?? 0);

  return (
    <StyledSidebar>
      <StyledTitle>Document structure</StyledTitle>
      <StyledSource title={sourceName}>{sourceName}</StyledSource>

      {revisions === undefined ? null : (
        <StyledSection>
          <StyledSectionTitle>
            {trackedChangeCount > 0 ? 'Tracked changes' : 'Comments'}
          </StyledSectionTitle>
          <StyledCounts>
            {textChangeCount === 0 ? null : (
              <>
                <StyledCount>
                  <StyledCountValue>
                    {revisions.summary.insertionCount}
                  </StyledCountValue>
                  Insertions
                </StyledCount>
                <StyledCount>
                  <StyledCountValue>
                    {revisions.summary.deletionCount}
                  </StyledCountValue>
                  Deletions
                </StyledCount>
              </>
            )}
            {revisions.summary.formattingChangeCount === 0 ? null : (
              <StyledCount>
                <StyledCountValue>
                  {revisions.summary.formattingChangeCount}
                </StyledCountValue>
                Formatting
              </StyledCount>
            )}
            {revisions.summary.commentCount === 0 ? null : (
              <StyledCount>
                <StyledCountValue>
                  {revisions.summary.commentCount}
                </StyledCountValue>
                Comments
              </StyledCount>
            )}
          </StyledCounts>
          {trackedChangeCount === 0
            ? null
            : TRACKED_CHANGE_CHOICES.map((choice) => (
                <StyledChoice
                  key={choice.resolution}
                  isDisabled={isResolvingTrackedChanges}
                >
                  <input
                    type="radio"
                    name="manuscript-import-tracked-changes"
                    value={choice.resolution}
                    checked={revisions.resolution === choice.resolution}
                    disabled={isResolvingTrackedChanges}
                    onChange={() => onTrackedChangesChange(choice.resolution)}
                  />
                  <span>
                    <StyledChoiceLabel>{choice.label}</StyledChoiceLabel>{' '}
                    {choice.description}
                  </span>
                </StyledChoice>
              ))}
          {trackedChangeCount === 0 ? null : (
            <StyledNote>
              {isResolvingTrackedChanges
                ? 'Re-reading the document…'
                : 'Changing this re-reads the document, so the mapping below starts again.'}
            </StyledNote>
          )}
          {revisions.summary.commentCount === 0 ? null : (
            <StyledNote>
              {revisions.summary.commentCount === 1
                ? 'The comment is imported into the notes of the section it sits in.'
                : `All ${revisions.summary.commentCount} comments are imported into the notes of the sections they sit in.`}
            </StyledNote>
          )}
        </StyledSection>
      )}

      <StyledSection>
        <StyledSectionTitle>Heading outline</StyledSectionTitle>
        <StyledOutline>
          {headings.length === 0 ? (
            <StyledEmpty>No headings detected</StyledEmpty>
          ) : (
            headings.map((heading) => (
              <StyledOutlineItem
                key={heading.id}
                level={
                  overrides[heading.id]?.headingLevel ??
                  heading.headingLevel ??
                  2
                }
                title={heading.text}
              >
                {heading.text}
              </StyledOutlineItem>
            ))
          )}
        </StyledOutline>
      </StyledSection>

      <StyledSection>
        <StyledSectionTitle>Detected content</StyledSectionTitle>
        <StyledCounts>
          <StyledCount>
            <StyledCountValue>{counts.image}</StyledCountValue>Figures
          </StyledCount>
          <StyledCount>
            <StyledCountValue>{counts.table}</StyledCountValue>Tables
          </StyledCount>
          <StyledCount>
            <StyledCountValue>{counts.equation}</StyledCountValue>Equations
          </StyledCount>
          <StyledCount>
            <StyledCountValue>{counts.caption}</StyledCountValue>Captions
          </StyledCount>
          <StyledCount>
            <StyledCountValue>{links}</StyledCountValue>Links
          </StyledCount>
          <StyledCount>
            <StyledCountValue>{headings.length}</StyledCountValue>Headings
          </StyledCount>
        </StyledCounts>
      </StyledSection>

      <StyledSection>
        <StyledSectionTitle>Warnings</StyledSectionTitle>
        {warnings.length === 0 ? (
          <StyledEmpty>No structural warnings</StyledEmpty>
        ) : (
          <StyledWarnings>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </StyledWarnings>
        )}
      </StyledSection>

      <StyledFooter>
        <StyledReviewCount>
          {reviewCount} {reviewCount === 1 ? 'block needs' : 'blocks need'}{' '}
          review
        </StyledReviewCount>
        <Button
          title="Back"
          variant="secondary"
          size="small"
          fullWidth
          disabled={isPreparing}
          onClick={onBack}
        />
        <Button
          id="manuscript-import-continue-button"
          title={isPreparing ? 'Preparing review…' : 'Continue'}
          variant="primary"
          accent="blue"
          size="small"
          fullWidth
          disabled={isPreparing || activeBlocks.length === 0}
          onClick={onContinue}
        />
      </StyledFooter>
    </StyledSidebar>
  );
};
