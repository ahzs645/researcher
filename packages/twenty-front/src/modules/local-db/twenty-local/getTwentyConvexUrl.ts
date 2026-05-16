const TWENTY_CONVEX_URL_STORAGE_KEY = 'twenty-convex-url';

// The bridge is dev-only — we hard-reject any Convex URL that doesn't point
// at the local machine, even if it was passed via `?convexUrl=…`. This stops
// a malicious link from pinning a victim's bridge at an attacker-controlled
// backend.
const isAllowedConvexUrl = (raw: string): boolean => {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    return false;
  }
};

// Resolves the Convex backend URL from (in order):
//   1. `?convexUrl=…` query parameter (also persists into sessionStorage)
//   2. previously-persisted sessionStorage value
//   3. Vite's `import.meta.env.REACT_APP_CONVEX_URL` / `VITE_CONVEX_URL`
//
// Access to `import.meta` is deferred behind `new Function(...)` so this
// module can also load under Jest (CommonJS), where `import.meta` is a
// syntax error at parse time. Tests get `undefined`; runtime gets the env.
export const getTwentyConvexUrl = (): string | undefined => {
  const accept = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    if (!isAllowedConvexUrl(url)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[bridge] Rejecting Convex URL "${url}" — only localhost / 127.0.0.1 are allowed.`,
      );
      return undefined;
    }
    return url;
  };

  if (typeof window !== 'undefined') {
    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = accept(searchParams.get('convexUrl') ?? undefined);
    if (fromQuery) {
      window.sessionStorage.setItem(TWENTY_CONVEX_URL_STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    const stored = accept(
      window.sessionStorage.getItem(TWENTY_CONVEX_URL_STORAGE_KEY) ?? undefined,
    );
    if (stored) return stored;
  }
  try {
    const readImportMetaEnv = new Function(
      'return typeof import !== "undefined" ? import.meta?.env : undefined',
    ) as () => Record<string, string | undefined> | undefined;
    const env = readImportMetaEnv();
    return accept(env?.REACT_APP_CONVEX_URL ?? env?.VITE_CONVEX_URL);
  } catch {
    return undefined;
  }
};
