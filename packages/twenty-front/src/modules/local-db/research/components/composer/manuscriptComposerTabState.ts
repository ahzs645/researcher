import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type ManuscriptComposerTab =
  | 'write'
  | 'titlePage'
  | 'figures'
  | 'references'
  | 'submission'
  | 'export';

const MANUSCRIPT_COMPOSER_TABS: ManuscriptComposerTab[] = [
  'write',
  'titlePage',
  'figures',
  'references',
  'submission',
  'export',
];

export const normalizeManuscriptComposerTab = (
  value: unknown,
): ManuscriptComposerTab =>
  MANUSCRIPT_COMPOSER_TABS.includes(value as ManuscriptComposerTab)
    ? (value as ManuscriptComposerTab)
    : 'write';

export const manuscriptComposerTabState =
  createAtomState<ManuscriptComposerTab>({
    key: 'manuscriptComposerTabState',
    defaultValue: 'write',
    useSessionStorage: true,
  });
