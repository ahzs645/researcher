import { normalizeManuscriptComposerTab } from '@/local-db/research/components/composer/manuscriptComposerTabState';

describe('normalizeManuscriptComposerTab', () => {
  it('keeps known persisted tabs', () => {
    expect(normalizeManuscriptComposerTab('titlePage')).toBe('titlePage');
  });

  it('falls back to Write for an unknown persisted tab', () => {
    expect(normalizeManuscriptComposerTab('old-front-matter-tab')).toBe(
      'write',
    );
  });
});
