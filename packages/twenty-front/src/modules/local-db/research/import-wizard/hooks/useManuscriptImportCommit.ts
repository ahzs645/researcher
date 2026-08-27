import { useCallback, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { manuscriptImportedSectionNotes } from '@/local-db/research/manuscript/manuscriptComments';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  type ExistingImportReference,
  type PreparedManuscriptImport,
} from '@/local-db/research/manuscript/manuscriptImportPrepare';
import {
  matchPortableJournalTemplate,
  portableManuscriptRecordUpdate,
  portableSectionVariantUpdates,
} from '@/local-db/research/manuscript/manuscriptPortableImport';
import { type SubmissionTransposeUpdate } from '@/local-db/research/manuscript/manuscriptSubmissionTranspose';
import { withImportedSourceStyles } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { serializeManuscriptTitlePageExtraLines } from '@/local-db/research/manuscript/manuscriptTitlePage';
import { dedupeReferenceDrafts } from '@/local-db/research/manuscript/manuscriptReferenceStore';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type UseManuscriptImportCommitOptions = {
  manuscriptId: string;
  manuscriptName?: string | null;
  existingSectionCount: number;
  existingReferences: ExistingImportReference[];
  // What the manuscript already carries, so an imported document's own Word
  // styles are adopted without overwriting a template the author picked.
  existingExportStyleOverrides?: string | null;
  // The workspace's journal templates, so a package that carries its own can
  // be linked to the one already here instead of duplicating it.
  existingJournals?: ExistingJournalTemplate[];
};

export type ExistingJournalTemplate = {
  id: string;
  name?: string | null;
  profileKey?: string | null;
};

export type ManuscriptImportCreatedCounts = {
  references: number;
  sections: number;
  figures: number;
};

type ManuscriptImportCreatedRecords = {
  references: string[];
  sections: string[];
  figures: string[];
};

const emptyCreatedRecords = (): ManuscriptImportCreatedRecords => ({
  references: [],
  sections: [],
  figures: [],
});

const emptyCreatedCounts = (): ManuscriptImportCreatedCounts => ({
  references: 0,
  sections: 0,
  figures: 0,
});

type ManuscriptMetadataUpdate = {
  name?: string;
  authorLine?: string;
  affiliations?: string;
  titlePageExtraLines?: string;
  correspondingAuthor?: string;
  manuscriptType?: string;
  status?: string;
  targetVenue?: string;
  targetJournalId?: string;
  doi?: string;
  supplementTitle?: string;
  supplementAuthorLine?: string;
  supplementAffiliations?: string;
  exportStyleOverrides?: string;
  coverLetter?: string;
  highlights?: string;
  competingInterests?: string;
  suggestedReviewers?: string;
  submissionExtras?: string;
};

const UNTITLED = /^untitled/i;

