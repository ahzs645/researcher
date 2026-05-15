import { createDexieDataClient } from '@/local-db/adapters/dexie/dexieDataClient';
import { createConvexHttpDataClient } from '@/local-db/adapters/convex/convexHttpDataClient';
import { type AppDataClient } from '@/local-db/domain/types';

export type AppDataMode = AppDataClient['mode'];

type CreateDataClientOptions = {
  convexUrl?: string;
};

export const createDataClient = (
  mode: AppDataMode = 'local',
  options: CreateDataClientOptions = {},
): AppDataClient => {
  if (mode === 'convex') {
    if (options.convexUrl === undefined || options.convexUrl.length === 0) {
      throw new Error(
        'REACT_APP_CONVEX_URL or VITE_CONVEX_URL is required for Convex data mode.',
      );
    }

    return createConvexHttpDataClient({ convexUrl: options.convexUrl });
  }

  return createDexieDataClient();
};

export const appDataClient = createDataClient('local');
