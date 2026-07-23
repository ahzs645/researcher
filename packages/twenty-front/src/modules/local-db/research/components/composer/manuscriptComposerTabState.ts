import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type ManuscriptComposerTab =
  | 'write'
  | 'titlePage'
  | 'figures'
  | 'references'
  | 'submission'
  | 'export';

export const manuscriptComposerTabState =
  createAtomState<ManuscriptComposerTab>({
    key: 'manuscriptComposerTabState',
    defaultValue: 'write',
  });
