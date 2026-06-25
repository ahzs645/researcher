# Compose view rebuild — verification screenshots

Captured against a local dev server (`nx start twenty-front`, demo mode) to
verify the manuscript Compose surface and the trimmed manuscript record tabs.

## Before
- `compose-1.png`, `compose-mobile.png` — the old composer at a mobile viewport:
  a fixed 3-column desktop grid that overflowed horizontally and was unusable.

## After — Compose view (standard components, responsive)
- `compose-new-mobile.png` / `compose-new-2.png` — single-column mobile layout
  with the shared `Select` (manuscript), `H1Title`/`H2Title` headings, standard
  `Button`s, and the journal-format `Select`.
- `compose-new-editor.png` — section `Select` + the BlockNote editor showing real
  content, with Figures & tables below.
- `compose-new-desktop.png` — same surface on desktop: a centered, readable
  single-column document editor.

## After — trimmed manuscript record tabs (Home + Timeline only)
- `section-detail-mobile.png` / `section-detail-desktop.png` — a manuscript
  section record: Tasks / Notes / Files removed, Timeline kept as history.
- `manuscript-detail-mobile.png` — a manuscript record, likewise trimmed.
- `project-detail-mobile.png` — regression check: a normal object still shows the
  full tab set (Home, Timeline, Tasks, +11 More).
