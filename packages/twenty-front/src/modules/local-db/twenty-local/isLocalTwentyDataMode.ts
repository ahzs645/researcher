export type TwentyDataBridgeMode = 'local' | 'convex';

const TWENTY_DATA_MODE_STORAGE_KEY = 'twenty-data-bridge-mode';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const persistTwentyDataMode = (mode: TwentyDataBridgeMode) => {
  window.sessionStorage.setItem(TWENTY_DATA_MODE_STORAGE_KEY, mode);

  return mode;
};

export const getTwentyDataMode = (): TwentyDataBridgeMode | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const envDataMode = import.meta.env.REACT_APP_DATA_MODE;
  const pathname = window.location.pathname;
  const storedMode = window.sessionStorage.getItem(
    TWENTY_DATA_MODE_STORAGE_KEY,
  );

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

  if (storedMode === 'local' || storedMode === 'convex') {
    return storedMode;
  }

  const isLocalHost = LOCAL_HOSTNAMES.has(window.location.hostname);
  const isOptedOut =
    import.meta.env.REACT_APP_LOCAL_DB_AUTH_BYPASS_DISABLED === 'true';

  if (isLocalHost && !isOptedOut) {
    return persistTwentyDataMode('local');
  }

  return null;
};

export const isTwentyDataBridgeMode = () => getTwentyDataMode() !== null;
