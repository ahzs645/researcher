# Running with no server

`researcher` already runs fully in the browser. This page records what that
actually covers, what still needs the network, and what no-server genuinely
cannot do — so the trade is a decision rather than a surprise.

## The three ways to run

| Mode           | What backs it                              | When to use                                                                                           |
| -------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Static web** | Dexie / IndexedDB in the visitor's browser | The deployed site. No server, no account, no database.                                                |
| **Local dev**  | The same Dexie bridge                      | `npx nx start twenty-front` → `http://localhost:3001`. The bridge engages automatically on localhost. |
| **Convex**     | A [Convex](../convex/README.md) deployment | Optional backend parity. Not the default.                                                             |

The static build is produced by
[`.github/workflows/deploy-github-pages.yaml`](../.github/workflows/deploy-github-pages.yaml),
which builds `twenty-front` with `REACT_APP_DATA_MODE=local` and a project base
path, copies `index.html` to `404.html` for SPA deep links, and publishes to
GitHub Pages. Nothing in that pipeline needs `twenty-server`, Postgres or Redis.

Mode is resolved by `twenty-local/isLocalTwentyDataMode.ts`, in this order:
the `/convex` or `/localdb` path prefix, a `?data=convex` / `?localdb=1` query
parameter, the `REACT_APP_DATA_MODE` build variable, a previously persisted
choice in `sessionStorage`, and finally the hostname — `localhost`, `127.0.0.1`
and `::1` default to the local bridge.

## What works with zero network

Verified by reading the implementations, not by assumption:

| Capability                                                 | Why it needs nothing                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The whole workspace — objects, views, nav, records         | Dexie/IndexedDB; `getResearchSeedMode.ts` decides blank vs demo seed                                                                                                                                                                                                                                                                                 |
| Manuscript composing and editing                           | Records and Markdown in the browser                                                                                                                                                                                                                                                                                                                  |
| **Citation formatting**                                    | The 15 CSL styles and the `en-US` locale are compiled into the bundle as raw XML (`manuscript/csl-styles/*.csl` imported with Vite's `?raw`). There is no CDN fallback because there is no fetch.                                                                                                                                                    |
| Importing `.docx` / `.pdf` / `.md` / `.txt` / portable ZIP | Unzipped with the platform's native `DecompressionStream`; no zip or PDF library ships. Text-based PDFs only — scanned ones have no extractable text.                                                                                                                                                                                                |
| DOCX, PDF, HTML, JATS export                               | Rendered client-side. The `fetch()` in the DOCX and PDF exporters is guarded by `isImageDataUrl`, so it reads `data:` URLs locally and never leaves the machine. The exporters deliberately refuse to pull remote figures — the source comment notes that doing so "sends the author's figures to a third party and fails outright with no network". |
| Equations, Mermaid diagrams, charts                        | KaTeX → MathML, Mermaid rendered once per export, charts generated as SVG and rasterised in-browser                                                                                                                                                                                                                                                  |
| Merged-cell tables, cross-references, numbering            | Pure functions over records                                                                                                                                                                                                                                                                                                                          |

## What needs the network

Five call sites, all optional enrichment rather than core authoring:

| Feature                                                       | Endpoint                      |
| ------------------------------------------------------------- | ----------------------------- |
| Add a reference by DOI                                        | `doi.org` content negotiation |
| Zotero library import                                         | Zotero Web API                |
| Grant/scholarship discovery scan                              | The configured source URLs    |
| A figure stored as a remote URL rather than an embedded image | That URL, at export time      |

Everything above degrades to "unavailable", not "broken": a manuscript with
embedded figures and a hand-entered or pasted CSL-JSON bibliography exports
completely offline.

## What no-server genuinely cannot do

This is the real cost, and it is not a bug to be fixed later:

- **Data lives in one browser profile.** IndexedDB is per-origin, per-browser,
  per-device. There is no sync, no cross-device access, no server-side backup.
- **No sharing or collaboration.** No accounts, no permissions, no multi-user
  anything. Two people cannot work on one manuscript.
- **Clearing site data destroys the workspace.** So does `/reset`, by design.
  The portable research ZIP is the backup — export it.
- **No server-side jobs.** Nothing scheduled, no background processing, no
  email.

If you need any of those, that is what the Convex mode exists for; it is
parity work, not the default.

## Seeding and reset

| URL                        | Effect                                                                        |
| -------------------------- | ----------------------------------------------------------------------------- |
| `/`                        | Blank workspace — the default for a fresh browser                             |
| `/demo` or `?demo=1`       | Seeds the sample dataset: journal templates, manuscripts, figures, references |
| `/reset`                   | Wipes IndexedDB back to blank and clears the persisted seed choice            |
| `/localdb` or `?localdb=1` | Forces the local bridge on a non-localhost host                               |

A first-time visitor on the bare URL gets the starter journal-template library
but no sample research records, so formatting works immediately while the
workspace stays free of demo content. `/demo` adds the worked example.

## Backing up a workspace

There is no server to back up, so the export **is** the backup. The portable
research ZIP (`manuscriptPortableZip.ts`) is the canonical round-trip archive:
`research-paper.json` plus structured sections, references and embedded assets.
Re-importing it into a clean workspace should restore counts, keys, content and
links unchanged.
