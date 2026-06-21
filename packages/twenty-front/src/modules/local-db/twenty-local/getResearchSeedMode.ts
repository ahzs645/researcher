import { getTwentyRawPathPrefix } from '@/local-db/twenty-local/getTwentyPublicBasePath';

export type ResearchSeedMode = 'demo' | 'blank';

const RESEARCH_SEED_MODE_STORAGE_KEY = 'research-seed-mode';

const persistResearchSeedMode = (mode: ResearchSeedMode): ResearchSeedMode => {
  window.sessionStorage.setItem(RESEARCH_SEED_MODE_STORAGE_KEY, mode);

  return mode;
};

// Decides whether a fresh local bridge starts pre-loaded with the sample
// dataset or as an empty workspace. Default is `blank`; visiting `/demo` (or
// `?demo=1`) opts into the seeded demo data. Resolved at boot — while the URL
// still reads `/demo`, before React Router rewrites it off the address bar —
// and persisted to sessionStorage so the later lazy seed read stays stable.
export const getResearchSeedMode = (): ResearchSeedMode => {
  if (typeof window === 'undefined') {
    return 'blank';
  }

  const searchParams = new URLSearchParams(window.location.search);
  // Strip the deploy sub-path (e.g. `/researcher`) the same way `index.tsx`
  // does so `/demo` is matched under project-site deployments too.
  const rawPathPrefix = getTwentyRawPathPrefix();
  const pathname =
    rawPathPrefix.length > 0 &&
    window.location.pathname.startsWith(rawPathPrefix)
      ? window.location.pathname.slice(rawPathPrefix.length) || '/'
      : window.location.pathname;
  const storedMode = window.sessionStorage.getItem(
    RESEARCH_SEED_MODE_STORAGE_KEY,
  );

  if (
    pathname === '/demo' ||
    pathname.startsWith('/demo/') ||
    searchParams.get('demo') === '1'
  ) {
    return persistResearchSeedMode('demo');
  }

  if (storedMode === 'demo' || storedMode === 'blank') {
    return storedMode;
  }

  return 'blank';
};
