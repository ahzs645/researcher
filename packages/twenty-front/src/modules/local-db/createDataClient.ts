import { createDexieDataClient } from '@/local-db/adapters/dexie/dexieDataClient';
import { type AppDataClient } from '@/local-db/domain/types';

export type AppDataMode = AppDataClient['mode'];

export const createDataClient = (
  mode: AppDataMode = 'local',
): AppDataClient => {
  if (mode === 'convex') {
    throw new Error(
      'ConvexDataClient is React-backed. Use useConvexDataSnapshot so Convex queries and mutations stay reactive.',
    );
  }

  return createDexieDataClient();
};

export const appDataClient = createDataClient('local');
