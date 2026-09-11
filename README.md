# researcher

A research-team workspace and manuscript composer, built as a fork of
[Twenty CRM](https://github.com/twentyhq/twenty).

It keeps Twenty's object, view and navigation machinery and grafts a research
domain onto it — grants, grant discovery, applications, obligations, projects,
datasets, references and **manuscripts** — then adds a manuscript composer that
imports an existing paper, formats it against a target journal, and exports
DOCX, PDF, HTML, JATS or a journal submission package.

**It runs without the Twenty backend.** A browser-side data bridge serves the
standard object machinery from IndexedDB, so the whole app builds to a static
site with no server, no account and no database.

---

## Quick start

```bash
yarn install
npx nx build twenty-shared
npx nx start twenty-front
```

Open `http://localhost:3001`. On localhost the local (Dexie/IndexedDB) bridge
engages automatically — you do **not** need Postgres, Redis, `twenty-server`
or the worker to use the research workspace or the manuscript composer.

| URL                        | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `/`                        | Empty workspace — the default for a fresh browser                             |
| `/demo` or `?demo=1`       | Seeds the sample dataset: journal templates, manuscripts, figures, references |
| `/reset`                   | Wipes IndexedDB back to blank                                                 |
| `/compose?manuscript=<id>` | The manuscript composer                                                       |

Start at `/demo` the first time — a bare `/` gives you an empty workspace with
no templates, which looks like a broken build but is the intended default.

### Writing a manuscript

Manuscripts are the door to the composer: open a `manuscript` record and use
**Open in composer** (⌘⏎ in the side panel) or the button on the record page.
There is no separate "Compose" nav item.

- **[`docs/manuscript-format.md`](docs/manuscript-format.md)** — the manuscript
  format on one page: record model, live-token grammar, journal templates,
  export targets, preflight rules. Self-contained, so it can be handed to a
  collaborator or an assistant that has no checkout.
- **[`packages/twenty-front/src/modules/local-db/research/AGENTS.md`](packages/twenty-front/src/modules/local-db/research/AGENTS.md)**
  — the authoritative workflow for transposing an existing paper into
  Manuscript Compose records and exports, with a fidelity checklist. Read this
  before importing a real paper.

## Runtime modes

Selected by `REACT_APP_DATA_MODE`, a URL path, or a query parameter:

| Mode      | Storage                                 | Used by                                          |
| --------- | --------------------------------------- | ------------------------------------------------ |
| `local`   | Dexie / IndexedDB in the browser        | the static Pages build; the default on localhost |
| `convex`  | a [Convex](convex/README.md) deployment | backend parity; not the default                  |
| in-memory | RAM                                     | tests                                            |

`.github/workflows/deploy-github-pages.yaml` builds `twenty-front` with
`REACT_APP_DATA_MODE=local` and publishes a fully static SPA to GitHub Pages.
Every edit persists to the visitor's own IndexedDB — there is no server and
nothing is shared.

Citation formatting, importing, and DOCX/PDF/HTML/JATS export all run with no
network at all. See [`docs/offline-and-hosting.md`](docs/offline-and-hosting.md)
for exactly what works offline, the four features that do need the network, and
what no-server genuinely cannot do (no sharing, no sync, one browser profile).

## What was added to Twenty

| Area                                                                   | Where                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Research objects, views, nav, seed data                                | `packages/twenty-front/src/modules/local-db/research/` |
| Manuscript composer, import, export                                    | `.../research/manuscript/`                             |
| Funding funnel — discovery, assessment, applications, reusable answers | `.../research/research*.ts`                            |
| Obligations tracker and project roster                                 | `.../research/` + `ObligationsPage`                    |
| Browser data bridge                                                    | `packages/twenty-front/src/modules/local-db/`          |
| Convex parity runtime                                                  | `convex/`                                              |

The nav is regrouped into four folders — **Lab**, **Work**, **Funding**,
**Discovery** — and two CRM objects are repurposed: People → _Collaborators_,
Companies → _Institutions_. See
[`.../research/README.md`](packages/twenty-front/src/modules/local-db/research/README.md)
for the graft points and design constraints.

## Documentation

- [`docs/`](docs/README.md) — index of the docs in this fork
- [`docs/manuscript-format.md`](docs/manuscript-format.md) — the manuscript format
- [`docs/offline-and-hosting.md`](docs/offline-and-hosting.md) — running with no
  server: what works offline, what needs the network, and the real limits
- [`docs/paper-format-assessment/`](docs/paper-format-assessment/README.md) —
  how the platform is set up, and a hands-on assessment of the paper pipeline
- [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) — working agreements for
  coding assistants. Both are generated from `docs/assistant-brief.md` —
  edit that, not them
- [Twenty's documentation](https://docs.twenty.com) still applies to the CRM
  core — objects, views, fields, the frontend architecture

## Development

```bash
# Test — prefer a single file, then the research suite
npx jest packages/twenty-front/src/modules/local-db/research \
  --config=packages/twenty-front/jest.config.mjs --runInBand

# Type-check and lint
npx nx typecheck twenty-front
npx nx lint:diff-with-main twenty-front

# Regenerate the two assistant briefs from docs/assistant-brief.md
node scripts/build-agent-docs.mjs
```

The full backend (`twenty-server`, Postgres, Redis, the worker) is only needed
for work on the upstream CRM server itself. For that,
`bash packages/twenty-utils/setup-dev-env.sh` starts the services; see
[`CLAUDE.md`](CLAUDE.md) for the full command set.

## Stack

TypeScript · Nx monorepo · React 18 with Jotai, Linaria and Lingui · Dexie
(IndexedDB) · Convex · NestJS, PostgreSQL and Redis for the upstream server.

## License

AGPL-3.0, inherited from Twenty. See [LICENSE](LICENSE).
