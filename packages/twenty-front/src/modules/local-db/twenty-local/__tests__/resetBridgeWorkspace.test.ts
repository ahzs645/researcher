import Dexie from 'dexie';

import {
  isBridgeResetPath,
  resetBridgeWorkspace,
} from '@/local-db/twenty-local/resetBridgeWorkspace';
import { getTwentyRawPathPrefix } from '@/local-db/twenty-local/getTwentyPublicBasePath';

jest.mock('@/local-db/twenty-local/getTwentyPublicBasePath', () => ({
  getTwentyRawPathPrefix: jest.fn(() => ''),
}));

const mockedGetTwentyRawPathPrefix = jest.mocked(getTwentyRawPathPrefix);

const setUrl = (url: string) => window.history.pushState({}, '', url);

describe('isBridgeResetPath', () => {
  beforeEach(() => {
    mockedGetTwentyRawPathPrefix.mockReturnValue('');
    setUrl('/');
  });

  it('is false for a normal path', () => {
    expect(isBridgeResetPath()).toBe(false);
  });

  it('matches /reset and nested paths', () => {
    setUrl('/reset');
    expect(isBridgeResetPath()).toBe(true);
    setUrl('/reset/anything');
    expect(isBridgeResetPath()).toBe(true);
  });

  it('matches /reset under a deploy sub-path', () => {
    mockedGetTwentyRawPathPrefix.mockReturnValue('/researcher');
    setUrl('/researcher/reset');
    expect(isBridgeResetPath()).toBe(true);
  });
});

describe('resetBridgeWorkspace', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('deletes both bridge databases and clears the demo opt-in', async () => {
    const deleteSpy = jest
      .spyOn(Dexie, 'delete')
      .mockResolvedValue(undefined as never);
    window.sessionStorage.setItem('research-seed-mode', 'demo');

    await resetBridgeWorkspace();

    expect(deleteSpy).toHaveBeenCalledWith('twenty-bridge-data-source');
    expect(deleteSpy).toHaveBeenCalledWith('twenty-bridge-system-data-source');
    expect(window.sessionStorage.getItem('research-seed-mode')).toBeNull();

    deleteSpy.mockRestore();
  });
});
