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

    const isBridgeIndexPath =
      window.location.pathname === '/' ||
      window.location.pathname === '/welcome' ||
      window.location.pathname === '/localdb' ||
      window.location.pathname === '/convex';

    if (isBridgeIndexPath) {
      const target = getTwentyLocalObjectRoutePath({
        dataMode: twentyDataBridgeConfig.mode,
        objectNamePlural: defaultTwentyLocalObjectConfig.objectNamePlural,
      });

      window.history.replaceState(null, '', target);
    }
  }

  root.render(<App />);
};

void renderApp();
