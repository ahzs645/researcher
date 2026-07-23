import { useCallback, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  type ExistingImportReference,
  type PreparedManuscriptImport,
} from '@/local-db/research/manuscript/manuscriptImportPrepare';
import { portableManuscriptRecordUpdate } from '@/local-db/research/manuscript/manuscriptPortableImport';
import { type SubmissionTransposeUpdate } from '@/local-db/research/manuscript/manuscriptSubmissionTranspose';
import { dedupeReferenceDrafts } from '@/local-db/research/manuscript/manuscriptReferenceStore';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type UseManuscriptImportCommitOptions = {
  manuscriptId: string;
  manuscriptName?: string | null;
  existingSectionCount: number;
  existingReferences: ExistingImportReference[];
};

export type ManuscriptImportCreatedCounts = {
  references: number;
  sections: number;
  figures: number;
};

const emptyCreatedCounts = (): ManuscriptImportCreatedCounts => ({
  references: 0,
  sections: 0,
  figures: 0,
});

type ManuscriptMetadataUpdate = {
  name?: string;
  authorLine?: string;
  affiliations?: string;
  correspondingAuthor?: string;
  manuscriptType?: string;
  status?: string;
  targetVenue?: string;
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
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [isCommitting, setIsCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [createdCounts, setCreatedCounts] =
    useState<ManuscriptImportCreatedCounts>(emptyCreatedCounts);
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
      setCreatedCounts(currentCreatedCounts);
      try {
        for (const reference of referencesToCreate) {
          await createReference({ ...reference, manuscriptId });
          currentCreatedCounts = {
            ...currentCreatedCounts,
            references: currentCreatedCounts.references + 1,
          };
          setCreatedCounts(currentCreatedCounts);
        }

        const sectionIdsByOrder = new Map<number, string>();
        for (const section of preparedImport.sections) {
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
            ...(section.wordLimit !== undefined
              ? { wordLimit: section.wordLimit }
              : {}),
          });
          currentCreatedCounts = {
            ...currentCreatedCounts,
            sections: currentCreatedCounts.sections + 1,
          };
          setCreatedCounts(currentCreatedCounts);
          const createdId = (created as { id?: string } | undefined)?.id;
          if (isDefined(createdId)) {
            sectionIdsByOrder.set(section.orderIndex, createdId);
          }
        }

        for (const figure of preparedImport.figures) {
          const {
            sectionOrderIndex,
            sourceLabel: _sourceLabel,
            ...record
          } = figure;
          await createFigure({
            ...record,
            manuscriptId,
            ...(sectionOrderIndex !== undefined &&
            sectionIdsByOrder.has(sectionOrderIndex)
              ? { sectionId: sectionIdsByOrder.get(sectionOrderIndex) }
              : {}),
          });
          currentCreatedCounts = {
            ...currentCreatedCounts,
            figures: currentCreatedCounts.figures + 1,
          };
          setCreatedCounts(currentCreatedCounts);
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
        if (submissionTransposeUpdate !== undefined) {
          Object.assign(manuscriptUpdate, submissionTransposeUpdate);
        }
        if (document.portablePackage !== undefined) {
          Object.assign(
            manuscriptUpdate,
            portableManuscriptRecordUpdate(document.portablePackage),
          );
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
      enqueueSuccessSnackBar,
      existingSectionCount,
      existingReferences,
      failed,
      manuscriptId,
      manuscriptName,
      updateOneRecord,
    ],
  );

  return { commitImport, isCommitting, failed, createdCounts };
};
