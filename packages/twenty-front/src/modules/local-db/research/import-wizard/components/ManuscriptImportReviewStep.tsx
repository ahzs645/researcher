import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportReviewSectionRow } from '@/local-db/research/import-wizard/components/ManuscriptImportReviewSectionRow';
import { useManuscriptImportCommit } from '@/local-db/research/import-wizard/hooks/useManuscriptImportCommit';
import { type ManuscriptImportWizardOptions } from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';
import {
  type ImportedDocument,
  type ImportedSectionDraft,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';
import { findExistingSectionMatch } from '@/local-db/research/manuscript/manuscriptSectionDedupe';
import {
  buildSubmissionTransposeUpdate,
  hasTransposableSubmissionDeclarations,
} from '@/local-db/research/manuscript/manuscriptSubmissionTranspose';

type ManuscriptImportReviewStepProps = {
  initialDocument: ImportedDocument;
  sourceName: string;
  reconcile: boolean;
  options: ManuscriptImportWizardOptions;
  onClose: () => void;
  registerCommitState: (isCommitting: boolean) => void;
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

const StyledSectionList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-height: 0;
  overflow-y: auto;
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
}: ManuscriptImportReviewStepProps) => {
  const [document, setDocument] = useState(initialDocument);
  const [transposeDeclarations, setTransposeDeclarations] = useState(true);
  const [importAnywaySectionIndexes, setImportAnywaySectionIndexes] = useState(
    () => new Set<number>(),
  );
  const basePreparedImport = useMemo(
    () =>
      prepareManuscriptImport(document, reconcile, {
        existingReferences: options.existingReferences,
        existingFigureRefKeys: options.existingFigureRefKeys,
      }),
    [
      document,
      options.existingFigureRefKeys,
      options.existingReferences,
      reconcile,
    ],
  );
  const existingMatches = useMemo(
    () =>
      basePreparedImport.sections.map((section) =>
        findExistingSectionMatch(section, options.existingSections),
      ),
    [basePreparedImport.sections, options.existingSections],
  );
  const preparedImport = useMemo(
    () => ({
      ...basePreparedImport,
      sections: basePreparedImport.sections
        .map((section, sectionIndex) =>
          existingMatches[sectionIndex]?.similarity === 'identical'
            ? { ...section, includeInExport: false }
            : section,
        )
        .filter(
          (_, sectionIndex) =>
            existingMatches[sectionIndex]?.similarity !== 'identical' ||
            importAnywaySectionIndexes.has(sectionIndex),
        ),
    }),
    [basePreparedImport, existingMatches, importAnywaySectionIndexes],
  );
  const { commitImport, isCommitting, failed, createdCounts } =
    useManuscriptImportCommit({
      manuscriptId: options.manuscriptId,
      manuscriptName: options.manuscriptName,
      existingSectionCount: options.existingSectionCount,
      existingReferences: options.existingReferences,
    });

  useEffect(() => {
    registerCommitState(isCommitting);
    return () => registerCommitState(false);
  }, [isCommitting, registerCommitState]);

  const updateSection = (
    sectionIndex: number,
    update: Partial<ImportedSectionDraft>,
  ) => {
    setDocument((current) => ({
      ...current,
      sections: current.sections.map((section, currentIndex) =>
        currentIndex === sectionIndex ? { ...section, ...update } : section,
      ),
    }));
  };

  const setImportAnyway = (sectionIndex: number, importAnyway: boolean) => {
    setImportAnywaySectionIndexes((current) => {
      const next = new Set(current);
      if (importAnyway) next.add(sectionIndex);
      else next.delete(sectionIndex);
      return next;
    });
  };

  const handleConfirm = async () => {
    const submissionTransposeUpdate =
      transposeDeclarations && options.targetJournal !== undefined
        ? buildSubmissionTransposeUpdate({
            sections: preparedImport.sections,
            template: options.targetJournal,
            manuscript: {
              competingInterests: options.competingInterests,
              submissionExtras: options.submissionExtras,
            },
          })
        : undefined;
    const succeeded = await commitImport(
      document,
      preparedImport,
      submissionTransposeUpdate,
    );
    if (!succeeded) {
      options.onChanged();
      return;
    }
    options.onChanged();
    onClose();
  };

  return (
    <StyledContainer>
      <StyledHeader>
        <StyledTitle>Review &amp; commit</StyledTitle>
        <StyledHint>
          {sourceName}
          {document.title === undefined ? '' : ` · ${document.title}`}
        </StyledHint>
        <StyledSummary>
          {preparedImport.sections.length} sections ·{' '}
          {preparedImport.tableCount} tables · {preparedImport.imageCount}{' '}
          figures · {document.stats?.equationCount ?? 0} equations ·{' '}
          {preparedImport.references.length} references ·{' '}
          {preparedImport.linkedCount} linked citations
        </StyledSummary>
        {(document.warnings ?? []).map((warning) => (
          <StyledWarnings key={warning}>{warning}</StyledWarnings>
        ))}
      </StyledHeader>

      <StyledSectionList>
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
        {document.sections.map((section, sectionIndex) => (
          <ManuscriptImportReviewSectionRow
            key={`${section.orderIndex}-${sectionIndex}`}
            section={section}
            sectionIndex={sectionIndex}
            existingMatch={existingMatches[sectionIndex]}
            importAnyway={importAnywaySectionIndexes.has(sectionIndex)}
            onChange={(update) => updateSection(sectionIndex, update)}
            onChangeImportAnyway={(importAnyway) =>
              setImportAnyway(sectionIndex, importAnyway)
            }
          />
        ))}
      </StyledSectionList>

      <StyledFooter>
        {failed ? (
          <StyledFailure>
            Import stopped after creating {createdCounts.references} references,{' '}
            {createdCounts.sections} sections, and {createdCounts.figures}{' '}
            figures/tables. Close this wizard before trying again.
          </StyledFailure>
        ) : (
          <StyledSummary>
            Nothing is written until you confirm this import.
          </StyledSummary>
        )}
        <Button
          title={isCommitting ? 'Importing…' : 'Confirm import'}
          variant="primary"
          accent="blue"
          size="small"
          disabled={
            isCommitting || failed || preparedImport.sections.length === 0
          }
          onClick={() => void handleConfirm()}
        />
      </StyledFooter>
    </StyledContainer>
  );
};
