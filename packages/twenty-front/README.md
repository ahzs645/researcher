# twenty-front

The React frontend — and, in this fork, the whole application. `researcher`
runs **without a backend**: a browser-side data bridge serves the object
machinery from IndexedDB (Dexie), so no server, account or database is needed.

## Run it

```bash
npx nx build twenty-shared   # once, from the repo root
npx nx start twenty-front
```

Then open **`http://localhost:3001/demo`**.

The nx target is `start` (there is no `dev` target), and the dev server listens
on port **3001** — override with `REACT_APP_PORT`. Port 3000 belongs to the
upstream `twenty-server`, which this fork does not run.

On localhost the local (Dexie/IndexedDB) bridge engages automatically.

| URL                        | What it does                                                                   |
| -------------------------- | ------------------------------------------------------------------------------ |
| `/`                        | Empty workspace — the default for a fresh browser                              |
| `/demo` or `?demo=1`       | Seeds the sample dataset: journal templates, manuscripts, figures, references   |
| `/reset`                   | Wipes IndexedDB back to blank                                                   |
| `/compose?manuscript=<id>` | The manuscript composer                                                         |

Start at `/demo` the first time — a bare `/` gives you an empty workspace with
no templates, which looks like a broken build but is the intended default.

## Where the research domain lives

```
src/modules/local-db/
├── data-source/   # GraphQL-over-Dexie data source and Apollo providers
├── twenty-local/  # Bridge modes, seeding, workspace reset
└── research/      # Research objects, views, nav, seed data, manuscript composer
```

## Common commands

```bash
npx nx typecheck twenty-front
npx nx lint:diff-with-main twenty-front
npx nx test twenty-front
npx nx build twenty-front
```

## More

- [Root README](../../README.md) — what this fork is and how it is put together
- [`docs/offline-and-hosting.md`](../../docs/offline-and-hosting.md) — running
  with no server: what works offline, what needs the network, and the real
  trade-offs of browser-only storage
- [`src/modules/local-db/research/README.md`](src/modules/local-db/research/README.md)
  — how research objects are grafted onto Twenty's metadata
