<!-- Generated from docs/assistant-brief.md by scripts/build-agent-docs.mjs. Do not edit AGENTS.md directly; edit the source and re-run the script. -->

# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

`researcher` is a research-team workspace and manuscript composer, built as a
fork of Twenty (an open-source CRM). It keeps Twenty's object, view and
navigation machinery and grafts a research domain onto it — grants, grant
discovery, applications, obligations, projects, datasets, references and
manuscripts — plus a composer that imports an existing paper, formats it
against a target journal, and exports DOCX/PDF/HTML/JATS or a submission
package. The codebase is an Nx workspace with multiple packages.

**The research app runs without the Twenty backend.** A browser-side data
bridge serves the standard object machinery from IndexedDB (Dexie), so the
whole app builds to a static site with no server, account or database. The
backend commands below matter only for work on the upstream CRM server.

## Research workspace and manuscripts

Most work in this fork touches
`packages/twenty-front/src/modules/local-db/research/`. Before working there,
read:

- `packages/twenty-front/src/modules/local-db/research/AGENTS.md` — the
  **required** workflow for transposing an existing paper into Manuscript
  Compose records and exports, with a fidelity checklist and the facts you must
  report back. Read this before importing or restructuring a real paper.
- `docs/manuscript-format.md` — the manuscript format on one page: record
  model, live-token grammar, journal templates, export targets, preflight
  rules. Self-contained, so it can be handed to someone with no checkout.
- `packages/twenty-front/src/modules/local-db/research/README.md` — how
  research objects are grafted onto Twenty's metadata, and the design
  constraints to read before adding fields.

Section content is Markdown with live tokens (`[@citekey]`, `[#asset-key]`,
`[[asset:asset-key]]`, `$latex$`). Do not write pre-formatted citations into
section content — the citation style is applied at export from the journal
template.

To run the research app: `npx nx start twenty-front`, then open
`http://localhost:3001/demo` for the worked example. A bare `/` is not empty —
blank mode seeds the starter journal templates but no sample research records;
`/reset` wipes it. On localhost the local bridge engages automatically.

## Key Commands

### Development

For the research workspace and manuscript composer, the frontend alone is
enough — the local (Dexie/IndexedDB) bridge engages automatically on localhost:

```bash
npx nx build twenty-shared   # once
npx nx start twenty-front    # http://localhost:3001/demo
```

The full stack below is only needed for work on the upstream CRM server.

```bash
# Start development environment (frontend + backend + worker)
yarn start

# Individual package development
npx nx start twenty-front     # Start frontend dev server
npx nx start twenty-server    # Start backend server
npx nx run twenty-server:worker  # Start background worker
```

### Testing

Frontend tests need a one-time bootstrap, or every suite fails to load:

```bash
npx nx build twenty-shared   # lingui config resolves through it
npx nx build twenty-ui       # subpath exports like `twenty-ui/input` resolve to dist
cd packages/twenty-front && ../../node_modules/.bin/lingui compile --typescript
```

`setupTests.ts` imports `~/locales/generated/en`, which only exists after that
lingui compile. Run jest from `packages/twenty-front` — `npx jest` at the repo
root cannot resolve the config.

```bash
# Preferred: run a single test file (fast)
npx jest path/to/test.test.ts --config=packages/PROJECT/jest.config.mjs

# Run all tests for a package
npx nx test twenty-front      # Frontend unit tests
npx nx test twenty-server     # Backend unit tests
npx nx run twenty-server:test:integration:with-db-reset  # Integration tests with DB reset
# To run an indivual test or a pattern of tests, use the following command:
cd packages/{workspace} && npx jest "pattern or filename"

# Storybook
npx nx storybook:build twenty-front
npx nx storybook:test twenty-front

# When testing the UI end to end, click on "Continue with Email" and use the prefilled credentials.
```

### Code Quality

```bash
# Linting (diff with main - fastest, always prefer this)
npx nx lint:diff-with-main twenty-front
npx nx lint:diff-with-main twenty-server
npx nx lint:diff-with-main twenty-front --configuration=fix  # Auto-fix

# Linting (full project - slower, use only when needed)
npx nx lint twenty-front
npx nx lint twenty-server

# Type checking
npx nx typecheck twenty-front
npx nx typecheck twenty-server

# Format code
npx nx fmt twenty-front
npx nx fmt twenty-server
```

