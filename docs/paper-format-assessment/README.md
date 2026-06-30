# Research-paper format process — setup & gap assessment

A walkthrough of how the **researcher** platform is set up, and a hands-on test of
the "research paper format" pipeline driven through the live demo
(`projects.ahmadjalil.com/researcher/`, the static Dexie build).

The test inputs were a real solo-researcher Drive folder (an air-quality thesis:
`HHSC 490 Manuscript.pdf`, a published `Bertasson_ijerph-air-schools.pdf`, a
journal `Submission file`, `Grant Project.docx` / `Proposal.docx` / `TF.docx`,
plus `2018 Data` / `2023 Thesis` / `Data` / `Map qgis` folders and Slides/Sheets).
**None of that data was embedded into the repo** — it was only used to decide what
to try to put through the interface, and to see where the process breaks.

---

## 1. How the platform is set up

This is a fork of **Twenty CRM** re-skinned into a research workspace. The key
architectural decision: it runs **without the Twenty backend**. Instead, a
"bridge" data source serves the standard Twenty object machinery from the
browser.

### Runtime modes (`REACT_APP_DATA_MODE`)
| Mode | Storage | Used by |
| --- | --- | --- |
| `local` | **Dexie / IndexedDB** in the browser | the GitHub Pages static demo |
| `convex` | a Convex deployment (HTTP actions) | the "next step" backend (parity, not the default) |
| in-memory | RAM | tests |

The deployed site (`.github/workflows/deploy-github-pages.yaml`) builds
`twenty-front` with `REACT_APP_DATA_MODE=local` and publishes a fully static SPA.
Every create/edit persists to the visitor's own IndexedDB — there is no server,
no account, no sharing.

### Research objects are *grafted on*, not backend standard-objects
`packages/twenty-front/src/modules/local-db/research/` appends research objects to
the static metadata the bridge reads (`researchObjectModel.ts` is the source of
truth). The nav is reshaped into four folders — **Lab/My research**, **Work**,
**Funding**, **Discovery** — and People→*Collaborators*, Companies→*Institutions*
are repurposed. See `research/README.md` for the merge points.

### Two seed modes — this matters a lot for "what templates we have"
`getResearchSeedMode.ts` decides what a fresh browser sees:

- **`blank` (the default).** Visiting `/researcher/` gives an **empty** workspace.
  Journal templates list = **0** (screenshot `01`). No manuscripts, no templates,
  no starter scaffold — just "Add your first Journal template".
- **`demo` (opt-in via `/demo` or `?demo=1`).** Loads the coherent sample dataset:
  the 3 journal templates, 4 manuscripts (one fully written), figures, tables and
  references.

`/reset` wipes IndexedDB back to blank. So the "demo interface" the templates live
in is specifically the `?demo=1` seed — a first-time visitor on the bare URL sees
none of it.

---

## 2. The research-paper data model

Defined in `researchObjectModel.ts`, surfaced under **Work**:

| Object | Role in the paper process |
| --- | --- |
| `manuscript` | the paper/preprint/thesis/chapter (type, status, target venue, DOI, progress) |
| `manuscriptSection` | a section: type + placement (front/main/back/supplement), **Markdown** body, word limit/count, include-in-export |
| `figure` | numbered figure/table/scheme: `refKey` for cross-refs, caption, `tableData` (Markdown table), image as URL or data-URL |
| `reference` | a bibliography entry stored as **CSL-JSON** (the source of truth), with a `citationKey` used in text as `[@key]` |
| `journalTemplate` | the *format*: citation style + CSL style id + figure/table label templates + numbering scope + caption position + abstract word limit + two-column + output formats |

Authoring conventions (from the section field help): Markdown body, math as `$…$`,
citations as `[@key]`, cross-refs as `[#fig:label]`.

---

## 3. The Compose pipeline (what was tested live)

`/compose` (`ManuscriptComposerPage.tsx`, nav "Compose paper") is a single-column
editor with five panels. Tested against the seeded *"Topological insulator
substrates for robust qubits"* manuscript:

1. **Sections** — pick/add a section; body edits in a WYSIWYG (BlockNote) editor
   (screenshot `03`). Word count auto-updates on save.
2. **Figures & tables** — caption, kind (Figure/Table/Scheme), placement
   (Main/Supplement), image URL **or** upload (data-URL). Tables render from a
   Markdown grid. Figures carry a `[#refKey]` for cross-references.
3. **Export** — journal-format dropdown + three buttons, all **offline /
   client-side**: **Word (.docx)**, **PDF**, **Markdown + bibliography (JSON)**.
4. **References** — add by **DOI**, paste **BibTeX/CSL-JSON**, or **import from
   Zotero** (user/group library + API key). A live **CSL-formatted bibliography**
   ("Formatted references") renders above the list (screenshot `04`).

