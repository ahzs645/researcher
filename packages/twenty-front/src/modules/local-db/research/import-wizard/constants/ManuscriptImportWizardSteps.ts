export const MANUSCRIPT_IMPORT_WIZARD_STEPS = [
  'upload',
  'map',
  'review',
] as const;

export type ManuscriptImportWizardStep =
  (typeof MANUSCRIPT_IMPORT_WIZARD_STEPS)[number];