### Build

```bash
# Build packages (twenty-shared must be built first)
npx nx build twenty-shared
npx nx build twenty-front
npx nx build twenty-server
```

### Database Operations

```bash
# Database management
npx nx database:reset twenty-server         # Reset database
npx nx run twenty-server:database:init:prod # Initialize database
npx nx run twenty-server:database:migrate:prod # Run instance commands (fast only)

# Generate an instance command (fast or slow)
npx nx run twenty-server:database:migrate:generate --name <name> --type <fast|slow>
```

### Database Inspection (Postgres MCP)

A read-only Postgres MCP server is configured in `.mcp.json`. Use it to:

- Inspect workspace data, metadata, and object definitions while developing
- Verify migration results (columns, types, constraints) after running migrations
- Explore the multi-tenant schema structure (core, metadata, workspace-specific schemas)
- Debug issues by querying raw data to confirm whether a bug is frontend, backend, or data-level
- Inspect metadata tables to debug GraphQL schema generation issues

This server is read-only — for write operations (reset, migrations, sync), use the CLI commands above.

### GraphQL

```bash
# Generate GraphQL types (run after schema changes)
npx nx run twenty-front:graphql:generate
npx nx run twenty-front:graphql:generate --configuration=metadata
```

## Architecture Overview

### Tech Stack

- **Frontend**: React 18, TypeScript, Jotai (state management), Linaria (styling), Vite
- **Backend**: NestJS, TypeORM, PostgreSQL, Redis, GraphQL (with GraphQL Yoga)
- **Monorepo**: Nx workspace managed with Yarn 4

### Package Structure

```
packages/
├── twenty-front/          # React frontend application
├── twenty-server/         # NestJS backend API
├── twenty-ui/             # Shared UI components library
├── twenty-shared/         # Common types and utilities
├── twenty-emails/         # Email templates with React Email
├── twenty-website-new/    # Next.js marketing website
├── twenty-docs/           # Documentation website
├── twenty-zapier/         # Zapier integration
└── twenty-e2e-testing/    # Playwright E2E tests
```

The research domain in this fork is not a package — it lives inside the
frontend, under `packages/twenty-front/src/modules/local-db/`:

```
local-db/
├── research/             # Research objects, views, nav, seed data
│   ├── manuscript/       # Composer: import, tokens, citations, exports
│   ├── import-wizard/    # Upload → map → review → commit → rollback
│   └── components/       # Composer and editor UI
└── twenty-local/         # The browser data bridge (Dexie), modes, seeding
```

### Key Development Principles

- **Functional components only** (no class components)
- **Named exports only** (no default exports)
- **Types over interfaces** (except when extending third-party interfaces)
- **String literals over enums** (except for GraphQL enums)
- **No 'any' type allowed** — strict TypeScript enforced
- **Event handlers preferred over useEffect** for state updates
- **Props down, events up** — unidirectional data flow
- **Composition over inheritance**
- **No abbreviations** in variable names (`user` not `u`, `fieldMetadata` not `fm`)

### Naming Conventions

- **Variables/functions**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE
- **Types/Classes**: PascalCase (suffix component props with `Props`, e.g. `ButtonProps`)
- **Files/directories**: kebab-case with descriptive suffixes (`.component.tsx`, `.service.ts`, `.entity.ts`, `.dto.ts`, `.module.ts`)
- **TypeScript generics**: descriptive names (`TData` not `T`)

### File Structure

- Components under 300 lines, services under 500 lines
- Components in their own directories with tests and stories
- Use `index.ts` barrel exports for clean imports
- Import order: external libraries first, then internal (`@/`), then relative

### Comments

- Use short-form comments (`//`), not JSDoc blocks
- Explain WHY (business logic), not WHAT
- Do not comment obvious code
- Multi-line comments use multiple `//` lines, not `/** */`

### State Management

