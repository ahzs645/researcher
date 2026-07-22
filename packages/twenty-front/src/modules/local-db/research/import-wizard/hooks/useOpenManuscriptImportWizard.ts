import { MANUSCRIPT_IMPORT_WIZARD_MODAL_ID } from '@/local-db/research/import-wizard/constants/ManuscriptImportWizardModalId';
import {
  manuscriptImportWizardState,
  type ManuscriptImportWizardOptions,
} from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

export const useOpenManuscriptImportWizard = () => {
  const setManuscriptImportWizard = useSetAtomState(
    manuscriptImportWizardState,
  );
  const { openModal } = useModal();

  const openManuscriptImportWizard = (
    options: ManuscriptImportWizardOptions,
  ) => {
    openModal(MANUSCRIPT_IMPORT_WIZARD_MODAL_ID);
    setManuscriptImportWizard({ isOpen: true, options });
  };

  return { openManuscriptImportWizard };
};
