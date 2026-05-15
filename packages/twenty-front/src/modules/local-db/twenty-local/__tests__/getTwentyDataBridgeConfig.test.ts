import {
  getTwentyDataBridgeConfig,
  isTwentyDataBridgeConfigured,
} from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import { getTwentyConvexUrl } from '@/local-db/twenty-local/getTwentyConvexUrl';
import { getTwentyDataMode } from '@/local-db/twenty-local/isLocalTwentyDataMode';

jest.mock('@/local-db/twenty-local/getTwentyConvexUrl', () => ({
  getTwentyConvexUrl: jest.fn(),
}));

jest.mock('@/local-db/twenty-local/isLocalTwentyDataMode', () => ({
  getTwentyDataMode: jest.fn(),
}));

const mockedGetTwentyConvexUrl = jest.mocked(getTwentyConvexUrl);
const mockedGetTwentyDataMode = jest.mocked(getTwentyDataMode);

describe('getTwentyDataBridgeConfig', () => {
  beforeEach(() => {
    mockedGetTwentyConvexUrl.mockReset();
    mockedGetTwentyDataMode.mockReset();
  });

  it('returns null outside bridge mode', () => {
    mockedGetTwentyDataMode.mockReturnValue(null);

    expect(getTwentyDataBridgeConfig()).toBeNull();
  });

  it('returns local mode without requiring a Convex URL', () => {
    mockedGetTwentyDataMode.mockReturnValue('local');
    mockedGetTwentyConvexUrl.mockReturnValue(undefined);

    const config = getTwentyDataBridgeConfig();

    expect(config).toEqual({ mode: 'local', convexUrl: undefined });
    expect(isTwentyDataBridgeConfigured(config)).toBe(true);
  });

  it('returns Convex mode with the resolved Convex URL', () => {
    mockedGetTwentyDataMode.mockReturnValue('convex');
    mockedGetTwentyConvexUrl.mockReturnValue('https://example.convex.cloud');

    const config = getTwentyDataBridgeConfig();

    expect(config).toEqual({
      mode: 'convex',
      convexUrl: 'https://example.convex.cloud',
    });
    expect(isTwentyDataBridgeConfigured(config)).toBe(true);
  });

  it('treats Convex mode without a URL as unconfigured', () => {
    mockedGetTwentyDataMode.mockReturnValue('convex');
    mockedGetTwentyConvexUrl.mockReturnValue(undefined);

    const config = getTwentyDataBridgeConfig();

    expect(config).toEqual({ mode: 'convex', convexUrl: undefined });
    expect(isTwentyDataBridgeConfigured(config)).toBe(false);
  });
});