### Does it work? Yes — for content authored *in the tool*.
Clicking **Export → Word (.docx)** produced a valid `.docx`
(`sample-export.docx` in this folder) containing: the title, Abstract,
Introduction with superscript numeric citations (¹,²,³), Figure 1 caption, a real
Word **table** (Table 1 with the data rows), cross-references (Fig. 1, Table 1),
and a numbered bibliography. `file` confirms "Microsoft Word 2007+"; the zip has
proper `document.xml`, `styles.xml`, `numbering.xml`, footnotes/endnotes.

### Templates we have (exactly three) — screenshot `02`
| Name | Citation style | CSL id | Numbering | Figure label | Two-col |
| --- | --- | --- | --- | --- | --- |
| Nature (numeric, superscript) | Superscript ¹ | `nature` | Continuous | `Figure {n}` | No |
| IEEE Transactions | Numeric [1] | `ieee` | Continuous | `Fig. {n}` | Yes |
| Generic (author–date) | Author–date | `apa` | Continuous | `Figure {n}` | No |

These exist **only in `demo` mode**. CSL styles are fetched live from the jsDelivr
CSL repo (`manuscriptCsl.ts`), so in principle *any* style id works — but only
with network at format time; offline falls back to a built-in formatter.

---

## 4. Putting the Drive examples through it — what's missing

Mapping the real folder to the platform exposes the gaps:

| Drive item | Where it'd go | Blocker |
| --- | --- | --- |
| `HHSC 490 Manuscript.pdf` (thesis) | `manuscript` (THESIS) + sections | **No manuscript importer.** Body must be retyped as Markdown sections. |
| `Bertasson_ijerph-air-schools.pdf` (published IJERPH paper) | target format / a `reference` | **No IJERPH/MDPI template.** Add by DOI works only online. |
| `Submission file` (PDF) | `manuscript` (SUBMITTED) | same — no PDF ingest |
| `Grant Project.docx`, `Proposal.docx`, `TF.docx` | **Funding** pipeline (`grantApplication`/`applicationSection`/`reusableAnswer`) — *not* the paper composer | no DOCX import there either |
| `…Air Quality` Doc, `Things to incorporate` Doc | `note` / `reusableAnswer` | manual copy-paste |
| `Thesis Presentation Graph` (Sheets) | `dataset` → `figure` | **No data→figure/chart.** Upload a static image only. |
| `2018 Data` / `Data` / `Map qgis` folders | `dataset` (metadata) / `figure` (map image) | no file/folder ingest; QGIS maps are just images |
| `…Presentation` (Slides) | — | no "presentation/output" object |

### Prioritized gap list

1. **No ingest of existing documents (the #1 blocker).** A researcher's papers
   already *exist* as `.docx`/`.pdf`/Google Docs. The composer can only author
   from scratch — only *references* import (BibTeX/CSL/DOI/Zotero). Grafting a
   DOCX→sections importer (e.g. `mammoth` → Markdown) would unlock the whole
   real-world workflow.
2. **Bare first-run has nothing.** Default `blank` mode ships zero templates and
   no section scaffold. New users hit an empty Journal-templates table. Either
   seed a small starter template pack in `blank`, or add a one-click "install
   starter formats" action.
3. **Thin, hand-built template library.** Only Nature/IEEE/APA, none matching the
   examples (IJERPH/MDPI, a thesis layout, conference styles). `journalTemplate`
   is just data, but there's no picker/marketplace and the matching CSL style must
   exist and be fetchable.
4. **No journal-driven section scaffolding.** "Add section" yields a blank
   `OTHER`; the template doesn't generate an IMRaD skeleton or enforce the
   `abstractWordLimit` while writing.
5. **Figures are images only.** No dataset→chart, no figure↔`dataset` link, no map
   handling beyond a pasted/uploaded image.
6. **Network-dependent on the static site.** CSL style fetch (jsDelivr), DOI
   lookup (CrossRef), and Zotero API all need connectivity/CORS; offline they
   degrade to the fallback formatter / fail silently.
7. **No persistence or collaboration beyond the browser** in demo/static mode
   (IndexedDB only). Convex is the planned backend but not the default.

---

## 5. Recommendation

The format *engine* is solid and genuinely works end-to-end (sections → figures →
CSL references → DOCX/PDF, offline). The platform is currently a strong
**authoring + format** tool but a weak **ingest** tool, so it can't yet absorb an
existing body of work like the Drive folder. The highest-leverage next steps, in
order: (1) a DOCX/Markdown **manuscript importer**, (2) a **starter template pack
in blank mode** + a journal/template picker, (3) **section scaffolding** driven by
the chosen `journalTemplate`.

*Screenshots `01`–`04` and `sample-export.docx` in this folder are the captured
evidence from the live demo run.*
