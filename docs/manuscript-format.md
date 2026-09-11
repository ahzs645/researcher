# The researcher manuscript format

One self-contained description of the manuscript format this repository
defines. It is written to be handed over on its own — pasted into a chat,
attached to a task, or read by someone with no checkout — so that a draft can
be written in this format without browsing the codebase.

If you _are_ in the codebase and importing an existing paper, read
[`packages/twenty-front/src/modules/local-db/research/AGENTS.md`](../packages/twenty-front/src/modules/local-db/research/AGENTS.md)
instead: it is the authoritative transposition workflow and this file is a
summary of the format it produces.

---

## 1. What "the format" means here

Three separate things travel under that word. Keep them apart:

| Term                 | What it means in this repo                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Record model**     | How a paper is decomposed into `manuscript`, `manuscriptSection`, `figure` and `reference` records. Structural, journal-independent. |
| **Journal template** | A `journalTemplate` record: citation style, numbering, label and caption rules for one target venue. Presentation, swappable.        |
| **Export target**    | DOCX, PDF, HTML, JATS, Markdown, submission package, or portable ZIP. Rendering, chosen at export time.                              |

A draft can be complete in the record model while no journal template has been
chosen, and a journal template can be correct while the draft is still missing
references. They fail independently and should be reported independently.

## 2. The record model

### `manuscript` — the document

Document-level metadata: `name` (title), `manuscriptType` (paper, conference
paper, preprint, thesis, chapter), `status`, `targetVenue`, `doi`, `authorLine`,
`affiliations`, `correspondingAuthor`, `titlePageExtraLines`, supplement fields,
submission materials (cover letter, highlights, conflicts, suggested reviewers)
and `submissionExtras` for journal-specific form values.

Never infer a DOI, venue, author, affiliation or submission status that the
source does not state.

### `manuscriptSection` — one editable unit

| Field             | Meaning                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `name`            | Visible heading text                                                                 |
| `sectionType`     | `ABSTRACT`, `METHODS`, `RESULTS`, `DISCUSSION`, `REFERENCES`, `APPENDIX`, `OTHER`, … |
| `placement`       | `FRONT_MATTER`, `MAIN`, `BACK_MATTER`, `SUPPLEMENT`                                  |
| `content`         | Markdown plus the live tokens in §3                                                  |
| `orderIndex`      | Source reading order                                                                 |
| `level`           | Heading depth; 1 is top level                                                        |
| `includeInExport` | False only for source material that should not render                                |
| `wordCount`       | Derived from editable content, never copied from the source                          |
| `wordLimit`       | Only when the target format or source supplies one                                   |
| `status`          | Normally `DRAFTING` for a newly transposed paper                                     |

Do not merge distinct source sections to reduce record count. Headings,
captions, bibliography entries, running heads and page numbers are not body
paragraphs.

### `figure` — every numbered asset

The object name is historical. `assetKind` carries the real meaning:

| Asset kind      | Required representation                                           |
| --------------- | ----------------------------------------------------------------- |
| Figure / scheme | Image data or URL, caption, stable `refKey`                       |
| Table           | Editable Markdown grid in `tableData` — not a screenshot          |
| Box             | Caption and content as an asset where source semantics require it |
| Equation        | LaTeX body in `equationLatex`, **without** `$$` delimiters        |

Also preserve `sourceLabel` (the label the source printed, e.g. `2.6`, `S3`),
the full `caption`, `altText`, `credit`, `widthPercent`, `placement`,
`orderIndex`, owning `sectionId`, and `imageSource` provenance (`UPLOAD`,
`URL`, `DATASET`, `GENERATED`, `NONE`).

Every asset needs a unique, stable `refKey`. When a key changes, rewrite the
cross-reference and placement tokens together in the same step.

### `reference` — one bibliography entry

`cslJson` is the formatting source of truth and should hold the fullest valid
CSL-JSON available; flat fields (title, authors, year, container, DOI, URL,
volume, issue, pages) support editing and search and are derived from it.
`citationKey` is the stable key in-text citations use.

Deduplicate by normalized DOI, then citation key, then title and year. When a
collision forces a rename, rewrite every affected section token in the same
preparation step.

## 3. Live-token grammar

Section content is Markdown with semantic tokens. These are the Pandoc-friendly
forms the editor preserves and the exporters resolve against records.

| Purpose          | Syntax                      | Example                                |
| ---------------- | --------------------------- | -------------------------------------- |
| Citation         | `[@key]`                    | `Evidence [@li2017].`                  |
| Citation cluster | `[@first; @second]`         | `Prior work [@li2017; @smith2020].`    |
| Locator          | `[@key, p. 42]`             | `Reported elsewhere [@li2017, p. 42].` |
| Citation prefix  | `[see @key]`                | `[see @li2017]`                        |
| Suppress author  | `[-@key]`                   | `Li's model [-@li2017]`                |
| Cross-reference  | `[#asset-key]`              | `Shown in [#exposure-map].`            |
| Asset placement  | `[[asset:asset-key]]`       | `[[asset:exposure-map]]`               |
| Inline math      | `$latex$`                   | `$E = mc^2$`                           |
| Display math     | `$$latex$$` alone on a line | `$$E = mc^2$$`                         |

