import { MANUSCRIPT_IMPORT_WIZARD_MODAL_ID } from '@/local-db/research/import-wizard/constants/ManuscriptImportWizardModalId';
import { type ImportBlockRole } from '@/local-db/research/manuscript/manuscriptImportBlocks';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';

type UseManuscriptImportMapHotkeysProps = {
  moveActiveBlock: (direction: -1 | 1, extendSelection: boolean) => void;
  setHeadingLevel: (level: 1 | 2 | 3) => void;
  setRole: (role: ImportBlockRole) => void;
  toggleExcluded: () => void;
  handleLink: () => void;
  onContinue: () => void;
};

const DISABLE_IN_EDITORS = {
  enableOnFormTags: false,
  enableOnContentEditable: false,
};

export const useManuscriptImportMapHotkeys = ({
  moveActiveBlock,
  setHeadingLevel,
  setRole,
  toggleExcluded,
  handleLink,
  onContinue,
}: UseManuscriptImportMapHotkeysProps) => {
  useHotkeysOnFocusedElement({
    keys: 'down,j',
    callback: () => moveActiveBlock(1, false),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [moveActiveBlock],
  });
  useHotkeysOnFocusedElement({
    keys: 'up,k',
    callback: () => moveActiveBlock(-1, false),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [moveActiveBlock],
  });
  useHotkeysOnFocusedElement({
    keys: 'shift+down,shift+j',
    callback: () => moveActiveBlock(1, true),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [moveActiveBlock],
  });
  useHotkeysOnFocusedElement({
    keys: 'shift+up,shift+k',
    callback: () => moveActiveBlock(-1, true),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [moveActiveBlock],
  });
  useHotkeysOnFocusedElement({
    keys: '1',
    callback: () => setHeadingLevel(1),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [setHeadingLevel],
  });
  useHotkeysOnFocusedElement({
    keys: '2',
    callback: () => setHeadingLevel(2),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [setHeadingLevel],
  });
  useHotkeysOnFocusedElement({
    keys: '3',
    callback: () => setHeadingLevel(3),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [setHeadingLevel],
  });
  useHotkeysOnFocusedElement({
    keys: 'b',
    callback: () => setRole('body'),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [setRole],
  });
  useHotkeysOnFocusedElement({
    keys: 'c',
    callback: () => setRole('caption'),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [setRole],
  });
  useHotkeysOnFocusedElement({
    keys: 'x',
    callback: toggleExcluded,
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [toggleExcluded],
  });
  useHotkeysOnFocusedElement({
    keys: 'e',
    callback: () => setRole('equation'),
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [setRole],
  });
  useHotkeysOnFocusedElement({
    keys: 'l',
    callback: handleLink,
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [handleLink],
  });
  useHotkeysOnFocusedElement({
    keys: 'mod+enter',
    callback: onContinue,
    focusId: MANUSCRIPT_IMPORT_WIZARD_MODAL_ID,
    options: DISABLE_IN_EDITORS,
    dependencies: [onContinue],
  });
};
