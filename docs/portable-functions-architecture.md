# Portable functions + `context.db` repository contract

> Status: **Phase 0 landed** — the contract, the three engines, the Convex
> delegation, and the first ported domain (grant discovery), with differential
> conformance tests. This is the same data architecture societyer runs at
> scale (796 functions across ~90 domains); this document records how it maps
> onto researcher.

## Why

Researcher ships a hosted-Convex backend **and** a browser-local (Dexie)
runtime. Generic record CRUD already flows through one seam — the `DataSource`
contract in `twenty-shared/data-source` — so tables, filters, and views behave
identically everywhere. **Domain logic did not.** The opportunity matcher
existed twice, with a literal "keep the two in sync" comment:

- `convex/lib/opportunityMatching.ts` (server copy)
- `packages/twenty-front/.../researchOpportunityMatching.ts` (browser copy)

and the two had already drifted: the Convex path graded `MEDIUM` confidence
from `fitScore >= 2`, the browser path from `>= 3`. Hand-mirrored business
logic is the exact disease societyer's portable-functions architecture cures,
and researcher now uses the same cure: one set of **portable functions**
running on a bounded `context` contract, with a thin adapter per runtime.

```
                    caller (Convex function / local runtime / test)
                                      │
              ┌───────────────────────┼────────────────────────┐
        hosted Convex            browser-local                test
     real Convex ctx.db       Dexie tables (IndexedDB)      MemoryDb
              │                       │                        │
   convex/lib/portable.ts   createLocalPortableRuntime.ts   (oracle)
              └───────────── same portable handler ────────────┘
                twenty-shared/portable-functions  (+ kernels)
```

## The contract (`twenty-shared/portable`)

Domain-agnostic — imports no Convex, no Dexie, no researcher domain code.

| File | Role |
|---|---|
| `portableContext.ts` | The bounded `context.db` surface: `get / query(table).withIndex().filter().order().collect()/first/unique/take/paginate`, `insert/patch/replace/delete`, `PortableTransactionalDatabase.transaction`, plus `PortableQueryContext` / `PortableMutationContext` and the `PortablePrincipal` identity shape. |
| `portableCapabilities.ts` | Injected `context.capabilities` (email/storage/llm/http). Absent capabilities throw a structured `CAPABILITY_UNAVAILABLE` instead of silently no-oping. |
| `memoryDb.ts` | `MemoryDb` — the reference engine / differential-test oracle, plus the shared query evaluator every local engine reuses. Atomic snapshot-rollback transactions. |
| `localStoreDb.ts` | `LocalStoreDb` — the browser `context.db`, over a minimal async `PortableRowStore` interface. Transactional overlay = read-your-writes + one atomic `commitBatch` flush; concurrent transactions are serialized. `MemoryRowStore` for tests. |
| `portableRuntime.ts` | `definePortableQuery` / `definePortableMutation` + `PortableRuntime` (registers functions, runs them locally, wraps top-level mutations in `db.transaction`, routes nested `runQuery`/`runMutation` through the registry inside the current transaction). |

### Researcher adaptations (vs the societyer original)

- **Durable identity is the Twenty record UUID in the `id` field**, not a
  runtime-native `_id`. Societyer had to invent `entityId` for cross-runtime
  identity; researcher's Twenty-shaped records already carry one. The Convex
  adapter resolves `id` through each table's `by_external_id` index and strips
  Convex's `_id`/`_creationTime` so handlers see identical rows on every
  engine.
- **Record addressing carries the table**: `get(table, id)`,
  `patch(table, id, patch)`, … — this keeps the Convex adapter on the index
  (no cross-table scans) and matches the researcher DataSource idiom.
- **The row store is async** (`rows(table): Promise<rows>`): researcher's
  Dexie tables are read per-query rather than through societyer's synchronous
  in-memory cache, and the contract is async anyway.
- **No `withSearchIndex` yet** — researcher's Convex schema defines no search
  indexes. Port it from societyer together with the first search index.

### Fidelity boundary (read before porting a handler)

- `withIndex` index **names are advisory** on the local engines: they scan and
  apply the `eq`/range constraints in JS. On Convex they hit the real index.
- `filter` takes a **JS predicate**. The Convex adapter implements it as
  collect-then-filter, so predicate-heavy handlers that feel fine locally can
  hit Convex scan limits at production sizes. Prefer index narrowing.
