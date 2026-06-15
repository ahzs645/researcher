// Runtime public base path for static deploys served under a sub-path
// (e.g. GitHub Pages project sites at `https://<user>.github.io/<repo>/`).
//
// The value is injected into `window._env_.PUBLIC_URL` by the Vite
// `transformIndexHtml` plugin at build time (mirroring how Twenty's container
// entrypoint injects `window._env_`). It stays in sync with Vite's `base`
// option. Defaults to `/` for normal root-served deployments, so production
// behaviour is unchanged.
export const getTwentyPublicBasePath = (): string => {
  if (typeof window === 'undefined') {
    return '/';
  }

  const publicUrl = window._env_?.PUBLIC_URL;

  if (typeof publicUrl !== 'string' || publicUrl.length === 0) {
    return '/';
  }

  // Always normalize to a trailing slash so callers can append asset names.
  return publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`;
};

// React Router `basename` form: no trailing slash, except for the root `/`.
export const getTwentyRouterBasename = (): string => {
  const base = getTwentyPublicBasePath();

  if (base === '/') {
    return '/';
  }

  return base.endsWith('/') ? base.slice(0, -1) : base;
};

// Prefix to prepend to raw `window.history`/`window.location` paths (which,
// unlike React Router navigation, are not basename-aware). Empty for root.
export const getTwentyRawPathPrefix = (): string => {
  const basename = getTwentyRouterBasename();

  return basename === '/' ? '' : basename;
};
