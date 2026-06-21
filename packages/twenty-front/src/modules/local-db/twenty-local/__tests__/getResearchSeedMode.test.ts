import { getResearchSeedMode } from '@/local-db/twenty-local/getResearchSeedMode';
import { getTwentyRawPathPrefix } from '@/local-db/twenty-local/getTwentyPublicBasePath';

jest.mock('@/local-db/twenty-local/getTwentyPublicBasePath', () => ({
  getTwentyRawPathPrefix: jest.fn(() => ''),
}));

const mockedGetTwentyRawPathPrefix = jest.mocked(getTwentyRawPathPrefix);

const setUrl = (url: string) => window.history.pushState({}, '', url);

describe('getResearchSeedMode', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockedGetTwentyRawPathPrefix.mockReturnValue('');
    setUrl('/');
  });

  it('defaults to a blank workspace', () => {
    expect(getResearchSeedMode()).toBe('blank');
  });

  it('opts into demo data when visiting /demo and keeps it sticky', () => {
    setUrl('/demo');
    expect(getResearchSeedMode()).toBe('demo');

    // The router rewrites `/demo` off the address bar; the choice must survive.
    setUrl('/');
    expect(getResearchSeedMode()).toBe('demo');
  });

  it('opts into demo data via the ?demo=1 query param', () => {
    setUrl('/?demo=1');
    expect(getResearchSeedMode()).toBe('demo');
  });

  it('matches /demo under a deploy sub-path', () => {
    mockedGetTwentyRawPathPrefix.mockReturnValue('/researcher');
    setUrl('/researcher/demo');
    expect(getResearchSeedMode()).toBe('demo');
  });
});
