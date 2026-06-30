# Follow-up tests: obligations, manuscript import, export

Testing the three things asked: a weekly recurring obligation (lab slide deck),
importing a real manuscript into sections while keeping citations, and export.

## 1. Obligations — a weekly lab slide deck ✅ (after a fix)

**Gap found:** the recurrence engine only knew month-based cadences
(`MONTHLY / QUARTERLY / SEMI_ANNUAL / ANNUAL`) — there was **no WEEKLY**, and the
obligation create form had **no recurrence picker at all** (so user-created
obligations never recurred). A weekly slide could not be represented.

**Fixed:**
- Added `WEEKLY` and `BIWEEKLY` cadences (day-based: +7 / +14 days) to the model
  and the recurrence engine, plus a `PRESENTATION / slides` obligation type.
- Added a recurrence picker to the obligations create form, so you can set
  "Repeats: Weekly" when adding the slide deck.
- Seeded a demo example: **"Week 15 lab slide deck"** (PRESENTATION, WEEKLY).
  Marking it complete auto-creates **"Week 16 lab slide deck"** due 7 days later.

Verified (10/10 assertions): `WEEKLY` due 2026-04-10 → next 2026-04-17;
`BIWEEKLY` → 2026-04-24; month-boundary 2026-04-28 → 2026-05-05; the period label
`Week 12` → `Week 13`; and the title `Week 12 slide deck` → `Week 13 slide deck`.
Monthly/quarterly/annual still behave as before.

## 2. Manuscript import — sections + citations ✅ (with a caveat)

Fed a realistic air-quality manuscript (headings, a data table, author-date AND
numeric in-text citations, a References section) through the importer:

```
TITLE: Indoor Air Quality in Elementary School Classrooms
  [ABSTRACT/FRONT_MATTER]   "Abstract"               (20w)
  [INTRODUCTION/MAIN]       "1. Introduction"        (24w)
  [METHODS/MAIN]            "2. Materials and Methods"(37w)
  [RESULTS/MAIN]            "Results"                (8w)
  [DISCUSSION/MAIN]         "Discussion"             (6w)
  [REFERENCES/BACK_MATTER]  "References"             (21w)
```

- Sections are split and **classified** correctly (front/main/back matter).
- **Citations are preserved verbatim** — both `(Mendell et al., 2013; Fuzzi et
  al., 2015)` and `[1]` survive in the section text; the data table stays inline;
  the References list is captured. The Word `.docx` path behaves the same.

**Caveat (the honest part):** citations are kept as **literal text**, not yet
reconstructed into *live* `[@key]` citations linked to `reference` records, and
the References section is one text block, not parsed into individual references.
So an imported paper reads correctly, but its in-text citations won't be
re-formatted into a chosen journal's style (or a generated bibliography) until
they're reconciled. To get live citations today: import the bibliography
separately (Zotero / BibTeX / DOI — now de-duplicated) and use `[@key]` markers.

**Bigger caveat — PDF:** the importer accepts `.docx / .md / .txt`, **not
`.pdf`**. The manuscript in the Drive folder is a PDF (`HHSC 490
Manuscript.pdf`), so it must be saved as `.docx` first, or we add PDF text
extraction (pdf.js) — see "what's left".

## 3. Export

The DOCX/PDF/Markdown export engine was verified working end-to-end earlier
(a real `.docx` with sections, a Word table, figures and a numbered bibliography
— see `sample-export.docx`). Imported sections feed the **same** section/figure/
reference model, so they export identically. The one limitation follows from §2:
imported plain-text citations export as plain text — a live, re-styled
bibliography only appears for `[@key]` citations backed by `reference` records.

(End-to-end export of *imported* content couldn't be re-run in this sandbox: the
deployed demo is built from `main`, before these features, and a local build is
blocked by a broken `yarn install` on the flaky proxy. CI / a branch preview can
confirm it.)

## What's left (prioritized)

1. **PDF import** — extract text/headings from `.pdf` (pdf.js) so real PDFs go in
   directly. Highest impact: the user's manuscripts are PDFs.
2. **Citation reconciliation on import** — parse the References section into
   `reference` records and convert in-text `[1]` / `(Author, Year)` to `[@key]`,
   so imported papers get live, re-styleable citations + a generated bibliography.
3. **Vancouver CSL offline** — bundle it once a reachable mirror is found (works
   online today via CDN fallback).
4. **Shared reference library + 2-way Zotero sync** — one cross-manuscript
   library, incremental sync, collections (today: per-manuscript, one-way import).
5. **Figure extraction from imported tables** — optionally lift standalone tables
   into numbered `figure` records (today they stay inline).
6. **Full CI verification** — run the project's jest/typecheck/lint (blocked
   locally here); pure logic was validated via standalone harnesses.
