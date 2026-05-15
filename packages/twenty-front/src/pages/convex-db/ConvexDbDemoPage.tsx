import { useMemo } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

import { useConvexDataSnapshot } from '@/local-db/hooks/useConvexDataSnapshot';
import { AppDataDemoPage } from '~/pages/local-db/LocalDbDemoPage';
import '~/pages/local-db/LocalDbDemoPage.css';

const ConvexDbDemoPageContent = () => {
  const workspace = useConvexDataSnapshot();

  return (
    <AppDataDemoPage
      {...workspace}
      eyebrow="Convex live backend"
      resetLabel="Replace with demo data"
      summary="This route uses the same React surface as the Dexie demo, but the AppDataClient is backed by Convex queries and mutations. The UI still uses app-level IDs while Convex keeps its generated _id values internal."
      title="Live Convex research workspace"
    />
  );
};

export const ConvexDbDemoPage = () => {
  const convexUrl = import.meta.env.REACT_APP_CONVEX_URL;
  const convexClient = useMemo(
    () =>
      typeof convexUrl === 'string' && convexUrl.length > 0
        ? new ConvexReactClient(convexUrl)
        : null,
    [convexUrl],
  );

  if (convexClient === null) {
    return (
      <main className="localdb-page">
        <div className="localdb-shell">
          <header className="localdb-header">
            <div>
              <p className="localdb-eyebrow">Convex live backend</p>
              <h1 className="localdb-title">Convex URL required</h1>
              <p className="localdb-summary">
                Set REACT_APP_CONVEX_URL to your Convex deployment URL to use
                the live adapter. The seeded Dexie demo remains available at
                /localdb.
              </p>
            </div>
          </header>
        </div>
      </main>
    );
  }

  return (
    <ConvexProvider client={convexClient}>
      <ConvexDbDemoPageContent />
    </ConvexProvider>
  );
};
