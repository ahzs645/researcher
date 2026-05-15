import { localTwentyGraphqlMocks } from '@/local-db/twenty-local/localTwentyGraphqlMocks';

let workerPromise: Promise<void> | undefined;

export const startLocalTwentyWorker = async () => {
  if (workerPromise !== undefined) {
    return workerPromise;
  }

  workerPromise = import('msw/browser').then(async ({ setupWorker }) => {
    const worker = setupWorker(...localTwentyGraphqlMocks.handlers);

    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    });
  });

  return workerPromise;
};
