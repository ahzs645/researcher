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

1. **PDF import** — ✅ **done.** A dependency-free, best-effort extractor parses
   text-based PDFs (objects + native `DecompressionStream` inflate of FlateDecode
   streams; text from `Tj`/`TJ` operators) and feeds the importer. `.pdf` is now
   accepted. Caveat: PDFs carry no heading structure, so it usually yields one
   "Body" section to split, and scanned/image or exotic-font PDFs aren't
   supported (save as .docx). Verified on crafted uncompressed + Flate PDFs (7/7).
2. **Citation reconciliation on import** — ✅ **done.** The References section is
   parsed into `reference` records (CSL-JSON-first, author-year keys, DOI), and
   in-text `[1]` / `[1,2]` / `[1–3]` and `(Author et al., Year)` (incl. grouped
   cites) are rewritten to live `[@key]`. On by default in the Import panel.
   Verified (14/14 + end-to-end 6/6). Note: free-text reference *fields* are
   heuristic (author/year/DOI reliable; title/journal best-effort, raw text kept
   in notes) — but the in-text linking is exact.
3. **Vancouver CSL offline** — ✅ **done.** Bundled `vancouver.csl` and added a
   "Vancouver (numeric, biomedical)" template; renders offline
   (`1. Mendell MJ, … Indoor Air. 2013;23(6):515–28.`).
4. **Shared reference library + 2-way Zotero sync** — still open. Needs a
   cross-manuscript library object + incremental/collection sync; one-way,
   per-manuscript import works today (now de-duplicated).
5. **Figure extraction from imported tables** — ✅ **done.** Standalone tables
   are lifted into numbered `figure` (TABLE) records with a parsed caption, and
   replaced in the body by a resolvable `[#imported-table-N]` cross-ref.
6. **Full CI verification** — still open (the project's jest/typecheck/lint can't
   run here — broken `yarn install`); all pure logic was validated via standalone
   `tsx`/`citeproc` harnesses, and jest tests are written for every module.
