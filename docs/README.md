# Documentation

Docs specific to this fork. Twenty's upstream documentation
(<https://docs.twenty.com>) still covers the CRM core — objects, views, fields
and the frontend architecture.

## Manuscripts

| Document                                                                                                                               | What it covers                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`manuscript-format.md`](manuscript-format.md)                                                                                         | **Start here.** The manuscript format on one page — record model, live-token grammar, journal templates, export targets, preflight rules. Self-contained and portable. |
| [`../packages/twenty-front/src/modules/local-db/research/AGENTS.md`](../packages/twenty-front/src/modules/local-db/research/AGENTS.md) | The authoritative workflow for transposing an existing paper into Manuscript Compose records, with a fidelity checklist and required handoff reporting.                |
| [`paper-format-assessment/manuscript-token-grammar.md`](paper-format-assessment/manuscript-token-grammar.md)                           | Token grammar reference.                                                                                                                                               |
| [`paper-format-assessment/citation-formats-and-storage.md`](paper-format-assessment/citation-formats-and-storage.md)                   | How references are stored as CSL-JSON, which CSL styles are bundled, and the Zotero connector's status.                                                                |
| [`paper-format-assessment/README.md`](paper-format-assessment/README.md)                                                               | How the platform is set up, plus a hands-on assessment of the paper pipeline against a real thesis folder.                                                             |
| [`paper-format-assessment/followup-tests.md`](paper-format-assessment/followup-tests.md)                                               | Follow-up test notes.                                                                                                                                                  |

## Architecture

| Document                                                                                                                               | What it covers                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`../packages/twenty-front/src/modules/local-db/research/README.md`](../packages/twenty-front/src/modules/local-db/research/README.md) | How research objects are grafted onto Twenty's metadata, the nav re-skin, and the design constraints to read before adding fields. |
| [`offline-and-hosting.md`](offline-and-hosting.md)                                                                                     | Running with no server: the three runtime modes, what works with zero network, what still needs it, and what no-server cannot do.  |
| [`../convex/README.md`](../convex/README.md)                                                                                           | The Convex parity runtime.                                                                                                         |

## Screenshots

- [`compose-rebuild-screenshots/`](compose-rebuild-screenshots/README.md) — the composer rebuild
- [`mobile-view-screenshots/`](mobile-view-screenshots/README.md) — mobile views across the object set
- [`paper-format-assessment/`](paper-format-assessment/README.md) — the format walkthrough, with a `sample-export.docx`

## For coding assistants

[`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md) are the root briefs
for Codex and Claude Code. They must stay identical apart from which assistant
they name, so both are generated from [`assistant-brief.md`](assistant-brief.md)
by `node scripts/build-agent-docs.mjs`. Edit the source, not the generated
files; `--check` fails when they are out of date.
