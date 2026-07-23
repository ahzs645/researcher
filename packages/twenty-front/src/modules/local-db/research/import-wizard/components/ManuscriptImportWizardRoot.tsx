import React from 'react';

import { MANUSCRIPT_IMPORT_WIZARD_MODAL_ID } from '@/local-db/research/import-wizard/constants/ManuscriptImportWizardModalId';
import { manuscriptImportWizardState } from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

const ManuscriptImportWizard = React.lazy(() =>
  import('./ManuscriptImportWizard').then((module) => ({
    default: module.ManuscriptImportWizard,
  })),
);

export const ManuscriptImportWizardRoot = () => {
  const [manuscriptImportWizard, setManuscriptImportWizard] = useAtomState(
    manuscriptImportWizardState,
  );
  const { closeModal } = useModal();

  const handleClose = () => {
    setManuscriptImportWizard({ isOpen: false, options: null });
    closeModal(MANUSCRIPT_IMPORT_WIZARD_MODAL_ID);
  };

  if (!manuscriptImportWizard.isOpen || manuscriptImportWizard.options === null)
    return null;

  return (
    <React.Suspense fallback={null}>
      <ManuscriptImportWizard
        options={manuscriptImportWizard.options}
        onClose={handleClose}
      />
    </React.Suspense>
  );
};
