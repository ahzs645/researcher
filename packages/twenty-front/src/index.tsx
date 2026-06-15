import ReactDOM from 'react-dom/client';

import { App } from '@/app/components/App';
import {
  getTwentyDataBridgeConfig,
  isTwentyDataBridgeConfigured,
} from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import 'react-loading-skeleton/dist/skeleton.css';
import 'twenty-ui/style.css';
import 'twenty-ui/theme-light.css';
import 'twenty-ui/theme-dark.css';
import './index.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') ?? document.body,
);

const renderApp = async () => {
  const twentyDataBridgeConfig = getTwentyDataBridgeConfig();

  if (isTwentyDataBridgeConfigured(twentyDataBridgeConfig)) {
    const [
      { startLocalTwentyWorker },
      { seedTwentyBridgeAuthState },
      { getTwentyLocalObjectRoutePath, defaultTwentyLocalObjectConfig },
      { ensureBridgeDataSourceSeeded },
    ] = await Promise.all([
      import('@/local-db/twenty-local/startLocalTwentyWorker'),
      import('@/local-db/twenty-local/seedTwentyBridgeAuthState'),
      import('@/local-db/twenty-local/twentyLocalObjectConfigs'),
      import('@/local-db/data-source/buildBridgeDataSource'),
    ]);

    seedTwentyBridgeAuthState();
    await ensureBridgeDataSourceSeeded();
    await startLocalTwentyWorker();

    const { getTwentyRawPathPrefix } = await import(
      '@/local-db/twenty-local/getTwentyPublicBasePath'
    );

    // Strip the deploy sub-path (e.g. `/researcher`) before comparing, since
    // `window.location.pathname` includes it but our route constants don't.
    const rawPathPrefix = getTwentyRawPathPrefix();
    const relativePathname =
      rawPathPrefix.length > 0 &&
      window.location.pathname.startsWith(rawPathPrefix)
        ? window.location.pathname.slice(rawPathPrefix.length) || '/'
        : window.location.pathname;

    const isBridgeIndexPath =
      relativePathname === '/' ||
      relativePathname === '/welcome' ||
      relativePathname === '/localdb' ||
      relativePathname === '/convex';

    if (isBridgeIndexPath) {
      const target = getTwentyLocalObjectRoutePath({
        dataMode: twentyDataBridgeConfig.mode,
        objectNamePlural: defaultTwentyLocalObjectConfig.objectNamePlural,
      });

      // Re-add the sub-path because raw history is not basename-aware.
      window.history.replaceState(null, '', `${rawPathPrefix}${target}`);
    }
  }

  root.render(<App />);
};

void renderApp();
