import { getTwentyDataMode } from '@/local-db/twenty-local/isLocalTwentyDataMode';

export const addTwentyDataBridgeModeToPath = (path: string): string => {
  const mode = getTwentyDataMode();

  if (mode === null || path.length === 0) {
    return path;
  }

  const url = new URL(path, window.location.origin);
  const [, routeKind, objectName] = url.pathname.split('/');
  const isBridgeObjectPath = routeKind === 'objects' && objectName.length > 0;
  const isBridgeRecordPath = routeKind === 'object' && objectName.length > 0;

  if (!isBridgeObjectPath && !isBridgeRecordPath) {
    return path;
  }

  if (mode === 'local') {
    url.searchParams.set('localdb', '1');
    url.searchParams.delete('data');
  } else {
    url.searchParams.set('data', 'convex');
    url.searchParams.delete('localdb');
  }

  return `${url.pathname}${url.search}${url.hash}`;
};