Rules:

- Keys contain no whitespace and no `]`; every key in a cluster starts with `@`.
- One token per source cluster — do not split one citation cluster into
  adjacent tokens. Preserve cluster order, locators, prefixes, suffixes and
  suppressed authors.
- Use `[#key]` wherever prose refers to an asset; put a standalone
  `[[asset:key]]` at the source's placement location.
- One asset normally has one placement marker. A duplicate placement is a
  warning that must be reviewed.
- Escape with a backslash to keep a token literal: `\[@not-a-citation]`, `\$5`.
- Tokens inside styled text, links and fenced code blocks stay literal.
- Keep ordinary unnumbered inline math inline. Use an equation asset only when
  the source numbers or cross-references the display equation.

Tables use GFM grids with merge markers: a cell of `<` continues the cell to
its left, `^` continues the cell above, and the `|---|` separator's position
sets the header depth.

## 4. Journal templates — the presentation layer

A `journalTemplate` record holds the target venue's format: `citationMode` and
`citationStyleId` (a CSL style id such as `nature`, `ieee`, `apa`,
`multidisciplinary-digital-publishing-institute`), `figureLabelFormat` and
`tableLabelFormat` (`Figure {n}`, `Table {n}`), `supplementPrefix`
(`S` → Figure S1), `numberingScope`, `crossRefFormat`, caption position and
size, two-column layout, abstract word limit, and the allowed output formats.

Bundled CSL styles resolve local-first from `packages/twenty-front/public/csl/`
with a CDN fallback, so the common journals format offline. Nature, Science,
IEEE, MDPI/IJERPH, ACS, APA 7th and Chicago author-date have been checked
against real house style; Vancouver is online-only. See
[`paper-format-assessment/citation-formats-and-storage.md`](paper-format-assessment/citation-formats-and-storage.md).

## 5. Export targets

| Target                  | Use                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| DOCX / PDF              | Presentation exports for reading or submission                                                       |
| HTML                    | One self-contained file; MathML equations, data-URL images, citations linked to their entry and back |
| JATS                    | Structured XML                                                                                       |
| Markdown + bibliography | Inspectable text/data export                                                                         |
| Submission package ZIP  | Journal-facing; only when preflight passes                                                           |
| Portable research ZIP   | Canonical round-trip archive: `research-paper.json`, sections, references, embedded assets           |

The portable ZIP is the editable handoff. When fidelity matters, re-import it
into a clean workspace and confirm counts, keys, content and links survive.

## 6. Preflight — what blocks a submission package

Hard errors, which must block the submission package export:

- unresolved citations;
- unknown cross-references;
- unknown asset placements;
- missing figure images;
- empty or invalid equations;
- missing required title, author, abstract, keyword, journal or submission data.

Draft DOCX/PDF exports may still be produced **with visible warnings**. Do not
suppress warnings to show a clean status.

## 7. Drafting outside the app

To write a draft that can be imported later without losing structure, deliver
Markdown that already obeys §2 and §3:

1. One heading per section, in source order, at the right depth.
2. Section content as Markdown with live tokens — not rendered citation text.
   Write `[@li2017]`, not `(Li et al., 2017)`; the citation style is applied at
   export from the journal template, so pre-formatted citations have to be
   undone.
3. Tables as Markdown grids, not images.
4. Numbered display equations as `$$…$$` blocks with a stable key you also use
   in `[#key]` and `[[asset:key]]`.
5. A companion bibliography as CSL-JSON, keyed by the same `citationKey`
   values the tokens use. BibTeX is accepted and converted; CSL-JSON is
   preferred because it is stored verbatim.
6. State the target venue, or say that none has been chosen. Do not invent one.

A draft in this shape imports through the normal pipeline
(`manuscriptDocxFile.ts` → `manuscriptDocImport.ts` → the import wizard →
`manuscriptImportPrepare.ts`) rather than needing hand-built records.

## 8. Reporting rules

When a draft or transposition is handed back, report:

1. source file and output paths;
2. counts of sections, figures, tables, equations and references;
3. citations and asset links resolved;
4. unresolved or low-confidence items needing human review;
5. preflight errors and warnings;
6. tests or round-trip checks performed;
7. any source content intentionally omitted, and why.

Do not use "complete", "lossless" or "submission ready" without evidence from
the inventory, link reconciliation, preflight and export verification.

---

## Authoritative sources in this repo

| Topic                                              | File                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Full transposition workflow and fidelity checklist | `packages/twenty-front/src/modules/local-db/research/AGENTS.md`              |
| Token grammar reference                            | `docs/paper-format-assessment/manuscript-token-grammar.md`                   |
| Citation storage, CSL styles, Zotero               | `docs/paper-format-assessment/citation-formats-and-storage.md`               |
| Platform setup and gap assessment                  | `docs/paper-format-assessment/README.md`                                     |
| Research object model (source of truth for fields) | `packages/twenty-front/src/modules/local-db/research/researchObjectModel.ts` |
| Manuscript implementation                          | `packages/twenty-front/src/modules/local-db/research/manuscript/`            |
