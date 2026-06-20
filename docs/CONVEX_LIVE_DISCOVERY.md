# Convex live grant discovery (#3)

Live source-pulls + opportunity scoring for **Convex mode** (the local-first
Dexie bridge ships the seeded source library + matcher; this adds *live*
fetching). Ported/scaffolded from the societyer stack.

> Status: scaffold. It needs a deployed Convex backend and — for HTML/portal
> sources — a running connector-runner. It is wired against this repo's generic
> record store, but has not been executed end-to-end in CI.

## Pieces

| Path | What it is |
| --- | --- |
| `convex/grantSources/` | The built-in grant-source library (24 curated sources) + their scrape **profiles** (selectors + field mappings), ported from societyer. `data/grantSources/*.json` are the source definitions; `grantSourceLibrary.ts` is the typed registry. |
| `convex/lib/opportunityMatching.ts` | Server copy of the `scoreOpportunity` matcher (kept in sync with the frontend one). |
| `convex/grantDiscovery.ts` | Convex functions: `library` (catalogue), `teamProfile` (interests + known funders from records), `pullSource` (fetch → score → upsert `grantOpportunity`), `upsertOpportunities` (dedup by URL). |
| `services/connector-runner/` | The browser/auth service (Express + Playwright) that fetches HTML and authenticated-portal pages and returns extracted rows. |

## How a pull works

`pullSource({ libraryKey, connectorRunnerUrl? })`:

1. Builds the **team profile** from existing `researchTeam.focusAreas` + `grant.funder`.
2. **Fetches candidates** for the source:
   - `json_feed` profiles are fetched and field-mapped inline (no extra infra).
   - HTML / authenticated-portal profiles are delegated to the connector-runner
     (`POST /runs/open-page` with the source profile), which returns rows.
3. **Scores** each candidate (`scoreOpportunity`) → fit score + confidence.
4. **Upserts** them as `grantOpportunity` records (dedup by `opportunityUrl`).

The upserted records are the same `grantOpportunity` objects the Twenty frontend
renders, so discovered opportunities show up in the Opportunities table with a
fit score and `status: NEW`.

## Running it

```bash
# 1. Generate the Convex record schema (includes the research tables)
npx tsx packages/twenty-front/scripts/generate-convex-schema.ts

# 2. Deploy Convex (generates convex/_generated, pushes schema + functions)
npx convex dev            # or: npx convex deploy

# 3. (HTML / portal sources only) run the connector-runner
cd services/connector-runner && npm install && npm start   # serves on :PORT

# 4. Trigger a pull (e.g. from the Convex dashboard or a cron)
#    json_feed source — no connector needed:
npx convex run grantDiscovery:pullSource '{"libraryKey":"<feed-source-key>"}'
#    portal source — point at the connector:
npx convex run grantDiscovery:pullSource \
  '{"libraryKey":"cihr-researchnet","connectorRunnerUrl":"http://localhost:8080"}'
```

To pull on a schedule, add a `crons.ts` entry calling `grantDiscovery:pullSource`
for each active source.

## Notes / follow-ups

- The frontend bridge and `convex/lib/opportunityMatching.ts` hold two copies of
  the scorer — keep them in sync (or hoist to `twenty-shared`).
- `pullSource` links opportunities to a `grantSource` record by URL today; wire a
  `sourceId` join once sources are seeded as records in Convex.
- HTML extraction relies on the connector-runner returning `{ rows: [...] }`
  shaped to the profile's `fieldMappings`; societyer's profile engine is the
  reference implementation.
