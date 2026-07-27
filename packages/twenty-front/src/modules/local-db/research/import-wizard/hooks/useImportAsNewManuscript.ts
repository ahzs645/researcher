import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useOpenManuscriptImportWizard } from '@/local-db/research/import-wizard/hooks/useOpenManuscriptImportWizard';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';

type UseImportAsNewManuscriptParams = {
  // Fired once the wizard closes having actually imported something, with the
  // id of the manuscript that now holds the content.
  onImported: (manuscriptId: string) => void;
  // Fired whenever the manuscript set may have changed (shell created,
  // content committed, shell discarded) so a caller showing a list refreshes.
  onManuscriptsChanged?: () => void;
};

// The importer only ever appends into an existing manuscript, so "import as a
// new paper" has to create the shell record first — and discard it again when
// the user backs out, otherwise every cancelled import leaves an empty
// "Untitled manuscript" behind. Shared by the Compose landing page and the
// Manuscripts record index so both behave identically.
export const useImportAsNewManuscript = ({
  onImported,
  onManuscriptsChanged,
}: UseImportAsNewManuscriptParams) => {
  const { createOneRecord: createManuscriptRecord } = useCreateOneRecord({
    objectNameSingular: 'manuscript',
  });
  const { deleteOneRecord: deleteManuscriptRecord } = useDeleteOneRecord({
    objectNameSingular: 'manuscript',
  });
  const { openManuscriptImportWizard } = useOpenManuscriptImportWizard();
  const [isImportingNewManuscript, setIsImportingNewManuscript] =
    useState(false);

  const startImportAsNewManuscript = async () => {
    if (isImportingNewManuscript) return;
    setIsImportingNewManuscript(true);
    const created = (await createManuscriptRecord({
      name: 'Untitled manuscript',
      status: 'DRAFTING',
    })) as { id?: string } | undefined;
    const newManuscriptId = created?.id;
    if (!isDefined(newManuscriptId)) {
      setIsImportingNewManuscript(false);
      return;
    }
    onManuscriptsChanged?.();

    let didImport = false;
    openManuscriptImportWizard({
      manuscriptId: newManuscriptId,
      manuscriptName: 'Untitled manuscript',
      existingSectionCount: 0,
      existingSections: [],
      existingReferences: [],
      existingFigureRefKeys: [],
      onChanged: () => {
        didImport = true;
        onManuscriptsChanged?.();
      },
      onClosed: () => {
        setIsImportingNewManuscript(false);
        if (didImport) {
          onImported(newManuscriptId);
          return;
        }
        void deleteManuscriptRecord(newManuscriptId).then(() =>
          onManuscriptsChanged?.(),
        );
      },
    });
  };

  return { isImportingNewManuscript, startImportAsNewManuscript };
};
