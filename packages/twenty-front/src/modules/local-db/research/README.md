# Research objects (bridge augmentation)

Turns the Twenty data bridge into a **research-team workspace**: native objects
for grants, grant discovery, applications, projects, datasets, manuscripts and
more, on top of the existing local-db / Convex bridge — no backend required.

## Why this lives here

The standard 33-object metadata bundle
(`testing/mock-data/generated/metadata/objects/mock-objects-metadata.ts`) is
generated from a running `twenty-server` and must not be hand-edited. The whole
point of this fork is to run **without** that server, so instead of adding
backend standard-objects we **append** research objects to the static metadata
the bridge already reads. The standard bundle stays untouched and regenerable.

## The three graft points

A native Twenty object needs four things; this module produces all four and
`bridgeResearchAugmentation.ts` merges them at the places the bridge consumes
them:

| Artifact            | Produced by                       | Merged into                                  |
| ------------------- | --------------------------------- | -------------------------------------------- |
| Object metadata     | `buildResearchObjectEdges`        | `buildBridgeDataSource` + `bridgeMetadataMockLink` |
| Default TABLE view  | `buildResearchViews`              | `bridgeSystemSeed`                           |
| Navigation item     | `buildResearchNavigationMenuItems`| `bridgeSystemSeed`                           |
| Seed records        | `getResearchSeedRecords`          | `buildBridgeDataSource` (Dexie seed)         |

Object metadata also flows into the Convex schema generator
(`scripts/generate-convex-schema.ts`) so the `convex` runtime mode stays at
parity with `local`.

## Files

- `researchObjectModel.ts` — compact, hand-authored spec for every object and
  field (the source of truth). Add objects/fields here.
- `researchMetadataBuilder.ts` — expands specs into the verbose
  `ObjectMetadataItemsQuery` node shape, TABLE views, and nav items, with
  deterministic ids (so views/nav references stay stable across rebuilds).
- `researchGrantSourceData.ts` — generated data: the built-in grant-source
  library ported from the societyer catalogue (CIHR, NRC, Innovate BC, …).
- `researchSeedRecords.ts` — a coherent demo dataset across all objects.
- `bridgeResearchAugmentation.ts` — the single merge point.

## Design constraints (read before adding fields)

- **Flat fields only for now.** Relations are the one hard part of the bridge
  SDL surface, so objects link via text/select fields. Real relations come
  later.
- **SELECT/MULTI_SELECT values must be valid GraphQL enum identifiers**
  (`/^[A-Za-z_][A-Za-z0-9_]*$/`) — the SDL generator drops any that aren't.
  Keep values `UPPER_SNAKE`, labels human-readable.
- The label-identifier field is always a TEXT field named `name` so the
  standard `searchVector` expression on `"name"` stays valid.
- Amounts use `NUMBER` (not `CURRENCY`) and URLs/emails use `TEXT` to avoid
  composite-field seed complexity in the first cut.

## Adding an object

1. Add a `ResearchObjectSpec` to `RESEARCH_OBJECT_SPECS` in
   `researchObjectModel.ts`.
2. (Optional) add seed records in `researchSeedRecords.ts`.
3. That's it — views, nav, Dexie stores, and the GraphQL surface are derived.

When the object set changes, bump the Dexie `schemaVersion` in
`buildBridgeDataSource.ts` so returning visitors get an additive upgrade.

## Roadmap

- **Done:** object model + bridge wiring + 24 ported grant sources + demo data
  + research re-skin (all three milestones at the data/CRUD level).
- **Next:** bespoke pages (grant-source discovery + opportunity matching, apply
  assistant), real relations between objects, application-cycle board, and the
  Convex live runtime (connector-runner source pulls + AI matching).
