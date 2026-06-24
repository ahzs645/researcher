import Dexie from 'dexie';

import {
  BRIDGE_SYSTEM_DEXIE_NAME,
  closeBridgeSystemDexieForReset,
} from '@/local-db/data-source/bridgeSystemDexie';
import { closeBridgeDataSourceForReset } from '@/local-db/data-source/buildBridgeDataSource';
import { clearResearchSeedMode } from '@/local-db/twenty-local/getResearchSeedMode';
import { getTwentyRawPathPrefix } from '@/local-db/twenty-local/getTwentyPublicBasePath';

// Records Dexie database (kept in sync with `buildBridgeDataSource.ts`).
const BRIDGE_RECORDS_DEXIE_NAME = 'twenty-bridge-data-source';

// `/reset` wipes the local bridge back to a fresh, blank workspace: both Dexie
// databases (records + system) plus the demo-seed opt-in. The first-run persona
// picker then shows again on next boot. Path-triggered to match the app's other
// bridge controls (`/demo`, `/localdb`, `/convex`).
export const isBridgeResetPath = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Strip the deploy sub-path (e.g. `/researcher`) so `/reset` matches under
  // project-site deployments too.
  const rawPathPrefix = getTwentyRawPathPrefix();
  const pathname =
    rawPathPrefix.length > 0 &&
    window.location.pathname.startsWith(rawPathPrefix)
      ? window.location.pathname.slice(rawPathPrefix.length) || '/'
      : window.location.pathname;

  return pathname === '/reset' || pathname.startsWith('/reset/');
};

// Delete both bridge databases and clear the demo flag. Call this before
// anything opens a Dexie connection (i.e. at boot) so the deletes don't block
// on an open handle.
export const resetBridgeWorkspace = async (): Promise<void> => {
  closeBridgeDataSourceForReset();
  closeBridgeSystemDexieForReset();
  await Promise.all([
    Dexie.delete(BRIDGE_RECORDS_DEXIE_NAME),
    Dexie.delete(BRIDGE_SYSTEM_DEXIE_NAME),
  ]);
  clearResearchSeedMode();
};
