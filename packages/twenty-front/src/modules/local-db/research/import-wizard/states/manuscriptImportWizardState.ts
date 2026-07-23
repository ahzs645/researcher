import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { type ExistingImportReference } from '@/local-db/research/manuscript/manuscriptImportPrepare';
import { type ExistingSectionShape } from '@/local-db/research/manuscript/manuscriptSectionDedupe';
import { type SubmissionRequirementTemplate } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type ManuscriptImportWizardOptions = {
  manuscriptId: string;
  manuscriptName?: string | null;
  existingSectionCount: number;
  existingSections: ExistingSectionShape[];
  existingReferences: ExistingImportReference[];
  existingFigureRefKeys: string[];
  onChanged: () => void;
  exportTableStyle?: ManuscriptTableStyle;
  targetJournal?: SubmissionRequirementTemplate & { name?: string | null };
  submissionExtras?: string | null;
  competingInterests?: string | null;
};

export type ManuscriptImportWizardState = {
  isOpen: boolean;
  options: ManuscriptImportWizardOptions | null;
};

export const manuscriptImportWizardState =
  createAtomState<ManuscriptImportWizardState>({
    key: 'manuscriptImportWizardState',
    defaultValue: {
      isOpen: false,
      options: null,
    },
  });
