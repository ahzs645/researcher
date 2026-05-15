import { type AppDataMode } from '@/local-db/createDataClient';
import { getTwentyConvexUrl } from '@/local-db/twenty-local/getTwentyConvexUrl';
import { getTwentyDataMode } from '@/local-db/twenty-local/isLocalTwentyDataMode';

export type TwentyDataBridgeConfig = {
  mode: AppDataMode;
  convexUrl?: string;
};

export const getTwentyDataBridgeConfig = (): TwentyDataBridgeConfig | null => {
  const mode = getTwentyDataMode();

  if (mode === null) {
    return null;
  }

  return {
    mode,
    convexUrl: getTwentyConvexUrl(),
  };
};

export const isTwentyDataBridgeConfigured = (
  config: TwentyDataBridgeConfig | null,
): config is TwentyDataBridgeConfig =>
  config !== null &&
  (config.mode === 'local' ||
    (config.convexUrl !== undefined && config.convexUrl.length > 0));
