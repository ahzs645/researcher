import { getTwentyBridgeSecret } from '@/local-db/twenty-local/getTwentyBridgeSecret';
import { getTwentyConvexUrl } from '@/local-db/twenty-local/getTwentyConvexUrl';
import {
  getTwentyDataMode,
  type TwentyDataBridgeMode,
} from '@/local-db/twenty-local/isLocalTwentyDataMode';

export type TwentyDataBridgeConfig = {
  mode: TwentyDataBridgeMode;
  convexUrl?: string;
};

export const getTwentyDataBridgeConfig = (): TwentyDataBridgeConfig | null => {
  const mode = getTwentyDataMode();

  if (mode === null) {
    return null;
  }

  // Resolve the bridge token here too so the URL-param value gets persisted
  // into sessionStorage before React Router rewrites `?bridgeToken=…` off the
  // address bar. The fetcher reads it back via `getTwentyBridgeSecret`.
  getTwentyBridgeSecret();

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