- Local ordering is `createdAt` (ISO string) then `id`; Convex's `.order()`
  sorts by its internal `_creationTime`. If a handler depends on order, sort
  explicitly or pin it in a conformance test.
- Capabilities are **not** part of `db`. Server-only work (email, AI, blob
  storage, raw HTTP) goes through `context.capabilities` and fails loudly
  where unavailable.

## How a handler becomes portable (worked example: grant discovery)

1. **One source of truth** — `twenty-shared/portable-functions/`:
   - `opportunityMatching.ts` — the pure kernel (`scoreOpportunity`,
     `confidenceFromFitScore`, `buildTeamProfileFromRecords`). The duplicated
     copies in `convex/lib/` and the frontend are now re-export shims.
   - `grantDiscovery.ts` — `teamProfilePortable(context)` and
     `upsertOpportunitiesPortable(context, args)` written against the
     contract, wrapped as `grantDiscovery:teamProfile` /
     `grantDiscovery:upsertOpportunities` definitions.
   - `registry.ts` — `PORTABLE_FUNCTIONS`, what every local runtime registers.
2. **Convex delegates** (`convex/grantDiscovery.ts`):
   ```ts
   handler: async (ctx) => teamProfilePortable(await toPortableQueryContext(ctx))
   ```
   The real Convex handler now runs on the contract via
   `convex/lib/portable.ts`. Candidate ACQUISITION (feed fetch /
   connector-runner) stays in the Convex action — it is capability work, not
   `db` work.
3. **The browser runs the same handler** —
   `createLocalPortableRuntime({ dataSource })` (twenty-front
   `local-db/data-source/createLocalPortableRuntime.ts`) registers
   `PORTABLE_FUNCTIONS` over the live Dexie tables. `commitBatch` applies each
   mutation's writes in one Dexie `rw` transaction, so a thrown handler never
   commits partially.
4. **Differential tests pin cross-engine agreement** —
   `src/portable/__tests__/portableConformance.test.ts` (engine semantics:
   queries, pagination, transactions, rollback, serialization) and
   `src/portable-functions/__tests__/grantDiscoveryConformance.test.ts`
   (the ported domain produces identical results AND identical stored rows on
   `MemoryDb` and `LocalStoreDb`). Run with:
   ```bash
   cd packages/twenty-shared && npx jest portable
   ```

Unifying the kernel fixed the confidence-band drift: `MEDIUM` is now
`fitScore >= 3` everywhere (the user-visible browser behavior won).

## How this relates to the DataSource seam

The two seams are complementary, exactly as in societyer (generic record CRUD
vs domain handlers):

- **`twenty-shared/data-source`** — generic, metadata-driven record CRUD for
  the Twenty UI (find/create/update/aggregate/search). The UI's Apollo hooks
  (`useCreateOneRecord`, …) keep flowing through it on every backend.
- **`twenty-shared/portable`** — domain BUSINESS LOGIC that reads/writes many
  records with invariants (dedup, scoring, transactional multi-writes), one
  implementation for server and offline.

A portable mutation and the DataSource ultimately hit the same Dexie tables
locally and the same Convex tables hosted, so records written by one are
visible to the other.

## Phased plan (mirroring societyer)

- **Phase 0 — landed (this change).** Contract + three engines + capabilities
  + Convex delegation + first domain + differential harness.
- **Phase 1 — next.** Reactive bridge: let UI reads flow through portable
  queries with Apollo cache updates (societyer's `watchPortableQuery`
  equivalent), so pages like Discovery can call
  `runtime.runMutation('grantDiscovery:upsertOpportunities', …)` directly
  instead of looping `useCreateOneRecord`.
- **Phase 2 — as needed.** `convex-test` as a third conformance engine (run
  the ported handlers on a real Convex `ctx.db` + schema and diff against the
  local engines).
- **Phase 3 — ongoing.** Port further domains (citation dedup/key-gen,
  obligation recurrence, application scaffolding are the obvious candidates —
  each currently lives frontend-only and would gain a server/cron home for
  free). One domain per PR, each with a conformance test.

## Decision record

- **Portable functions + `context.db` contract**, not an embedded Convex
  backend and not a fork of `convex-test` (kept as a future oracle only).
- **The Twenty UUID `id` IS the durable identity** — no second id scheme.
- **Table-qualified addressing** (`get(table, id)`) so every engine resolves
  identity through an index, not a scan.
- **The generic DataSource stays** — portable functions complement it for
  domain logic; they do not replace record CRUD.
