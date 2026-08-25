import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportReviewSectionList } from '@/local-db/research/import-wizard/components/ManuscriptImportReviewSectionList';
import { ManuscriptImportSummaryPanel } from '@/local-db/research/import-wizard/components/ManuscriptImportSummaryPanel';
import { useManuscriptImportReviewState } from '@/local-db/research/import-wizard/hooks/useManuscriptImportReviewState';
import { type ManuscriptImportWizardOptions } from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import { hasTransposableSubmissionDeclarations } from '@/local-db/research/manuscript/manuscriptSubmissionTranspose';

type ManuscriptImportReviewStepProps = {
  initialDocument: ImportedDocument;
  sourceName: string;
  reconcile: boolean;
  options: ManuscriptImportWizardOptions;
  onClose: () => void;
  registerCommitState: (isCommitting: boolean) => void;
  onBack: () => void;
};

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 0;
  padding: ${themeCssVariables.spacing[5]};
`;

const StyledHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
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
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledWarnings = styled.div`
  color: ${themeCssVariables.color.orange};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledTranspose = styled.label`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledBody = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 0;
  overflow-y: auto;
`;

const StyledDisclosureButton = styled.button`
  align-items: center;
  align-self: flex-start;
  background: transparent;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  justify-content: space-between;
  padding-top: ${themeCssVariables.spacing[3]};
`;

const StyledFailure = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptImportReviewStep = ({
  initialDocument,
  sourceName,
  reconcile,
  options,
  onClose,
  registerCommitState,
  onBack,
}: ManuscriptImportReviewStepProps) => {
  const [areSectionsExpanded, setAreSectionsExpanded] = useState(false);
  const {
    document,
    preparedImport,
    summary,
    existingMatches,
    importAnywaySectionIndexes,
    transposeDeclarations,
    setTransposeDeclarations,
    updateSection,
    setImportAnyway,
    confirmImport,
    rollbackImport,
    isCommitting,
    failed,
    createdCounts,
  } = useManuscriptImportReviewState({
    initialDocument,
    reconcile,
    options,
    onClose,
    registerCommitState,
  });
  // A portable package was produced by this app, so its classification is
  // already correct — confirm what arrived instead of re-asking for it.
  const isPortable = preparedImport.portable;

  return (
    <StyledContainer>
      <StyledHeader>
        <StyledTitle>
          {isPortable
            ? isCommitting
              ? 'Restoring your research package…'
              : 'Here’s what was restored'
            : 'Review & commit'}
        </StyledTitle>
        <StyledHint>
          {sourceName}
          {document.title === undefined ? '' : ` · ${document.title}`}
        </StyledHint>
        {isPortable ? null : (
          <StyledSummary>
            {preparedImport.sections.length} sections ·{' '}
            {preparedImport.tableCount} tables · {preparedImport.imageCount}{' '}
            figures ·{' '}
            {/* Equations set as layout tables become numbered assets, so the
                source document's own inline-math count is not the total. */}
            {preparedImport.figures.filter(
              (figure) => figure.assetKind === 'EQUATION',
            ).length + (document.stats?.equationCount ?? 0)}{' '}
            equations · {preparedImport.references.length} references ·{' '}
            {preparedImport.linkedCount} linked citations
          </StyledSummary>
        )}
        {(document.warnings ?? []).map((warning) => (
          <StyledWarnings key={warning}>{warning}</StyledWarnings>
        ))}
      </StyledHeader>

      <StyledBody>
        {options.targetJournal !== undefined &&
        hasTransposableSubmissionDeclarations(preparedImport.sections) ? (
          <StyledTranspose>
            <input
              type="checkbox"
              checked={transposeDeclarations}
              onChange={(event) =>
                setTransposeDeclarations(event.target.checked)
              }
            />
            Transpose declarations into{' '}
            {options.targetJournal.name ?? 'the journal'} checklist
          </StyledTranspose>
        ) : null}
        {isPortable ? (
          <>
            <ManuscriptImportSummaryPanel summary={summary} />
            <StyledDisclosureButton
              type="button"
              aria-expanded={areSectionsExpanded}
              onClick={() => setAreSectionsExpanded((expanded) => !expanded)}
            >
              {areSectionsExpanded
                ? 'Hide individual sections'
                : `Review sections individually (${document.sections.length})`}
            </StyledDisclosureButton>
          </>
        ) : null}
        {isPortable && !areSectionsExpanded ? null : (
          <ManuscriptImportReviewSectionList
            sections={document.sections}
            existingMatches={existingMatches}
            importAnywaySectionIndexes={importAnywaySectionIndexes}
            onChangeSection={updateSection}
            onChangeImportAnyway={setImportAnyway}
          />
        )}
      </StyledBody>

      <StyledFooter>
        {failed ? (
          <div>
            <StyledFailure role="alert">
              Import stopped after creating {createdCounts.references}{' '}
              references, {createdCounts.sections} sections, and{' '}
              {createdCounts.figures} figures/tables.
            </StyledFailure>
            <Button
              title={
                isCommitting ? 'Rolling back…' : 'Roll back partial import'
              }
              variant="secondary"
              accent="danger"
              size="small"
              disabled={isCommitting}
              onClick={() => void rollbackImport()}
            />
          </div>
        ) : (
          <StyledSummary>
            {isPortable
              ? isCommitting
                ? 'Restoring sections, assets, references and journal…'
                : 'Restored into this manuscript.'
              : 'Nothing is written until you confirm this import.'}
          </StyledSummary>
        )}
        <div>
          {isPortable ? null : (
            <Button
              title="Back"
              variant="secondary"
              size="small"
              disabled={isCommitting || failed}
              onClick={onBack}
            />
          )}
          {/* A first-party package restores itself; the only button it needs
              is the one that gets you out if the restore fails. */}
          {isPortable && !failed ? (
            <Button
              title={isCommitting ? 'Restoring…' : 'Done'}
              variant="primary"
              accent="blue"
              size="small"
              disabled={isCommitting}
              onClick={onClose}
            />
          ) : (
            <Button
              title={isCommitting ? 'Importing…' : 'Confirm import'}
              variant="primary"
              accent="blue"
              size="small"
              disabled={
                isCommitting || failed || preparedImport.sections.length === 0
              }
              onClick={() => void confirmImport()}
            />
          )}
        </div>
      </StyledFooter>
    </StyledContainer>
  );
};
