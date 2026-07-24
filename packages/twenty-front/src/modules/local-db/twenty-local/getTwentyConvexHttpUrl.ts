const trimTrailingSlash = (url: string): string => url.replace(/\/$/, '');

// Convex HTTP actions use a different local port and cloud hostname from the
// reactive client API.
export const getTwentyConvexHttpUrl = (instanceUrl: string): string => {
  const trimmed = trimTrailingSlash(instanceUrl);

  if (trimmed.endsWith(':3210')) {
    return trimmed.replace(/:3210$/, ':3211');
  }

  return trimmed.replace(/\.convex\.cloud$/, '.convex.site');
};
