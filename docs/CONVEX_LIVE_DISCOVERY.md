# Convex live grant discovery

Live discovery is the Convex-mode counterpart to the deterministic local demo
scanner. The Discovery page asks Convex to pull a registered grant source,
optionally score the extracted opportunities with a configured model, and
upsert them through the same portable mutation used by the local runtime.

> Status: automated baseline complete. All 24 built-in sources now have
> selector-based or single-page extraction profiles. CIHR and every source
> profile have been exercised against their live public pages.

## Flow

1. `DiscoveryPage` posts `{ libraryKey }` to
   `/grant-discovery/pull-source`.
2. The HTTP action verifies the bridge origin/shared secret and invokes the
   internal `grantDiscovery.pullSource` action.
3. Convex fetches a JSON feed directly or calls the connector runner for an
   HTML source.
4. Candidates receive deterministic fit scores. When both
   `ANTHROPIC_API_KEY` and `GRANT_MATCHER_MODEL` are configured, the action
   uses the Convex Agent component for stateless structured model judgements,
   replacing valid scores and falling back per batch or per missing result.
   Agent messages are not persisted.
5. `upsertOpportunitiesPortable` deduplicates by opportunity URL and writes
   `grantOpportunity` records.
6. The frontend refetches the review queue.

The pull result reports `scoredBy` as `heuristic`, `llm`, or `mixed`; it does
not claim model scoring when the provider failed and fallback was used.

## Current extraction support

The source library contains 24 automated profiles:

- 18 `html_selectors` profiles extract program/catalog links and their
  surrounding metadata.
- 6 `single_page` profiles represent dedicated program pages as one canonical
  opportunity.
- The backend also supports `json_feed` profiles, but the current library
  contains none.

The CIHR live validation on July 24, 2026 extracted 16 current opportunities,
including registration and application deadlines from the public ResearchNet
table. The profile targets `vwOpprtntyDtls.do` links, which is the path used by
the live site.

The connector runner endpoint is
`POST /runs/extract-opportunities`. It accepts a server-controlled source URL,
profile key, and extraction profile, and returns normalized `{ rows }`.

## Configuration

Start the connector runner:

```bash
cd services/connector-runner
npm install
CONNECTOR_RUNNER_SECRET=<shared-secret> npm start
```

Configure the Convex deployment:

```bash
npx convex env set BRIDGE_SHARED_SECRET <bridge-secret>
npx convex env set CONNECTOR_RUNNER_URL http://127.0.0.1:8890
npx convex env set CONNECTOR_RUNNER_SECRET <shared-secret>
```

Optional semantic scoring requires both values. There is deliberately no
hard-coded model identifier:

```bash
npx convex env set ANTHROPIC_API_KEY <provider-key>
npx convex env set GRANT_MATCHER_MODEL <supported-model-id>
```

Run Convex and the frontend with the same bridge URL/token configuration used
by the rest of the local Convex bridge. The Discovery page automatically uses
the live path when the bridge mode is `convex`; local mode continues to use
seeded deterministic opportunities.

## Security boundaries

- The browser cannot supply a connector-runner URL.
- The live pull is an internal Convex action reachable through the
  bridge-authenticated HTTP route.
- Runner credentials stay in Convex environment variables.
- Source URLs come from the built-in source catalogue.
- Model input is bounded and opportunity text is explicitly treated as
  untrusted content.

## Next enrichment work

The automated baseline intentionally extracts only metadata available on each
catalog or canonical program page. Future enrichment can visit detail pages to
capture normalized deadlines, eligibility, award amounts, and application
status. Keep list extraction bounded and URL-deduplicated, and add recorded
fixtures before relying on detail-page fields for workflow automation.

LLM score reasons are returned internally by the scorer but are not yet stored
on `grantOpportunity`; add a dedicated provenance/reason field before exposing
them in the UI.
