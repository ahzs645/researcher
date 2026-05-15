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
    const { startLocalTwentyWorker } = await import(
      '@/local-db/twenty-local/startLocalTwentyWorker'
    );

    await startLocalTwentyWorker();
  }

  root.render(<App />);
};

void renderApp();
