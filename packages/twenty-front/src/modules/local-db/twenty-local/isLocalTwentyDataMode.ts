import { type AppDataMode } from '@/local-db/createDataClient';

const TWENTY_DATA_MODE_STORAGE_KEY = 'twenty-data-bridge-mode';

const persistTwentyDataMode = (mode: AppDataMode) => {
  window.sessionStorage.setItem(TWENTY_DATA_MODE_STORAGE_KEY, mode);

  return mode;
};

export const getTwentyDataMode = (): AppDataMode | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const envDataMode = import.meta.env.REACT_APP_DATA_MODE;

  const pathname = window.location.pathname;

  if (
    pathname === '/convex' ||
    pathname.startsWith('/convex/') ||
    searchParams.get('data') === 'convex' ||
    envDataMode === 'convex'
  ) {
    return persistTwentyDataMode('convex');
  }

  if (
    pathname === '/localdb' ||
    pathname.startsWith('/localdb/') ||
    searchParams.get('localdb') === '1' ||
    envDataMode === 'local'
  ) {
    return persistTwentyDataMode('local');
  }

  if (pathname.startsWith('/objects/') || pathname.startsWith('/object/')) {
    const storedMode = window.sessionStorage.getItem(
      TWENTY_DATA_MODE_STORAGE_KEY,
    );

    return storedMode === 'local' || storedMode === 'convex'
      ? storedMode
      : null;
  }

  return null;
};

export const isTwentyDataBridgeMode = () => getTwentyDataMode() !== null;
