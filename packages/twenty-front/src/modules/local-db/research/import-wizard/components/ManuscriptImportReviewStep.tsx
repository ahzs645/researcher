import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useManuscriptImportCommit } from '@/local-db/research/import-wizard/hooks/useManuscriptImportCommit';
import { type ManuscriptImportWizardOptions } from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';
import {
  type ImportedDocument,
  type ImportedSectionDraft,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';
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

const SECTION_TYPES = [
  'TITLE_PAGE',
  'ABSTRACT',
  'KEYWORDS',
  'INTRODUCTION',
  'BACKGROUND',
  'METHODS',
  'RESULTS',
  'DISCUSSION',
  'CONCLUSION',
  'ACKNOWLEDGMENTS',
  'AUTHOR_CONTRIBUTIONS',
  'FUNDING',
  'CONFLICTS',
  'DATA_AVAILABILITY',
  'ETHICS',
  'REFERENCES',
  'APPENDIX',
  'SUPPLEMENT',
  'OTHER',
] as const;

const SECTION_PLACEMENTS = [
  'FRONT_MATTER',
  'MAIN',
  'BACK_MATTER',
  'SUPPLEMENT',
] as const;

const optionLabel = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

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

const StyledSectionRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns:
    minmax(180px, 1fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr)
    auto;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledInclude = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledPreview = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  const preparedImport = useMemo(
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
          <StyledSectionRow key={`${section.orderIndex}-${sectionIndex}`}>
            <StyledInput
              aria-label={`Section ${sectionIndex + 1} name`}
              value={section.name}
              onChange={(event) =>
                updateSection(sectionIndex, { name: event.target.value })
              }
            />
            <StyledSelect
              aria-label={`Section ${sectionIndex + 1} type`}
              value={section.sectionType}
              onChange={(event) =>
                updateSection(sectionIndex, {
                  sectionType: event.target.value,
                })
              }
            >
              {SECTION_TYPES.map((sectionType) => (
                <option key={sectionType} value={sectionType}>
                  {optionLabel(sectionType)}
                </option>
              ))}
            </StyledSelect>
            <StyledSelect
              aria-label={`Section ${sectionIndex + 1} placement`}
              value={section.placement}
              onChange={(event) =>
                updateSection(sectionIndex, {
                  placement: event.target.value,
                })
              }
            >
              {SECTION_PLACEMENTS.map((placement) => (
                <option key={placement} value={placement}>
                  {optionLabel(placement)}
                </option>
              ))}
            </StyledSelect>
            <StyledInclude>
              <input
                type="checkbox"
                checked={section.includeInExport}
                onChange={(event) =>
                  updateSection(sectionIndex, {
                    includeInExport: event.target.checked,
                  })
                }
              />
              Export
            </StyledInclude>
            <StyledPreview>
              {section.wordCount} words ·{' '}
              {section.content.replace(/\s+/g, ' ').slice(0, 180) ||
                'Empty section'}
            </StyledPreview>
          </StyledSectionRow>
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
