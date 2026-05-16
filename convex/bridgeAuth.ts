// Bridge-level auth + CORS helpers shared by `dataSource.ts` and
// `systemSource.ts`. The self-hosted backend is dev-only, but binding it to
// `127.0.0.1` and routing through a shared-secret header keeps it from being
// pried open by other processes / browser tabs on the same machine.
//
// The expected token lives in Convex's environment under
// `BRIDGE_SHARED_SECRET`. Set it via `npx convex env set BRIDGE_SHARED_SECRET …`
// after pushing — the frontend reads the same value from a URL param + sessionStorage
// (see `getTwentyBridgeSecret`).

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3001',
  'http://localhost:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3000',
]);

const resolveExpectedSecret = (): string | undefined => {
  // `process.env` is available in Convex's runtime via the env vars set with
  // `npx convex env set …`. Returning `undefined` here disables the check —
  // which is intentional for first-boot dev (no secret yet) but should be
  // flipped on as soon as the bridge is running.
  return process.env.BRIDGE_SHARED_SECRET;
};

const corsHeadersFor = (request: Request): Record<string, string> => {
  const origin = request.headers.get('origin') ?? '';
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'http://localhost:3001';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
};

export const okResponse = (request: Request, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeadersFor(request),
    },
  });

export const errorResponse = (
  request: Request,
  status: number,
  message: string,
): Response =>
  new Response(message, { status, headers: corsHeadersFor(request) });

export const preflightResponse = (request: Request): Response =>
  new Response(null, {
    status: 204,
    headers: {
      ...corsHeadersFor(request),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Token',
      'Access-Control-Max-Age': '86400',
    },
  });

export const checkBridgeAuth = (request: Request): Response | null => {
  const origin = request.headers.get('origin');
  if (origin !== null && !ALLOWED_ORIGINS.has(origin)) {
    return errorResponse(request, 403, 'Origin not allowed');
  }
  const expected = resolveExpectedSecret();
  if (expected === undefined) {
    // No secret configured → first-boot dev mode. Allow but warn via header.
    return null;
  }
  const provided = request.headers.get('x-bridge-token');
  if (provided !== expected) {
    return errorResponse(request, 401, 'Missing or invalid X-Bridge-Token');
  }
  return null;
};
