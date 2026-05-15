# Convex backend (Twenty data source)

Schema and HTTP actions backing `createConvexDataSource` on the frontend side.

```
convex/
├── schema.ts           # 33-object schema, auto-generated from metadata
├── data-source.ts      # Generic httpAction implementations of the DataSource
├── http.ts             # Routes /data-source/* → data-source.ts handlers
├── _legacy/            # Archived researcher-shaped schema (kept for history)
└── README.md
```

## Regenerating the schema

`convex/schema.ts` is generated from the standard 33-object metadata bundle.
Run:

```bash
npx tsx packages/twenty-front/scripts/generate-convex-schema.ts
```

The script imports `mockedStandardObjectMetadataQueryResult` and writes the
emitted SDL to `convex/schema.ts`. Commit the result so Convex deploys don't
depend on running the script.

## Running

```bash
yarn convex:dev
```

The Twenty frontend then talks to Convex via the data-source HTTP actions:

```bash
REACT_APP_DATA_MODE=convex
VITE_CONVEX_URL=<your Convex deployment URL>
```

The frontend's `createConvexDataSource` posts a JSON body matching the
`DataSource` method signature (e.g. `findMany`, `createOne`, `updateOne`) to
`<convexUrl>/data-source/<method>`. Each HTTP action runs the matching logic
against Convex's db. Filter / sort / pagination semantics are shared with the
in-memory and Dexie adapters via `twenty-shared/data-source`.

## Legacy schema

`_legacy/` holds the original projects/layers/notes researcher-shape backend.
The `_` prefix tells Convex to ignore the directory; the files are kept as
reference for historical bridge data only.
