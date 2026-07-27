import {
  buildManuscriptComposerPath,
  getManuscriptComposerPathForRecord,
  RESEARCH_COMPOSE_PATH,
} from '@/local-db/research/manuscriptComposerRoute';

describe('manuscript composer route', () => {
  it('builds the composer deep link the composer already reads', () => {
    expect(buildManuscriptComposerPath('abc-123')).toBe(
      '/compose?manuscript=abc-123',
    );
    expect(RESEARCH_COMPOSE_PATH).toBe('/compose');
  });

  it('escapes ids so a stray character cannot break the query string', () => {
    expect(buildManuscriptComposerPath('a b&c')).toBe(
      '/compose?manuscript=a%20b%26c',
    );
  });

  it('re-routes the Open action for manuscripts only', () => {
    expect(
      getManuscriptComposerPathForRecord({
        objectNameSingular: 'manuscript',
        recordId: 'm-1',
      }),
    ).toBe('/compose?manuscript=m-1');
  });

  it('leaves every other object on the standard record page', () => {
    for (const objectNameSingular of [
      'manuscriptSection',
      'project',
      'person',
      'grant',
    ]) {
      expect(
        getManuscriptComposerPathForRecord({
          objectNameSingular,
          recordId: 'r-1',
        }),
      ).toBeNull();
    }
  });
});
