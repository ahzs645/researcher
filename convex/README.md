# Convex data adapter

This directory contains the Convex backend for the shared `AppDataClient`
interface used by the Twenty bridge.

Run a Convex dev deployment:

```bash
yarn convex:dev
```

The Twenty frontend expects the Convex deployment URL to be exposed with the
same prefix as the rest of this Vite app:

```bash
REACT_APP_DATA_MODE=convex
VITE_CONVEX_URL=<your Convex deployment URL>
```

Local demo mode does not need Convex:

```bash
REACT_APP_DATA_MODE=local
```

`REACT_APP_CONVEX_URL` is also supported for consistency with the existing
Twenty frontend environment prefix.

The Convex records intentionally keep app-level IDs in `appId` fields. The
frontend maps those app IDs to Twenty record IDs, while Convex `_id` values stay
internal to Convex.
