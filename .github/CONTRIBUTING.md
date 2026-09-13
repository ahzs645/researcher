# Contributing to researcher

Thanks for considering a contribution.

`researcher` is a research-team workspace and manuscript composer, built as a
fork of [Twenty](https://github.com/twentyhq/twenty). Start with the
[root README](../README.md) for what the project is, and
[`CLAUDE.md`](../CLAUDE.md) for the full command set.

## Run the app

The app runs **without a backend** — a browser-side Dexie/IndexedDB bridge
serves the object machinery, so no server, Postgres or Redis is needed.

```bash
yarn install
npx nx build twenty-shared   # once
npx nx start twenty-front
```

Open `http://localhost:3001/demo` (a bare `/` is an empty workspace by design;
`/reset` wipes it).

The full backend (`twenty-server`, Postgres, Redis, the worker) is only needed
for work on the vendored upstream CRM server. For that,
`bash packages/twenty-utils/setup-dev-env.sh` starts the services.

## Before you open a pull request

```bash
# Test — prefer a single file, then the research suite
npx jest packages/twenty-front/src/modules/local-db/research \
  --config=packages/twenty-front/jest.config.mjs --runInBand

# Type-check and lint (lint:diff-with-main is the fast path)
npx nx typecheck twenty-front
npx nx lint:diff-with-main twenty-front
npx nx lint:diff-with-main twenty-front --configuration=fix
```

Code style follows the guidelines in [`CLAUDE.md`](../CLAUDE.md) and
[`.cursor/rules/`](../.cursor/rules): functional components only, named exports
only, no `any`, types over interfaces, kebab-case filenames, Jotai for state and
Linaria for styling.

If your change touches the research domain or the manuscript composer, read
`packages/twenty-front/src/modules/local-db/research/AGENTS.md` and
[`docs/manuscript-format.md`](../docs/manuscript-format.md) first.

`AGENTS.md` and `CLAUDE.md` at the repo root are **generated** from
`docs/assistant-brief.md` — edit that file and run
`node scripts/build-agent-docs.mjs`, never the generated files.

## How to contribute

1. **Fork** this repository and **clone** your fork.
2. **Create a branch** for your change rather than working on `main`.
3. **Make your change**, keeping it focused — a smaller diff is reviewed faster.
4. **Run the tests, type-check and lint** commands above.
5. **Commit** with a clear message and **push** to your fork.
6. **Open a pull request against this repository** with a description of what
   changed and why.

## Reporting issues

Open issues and pull requests on **this repository**
(`ahzs645/researcher`) — not on the upstream Twenty tracker. Include as much
detail as you can: what you expected, what happened, and how to reproduce it.

Bugs in unmodified upstream Twenty code are best reported upstream; bugs in the
research workspace, the local-db bridge or the manuscript composer belong here.

For security vulnerabilities, follow [`SECURITY.md`](SECURITY.md) instead of
opening a public issue.
