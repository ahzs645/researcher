import { getTwentyPublicBasePath } from '@/local-db/twenty-local/getTwentyPublicBasePath';
import { localTwentyGraphqlMocks } from '@/local-db/twenty-local/localTwentyGraphqlMocks';

let workerPromise: Promise<void> | undefined;

export const startLocalTwentyWorker = async () => {
  if (workerPromise !== undefined) {
    return workerPromise;
  }

  workerPromise = import('msw/browser').then(async ({ setupWorker }) => {
    const worker = setupWorker(...localTwentyGraphqlMocks.handlers);

    // Serve the worker from the public base path so its registration scope
    // matches the deployed sub-path (e.g. `/researcher/` on GitHub Pages).
    // Scope covers every app page, so MSW still intercepts same-origin and
    // cross-origin fetches initiated by those pages.
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: `${getTwentyPublicBasePath()}mockServiceWorker.js`,
      },
    });
  });

  return workerPromise;
};