- **Jotai** for global state: atoms for primitive state, selectors for derived state, atom families for dynamic collections
- Component-specific state with React hooks (`useState`, `useReducer` for complex logic)
- GraphQL cache managed by Apollo Client
- Use functional state updates: `setState(prev => prev + 1)`

### Backend Architecture

- **NestJS modules** for feature organization
- **TypeORM** for database ORM with PostgreSQL
- **GraphQL** API with code-first approach
- **Redis** for caching and session management
- **BullMQ** for background job processing

### Database & Upgrade Commands

- **PostgreSQL** as primary database
- **Redis** for caching and sessions
- **ClickHouse** for analytics (when enabled)
- When changing entity files, generate an **instance command** (`database:migrate:generate --name <name> --type <fast|slow>`)
- **Fast** instance commands handle schema changes; **slow** ones add a `runDataMigration` step for data backfills
- **Workspace commands** iterate over all active/suspended workspaces for per-workspace upgrades
- Commands use `@RegisteredInstanceCommand` and `@RegisteredWorkspaceCommand` decorators for automatic discovery
- Include both `up` and `down` logic in instance commands
- Never delete or rewrite committed instance command `up`/`down` logic
- See `packages/twenty-server/docs/UPGRADE_COMMANDS.md` for full documentation

### Utility Helpers

Use existing helpers from `twenty-shared` instead of manual type guards:

- `isDefined()`, `isNonEmptyString()`, `isNonEmptyArray()`

## Development Workflow

IMPORTANT: Use Context7 for code generation, setup or configuration steps, or library/API documentation. Automatically use the Context7 MCP tools to resolve library IDs and get library docs without waiting for explicit requests.

### Before Making Changes

1. Always run linting (`lint:diff-with-main`) and type checking after code changes
2. Test changes with relevant test suites (prefer single-file test runs)
3. Ensure instance commands are generated for entity changes (`database:migrate:generate`)
4. Check that GraphQL schema changes are backward compatible
5. Run `graphql:generate` after any GraphQL schema changes

### Code Style Notes

- Use **Linaria** for styling with zero-runtime CSS-in-JS (styled-components pattern)
- Follow **Nx** workspace conventions for imports
- Use **Lingui** for internationalization
- Apply security first, then formatting (sanitize before format)

### Testing Strategy

- **Test behavior, not implementation** — focus on user perspective
- **Test pyramid**: 70% unit, 20% integration, 10% E2E
- Query by user-visible elements (text, roles, labels) over test IDs
- Use `@testing-library/user-event` for realistic interactions
- Descriptive test names: "should [behavior] when [condition]"
- Clear mocks between tests with `jest.clearAllMocks()`

## Dev Environment Setup

All dev environments (Codex web, Cursor, local) use one script:

```bash
bash packages/twenty-utils/setup-dev-env.sh
```

This handles everything: starts Postgres + Redis (auto-detects local services vs Docker), creates databases, and copies `.env` files. Idempotent — safe to run multiple times.

- `--docker` — force Docker mode (uses `packages/twenty-docker/docker-compose.dev.yml`)
- `--down` — stop services
- `--reset` — wipe data and restart fresh
- **Skip the setup script** for tasks that only read code — architecture questions, code review, documentation, etc.

**Note:** CI workflows (GitHub Actions) manage services via Actions service containers and run setup steps individually — they don't use this script.

## Important Files

- `nx.json` - Nx workspace configuration with task definitions
- `tsconfig.base.json` - Base TypeScript configuration
- `package.json` - Root package with workspace definitions
- `packages/twenty-front/src/modules/local-db/research/AGENTS.md` - Required workflow for transposing an existing paper into Manuscript Compose records and exports
- `docs/manuscript-format.md` - The manuscript format on one page: records, token grammar, journal templates, exports, preflight
- `packages/twenty-front/src/modules/local-db/research/README.md` - How research objects are grafted onto Twenty's metadata
- `docs/offline-and-hosting.md` - The no-server story: runtime modes, what works offline, what needs the network, and the real limits
- `docs/README.md` - Index of this fork's documentation
- `docs/assistant-brief.md` - Canonical source for this file and AGENTS.md; edit it, then run `node scripts/build-agent-docs.mjs`
- `.cursor/rules/` - Detailed development guidelines and best practices
