// Shared secret the bridge frontend sends with every Convex HTTP action
// request, matched against `BRIDGE_SHARED_SECRET` on the Convex side
// (`convex/bridgeAuth.ts`).
//
// Resolution order mirrors `getTwentyConvexUrl`:
//   1. `?bridgeToken=…` URL param (persisted into sessionStorage)
//   2. previously-persisted sessionStorage value
//
// Returning `undefined` means "no token configured" — the Convex side
// allows unauthenticated requests in that case (first-boot dev), so the
// bridge degrades gracefully rather than locking the user out.

const STORAGE_KEY = 'twenty-bridge-token';

export const getTwentyBridgeSecret = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const searchParams = new URLSearchParams(window.location.search);
  const fromQuery = searchParams.get('bridgeToken');
  if (fromQuery) {
    window.sessionStorage.setItem(STORAGE_KEY, fromQuery);
    return fromQuery;
  }
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  return stored ?? undefined;
};