export const useManuscriptImportCommit = ({
  manuscriptId,
  manuscriptName,
  existingSectionCount,
  existingReferences,
  existingExportStyleOverrides,
  existingJournals,
}: UseManuscriptImportCommitOptions) => {
  const { createOneRecord: createSection } = useCreateOneRecord({
    objectNameSingular: 'manuscriptSection',
  });
  const { createOneRecord: createReference } = useCreateOneRecord({
    objectNameSingular: 'reference',
  });
  const { createOneRecord: createFigure } = useCreateOneRecord({
    objectNameSingular: 'figure',
  });
  const { createOneRecord: createJournalTemplate } = useCreateOneRecord({
    objectNameSingular: 'journalTemplate',
  });
  const { deleteOneRecord: deleteSection } = useDeleteOneRecord({
    objectNameSingular: 'manuscriptSection',
  });
  const { deleteOneRecord: deleteReference } = useDeleteOneRecord({
    objectNameSingular: 'reference',
  });
  const { deleteOneRecord: deleteFigure } = useDeleteOneRecord({
    objectNameSingular: 'figure',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [isCommitting, setIsCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [createdCounts, setCreatedCounts] =
    useState<ManuscriptImportCreatedCounts>(emptyCreatedCounts);
  const [createdRecords, setCreatedRecords] =
    useState<ManuscriptImportCreatedRecords>(emptyCreatedRecords);
  // The mutex must update synchronously before React can publish state.
  // oxlint-disable-next-line twenty/no-state-useref
  const commitMutexRef = useRef(false);

  const commitImport = useCallback(
    async (
      document: ImportedDocument,
      preparedImport: PreparedManuscriptImport,
      submissionTransposeUpdate?: SubmissionTransposeUpdate,
    ): Promise<boolean> => {
      if (commitMutexRef.current || failed) return false;
      const totalSectionCount = preparedImport.sections.length;
      if (totalSectionCount === 0) {
        enqueueErrorSnackBar({
          message:
            'No sections found — add headings (e.g. ## Methods) and retry',
        });
        return false;
      }
      const { added: referencesToCreate } = dedupeReferenceDrafts(
        existingReferences,
        preparedImport.references,
      );

      commitMutexRef.current = true;
      setIsCommitting(true);
      let currentCreatedCounts = emptyCreatedCounts();
      const currentCreatedRecords = emptyCreatedRecords();
      setCreatedCounts(currentCreatedCounts);
      setCreatedRecords(currentCreatedRecords);
      try {
        for (const reference of referencesToCreate) {
          const created = await createReference({ ...reference, manuscriptId });
          const createdId = (created as { id?: string } | undefined)?.id;
          if (isDefined(createdId))
            currentCreatedRecords.references.push(createdId);
          currentCreatedCounts = {
            ...currentCreatedCounts,
            references: currentCreatedCounts.references + 1,
          };
          setCreatedCounts(currentCreatedCounts);
          setCreatedRecords({
            ...currentCreatedRecords,
            references: [...currentCreatedRecords.references],
          });
        }

        const sectionIdsByOrder = new Map<number, string>();
        for (const section of preparedImport.sections) {
          const sectionNotes = manuscriptImportedSectionNotes(section);
          const created = await createSection({
            name: section.name,
            manuscriptId,
            sectionType: section.sectionType,
            placement: section.placement,
            content: section.content,
            orderIndex: existingSectionCount + section.orderIndex,
            level: section.level ?? 1,
            wordCount: section.wordCount,
            includeInExport:
              section.sectionType === 'REFERENCES' &&
              referencesToCreate.length > 0
                ? false
                : section.includeInExport,
            status: section.status ?? 'DRAFTING',
            // The key an in-text `[#sec:…]` points at, when the source
            // carried one — without it the references restore as dangling.
            ...(section.refKey === undefined ? {} : { refKey: section.refKey }),
            ...(section.wordLimit !== undefined
              ? { wordLimit: section.wordLimit }
              : {}),
            // A reviewer's comments have no record of their own; the section's
            // notes are where they survive the import — and where an answer to
            // one is written, which is why a package's notes come back whole
            // rather than being re-rendered from the comments alone.
            ...(sectionNotes === undefined ? {} : { notes: sectionNotes }),
          });
          currentCreatedCounts = {
            ...currentCreatedCounts,
            sections: currentCreatedCounts.sections + 1,
          };
          setCreatedCounts(currentCreatedCounts);
          const createdId = (created as { id?: string } | undefined)?.id;
          if (isDefined(createdId)) {
            sectionIdsByOrder.set(section.orderIndex, createdId);
            currentCreatedRecords.sections.push(createdId);
          }
          setCreatedRecords({
            ...currentCreatedRecords,
            sections: [...currentCreatedRecords.sections],
          });
        }

        // A version has to wait for its base to exist before it can point at
        // it, so the link is written after every section is created rather
        // than in the loop above.
        // Only a portable package carries versions, and `preparedImport` is a
        // union of the two import shapes, so the branch is narrowed here
        // rather than asserted.
        for (const update of portableSectionVariantUpdates(
          'sectionVariants' in preparedImport
            ? (preparedImport.sectionVariants ?? [])
            : [],
          sectionIdsByOrder,
        )) {
          await updateOneRecord({
            objectNameSingular: 'manuscriptSection',
            idToUpdate: update.sectionId,
            updateOneRecordInput: {
              variantOfId: update.variantOfId,
              ...(update.variantRules !== undefined
                ? { variantRules: update.variantRules }
                : {}),
              ...(update.variantProfileKey !== undefined
                ? { variantProfileKey: update.variantProfileKey }
                : {}),
            },
          });
        }

        const figureIdsByOrder = new Map<number, string>();
        const panelParentOrderById = new Map<string, number>();
        for (const figure of preparedImport.figures) {
          const { sectionOrderIndex, parentOrderIndex, ...record } = figure;
          const created = await createFigure({
            ...record,
            manuscriptId,
            ...(sectionOrderIndex !== undefined &&
            sectionIdsByOrder.has(sectionOrderIndex)
              ? { sectionId: sectionIdsByOrder.get(sectionOrderIndex) }
              : {}),
          });
          const createdId = (created as { id?: string } | undefined)?.id;
          if (isDefined(createdId)) {
            currentCreatedRecords.figures.push(createdId);
            figureIdsByOrder.set(figure.orderIndex, createdId);
            if (parentOrderIndex !== undefined) {
              panelParentOrderById.set(createdId, parentOrderIndex);
            }
          }
          currentCreatedCounts = {
            ...currentCreatedCounts,
            figures: currentCreatedCounts.figures + 1,
          };
          setCreatedCounts(currentCreatedCounts);
          setCreatedRecords({
            ...currentCreatedRecords,
            figures: [...currentCreatedRecords.figures],
          });
        }

        // A panel has to wait for its parent to exist before it can point at
        // it — the same two-step the section versions above take, and for the
        // same reason: neither record has an id until it is created.
        for (const [figureId, parentOrderIndex] of panelParentOrderById) {
          const parentFigureId = figureIdsByOrder.get(parentOrderIndex);
          if (!isDefined(parentFigureId) || parentFigureId === figureId) {
            continue;
          }
          await updateOneRecord({
            objectNameSingular: 'figure',
            idToUpdate: figureId,
            updateOneRecordInput: { parentFigureId },
          });
        }

        const manuscriptUpdate: ManuscriptMetadataUpdate = {};
        if (
          isDefined(document.title) &&
          (!isDefined(manuscriptName) || UNTITLED.test(manuscriptName ?? ''))
        ) {
          manuscriptUpdate.name = document.title;
        }
        if (isDefined(document.authorLine)) {
          manuscriptUpdate.authorLine = document.authorLine;
        }
        if (isDefined(document.affiliations)) {
          manuscriptUpdate.affiliations = document.affiliations;
        }
        if (isDefined(document.correspondingAuthor)) {
          manuscriptUpdate.correspondingAuthor = document.correspondingAuthor;
        }
        if (isDefined(document.titlePageExtraLines)) {
          manuscriptUpdate.titlePageExtraLines =
            serializeManuscriptTitlePageExtraLines(
              document.titlePageExtraLines,
            );
        }
        // The source .docx's own styles become the export style base, so the
        // file this manuscript exports looks like the file it came from.
        const importedStyles = withImportedSourceStyles(
          existingExportStyleOverrides,
          document.sourceStylesXml,
          document.sourceDocumentName,
        );
        if (importedStyles !== undefined) {
          manuscriptUpdate.exportStyleOverrides = importedStyles;
        }
        if (submissionTransposeUpdate !== undefined) {
          Object.assign(manuscriptUpdate, submissionTransposeUpdate);
        }
        if (document.portablePackage !== undefined) {
          Object.assign(
            manuscriptUpdate,
            portableManuscriptRecordUpdate(document.portablePackage),
          );
          // A first-party package names the template the paper is written
          // against. Link the one this workspace already has, or create it —
          // otherwise the restored paper is formatted by whichever profile
          // happens to be listed first.
          const portableJournal = document.portablePackage.journal;
          if (portableJournal !== undefined) {
            const matched = matchPortableJournalTemplate(
              portableJournal,
              existingJournals ?? [],
            );
            if (matched !== undefined) {
              manuscriptUpdate.targetJournalId = matched.id;
            } else {
              const created = await createJournalTemplate(
                portableJournal as unknown as Record<string, unknown>,
              );
              if (isDefined(created?.id)) {
                manuscriptUpdate.targetJournalId = created.id;
              }
            }
          }
        }
        if (Object.keys(manuscriptUpdate).length > 0) {
          await updateOneRecord({
            objectNameSingular: 'manuscript',
            idToUpdate: manuscriptId,
            updateOneRecordInput: manuscriptUpdate,
          });
        }

        enqueueSuccessSnackBar({
          message: `${preparedImport.portable ? 'Reconstructed' : 'Imported'} ${totalSectionCount} sections · ${referencesToCreate.length} references · ${preparedImport.linkedCount} citations · ${preparedImport.linkedAssetCount} figure/table links · ${preparedImport.figures.length} figures/tables`,
        });
        return true;
      } catch (error) {
        setFailed(true);
        // Surface the underlying cause — a silent catch made record-validation
        // failures (e.g. invalid SELECT values) undiagnosable from the UI.
        // eslint-disable-next-line no-console
        console.error('Manuscript import commit failed:', error);
        enqueueErrorSnackBar({
          message: `Import failed after creating ${currentCreatedCounts.references} of ${referencesToCreate.length} references, ${currentCreatedCounts.sections} of ${totalSectionCount} sections, and ${currentCreatedCounts.figures} of ${preparedImport.figures.length} figures/tables. ${error instanceof Error ? error.message : ''}`,
        });
        return false;
      } finally {
        commitMutexRef.current = false;
        setIsCommitting(false);
      }
    },
    [
      createFigure,
      createReference,
      createSection,
      enqueueErrorSnackBar,
      createJournalTemplate,
      enqueueSuccessSnackBar,
      existingExportStyleOverrides,
      existingJournals,
      existingSectionCount,
      existingReferences,
      failed,
      manuscriptId,
      manuscriptName,
      updateOneRecord,
    ],
  );

  const rollbackImport = useCallback(async (): Promise<boolean> => {
    if (commitMutexRef.current || !failed) return false;
    commitMutexRef.current = true;
    setIsCommitting(true);
    try {
      for (const figureId of [...createdRecords.figures].reverse()) {
        await deleteFigure(figureId);
      }
      for (const sectionId of [...createdRecords.sections].reverse()) {
        await deleteSection(sectionId);
      }
      for (const referenceId of [...createdRecords.references].reverse()) {
        await deleteReference(referenceId);
      }
      setCreatedRecords(emptyCreatedRecords());
      setCreatedCounts(emptyCreatedCounts());
      setFailed(false);
      enqueueSuccessSnackBar({
        message: 'Partial import rolled back — you can safely retry',
      });
      return true;
    } catch (error) {
      enqueueErrorSnackBar({
        message: `Could not completely roll back the partial import${error instanceof Error ? `: ${error.message}` : ''}`,
      });
      return false;
    } finally {
      commitMutexRef.current = false;
      setIsCommitting(false);
    }
  }, [
    createdRecords,
    deleteFigure,
    deleteReference,
    deleteSection,
    enqueueErrorSnackBar,
    enqueueSuccessSnackBar,
    failed,
  ]);

  return {
    commitImport,
    rollbackImport,
    isCommitting,
    failed,
    createdCounts,
  };
};
