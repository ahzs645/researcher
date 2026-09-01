import { useEffect, useMemo, useRef, useState } from 'react';

import { useManuscriptImportCommit } from '@/local-db/research/import-wizard/hooks/useManuscriptImportCommit';
import { type ManuscriptImportWizardOptions } from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';
import { buildManuscriptImportSummary } from '@/local-db/research/import-wizard/utils/buildManuscriptImportSummary';
import {
  type ImportedDocument,
  type ImportedSectionDraft,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { prepareManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';
import { findExistingSectionMatch } from '@/local-db/research/manuscript/manuscriptSectionDedupe';
import { buildSubmissionTransposeUpdate } from '@/local-db/research/manuscript/manuscriptSubmissionTranspose';

type UseManuscriptImportReviewStateProps = {
  initialDocument: ImportedDocument;
  reconcile: boolean;
  options: ManuscriptImportWizardOptions;
  onClose: () => void;
  registerCommitState: (isCommitting: boolean) => void;
};

export const useManuscriptImportReviewState = ({
  initialDocument,
  reconcile,
  options,
  onClose,
  registerCommitState,
}: UseManuscriptImportReviewStateProps) => {
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
  const summary = useMemo(
    () =>
      buildManuscriptImportSummary({
        preparedImport,
        inlineEquationCount: document.stats?.equationCount ?? 0,
      }),
    [document.stats?.equationCount, preparedImport],
  );
  const { commitImport, rollbackImport, isCommitting, failed, createdCounts } =
    useManuscriptImportCommit({
      manuscriptId: options.manuscriptId,
      manuscriptName: options.manuscriptName,
      existingSectionCount: options.existingSectionCount,
      existingReferences: options.existingReferences,
      existingExportStyleOverrides: options.exportStyleOverrides,
      existingJournals: options.existingJournals,
    });

  useEffect(() => {
    registerCommitState(isCommitting);
    return () => registerCommitState(false);
  }, [isCommitting, registerCommitState]);

  // A portable package came out of this app: its sections, assets, references
  // and journal are records we wrote, not a reading of someone's Word file.
  // There is nothing to review, so restore it instead of asking. A JATS
  // article is just as structured but is somebody else's file, so it is
  // shown before anything is written.
  // A latch, not state: it must flip before React can publish a render, or a
  // double-invoked effect restores the package twice.
  // oxlint-disable-next-line twenty/no-state-useref
  const hasStartedRestore = useRef(false);
  const restoresItself =
    preparedImport.portable && preparedImport.autoRestore === true;
  useEffect(() => {
    if (
      !restoresItself ||
      hasStartedRestore.current ||
      isCommitting ||
      failed
    ) {
      return;
    }
    hasStartedRestore.current = true;
    void confirmImport();
    // `confirmImport` closes over the prepared import; re-running on its
    // identity would restore twice.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [restoresItself]);

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

  const confirmImport = async () => {
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
    options.onChanged();
    // A restore closes on the user's own "Done": shutting the wizard the
    // instant the records land leaves them with no statement of what came
    // back. Every other import is confirmed by hand, so closing *is* the
    // acknowledgement.
    if (succeeded && !restoresItself) onClose();
  };

  return {
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
  };
};
