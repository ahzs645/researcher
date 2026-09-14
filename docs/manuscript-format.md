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

All six citation forms are parsed by one shared tokenizer
(`manuscript/manuscriptCitationTokens.ts`) used by the editor, the preflight
checks, the bibliography collector and every exporter, so a locator, prefix or
suppressed author survives to the rendered output instead of being dropped at
export. `manuscript/__tests__/manuscriptCitationTokens.test.ts` asserts each
form's rendered result, including that escaped and code-span tokens stay
literal.

## 4. Journal templates — the presentation layer

A `journalTemplate` record holds the target venue's format: `citationMode` and
`citationStyleId` (a CSL style id such as `nature`, `ieee`, `apa`,
`multidisciplinary-digital-publishing-institute`), `figureLabelFormat` and
`tableLabelFormat` (`Figure {n}`, `Table {n}`), `supplementPrefix`
(`S` → Figure S1), `numberingScope`, `crossRefFormat`, caption position and
size, two-column layout, abstract word limit, and the allowed output formats.

The 15 bundled CSL styles are compiled into the JavaScript bundle as raw XML
(`research/manuscript/csl-styles/`, imported with Vite's `?raw`), together with
the `en-US` locale. Citation formatting therefore needs **no network at all** —
there is no CDN fallback to fail. Nature, Science, IEEE, MDPI/IJERPH, ACS,
APA 7th and Chicago author-date have been checked against real house style;
Vancouver, AMA, Elsevier-Harvard, Springer and four air-quality/environmental
journal styles are also bundled. See
[`paper-format-assessment/citation-formats-and-storage.md`](paper-format-assessment/citation-formats-and-storage.md).

**Requested style is not proof of application.** Every assembled
`ManuscriptBundle` carries `citationProvenance`: `requestedStyleId`,
`appliedStyleId`, and `engineOutcome`. `appliedStyleId: "built-in"` explicitly
identifies the generic formatter, rather than labeling its output as APA or
another requested CSL style. CSL preparation records one of these outcomes:

| Configuration / result                            | Outcome              | Submission package          | Draft exports                                           |
| ------------------------------------------------- | -------------------- | --------------------------- | ------------------------------------------------------- |
| Empty, absent, or whitespace-only style ID        | `not-requested`      | No citation-style error     | Generic formatting by configuration; no failure warning |
| Nonempty ID, not yet checked                      | `not-prepared`       | Blocked pending preparation | UI waits for preparation                                |
| Requested ID is not bundled                       | `style-not-vendored` | Blocked                     | Built-in fallback with a visible warning                |
| Engine could not be created                       | `engine-unavailable` | Blocked                     | Built-in fallback with a visible warning                |
| Engine or citation/bibliography formatting throws | `engine-error`       | Blocked                     | Built-in fallback with the captured `errorMessage`      |
| Bundled style applies successfully                | `applied`            | No citation-style error     | Requested and applied IDs match                         |

A nonempty unsupported ID is a failed request, **not** deliberate generic
formatting. To choose the latter, select a lightweight citation mode; this
clears `citationStyleId`. The picker retains unsupported IDs as unavailable
requests instead of displaying them as a selected lightweight mode.

The Export panel shows the outcome before download. Preparation is tied to
the selected manuscript and style: an older asynchronous result cannot make a
new selection ready. A failed attempt can be retried with **Recheck citation
formatting**. Renderers reuse the prepared result checked by preflight; they
do not silently retry a different formatter after a successful check.
Caption and table-grid citations participate in the same CSL preparation.
This records formatter application, not a guarantee of journal compliance or
lossless rendering.

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

Display equations in PDF are typeset as vector shapes with bundled MathJax
fonts; invalid or unsupported math raises an export error instead of silently
dropping symbols. Word equations remain editable native OMML, with native
accents and explicit hidden summation-limit slots for reader compatibility.
The editor protects LaTeX before Markdown parsing so saving prose does not
consume equation underscores or backslashes. These changes preserve fresh
imports; they cannot reconstruct equation text already damaged in saved records.

DOCX images retain their actual PNG/JPEG/GIF/BMP format and bytes; other
browser-decodable formats are converted to PNG. PDF tables use conservative
row-height estimates to keep small tables together and repeat headers between
groups of rows in longer tables. A single oversized row or merged group may
still span pages without a repeated header inside that group. Inspect rendered
pages before submission, especially equations, wide tables and long captions.
An explicit Word Subtitle stays in title-page extras, not the inferred author
line; missing authors still require source-backed details.

Built-in DOCX, PDF, HTML, JATS, and Markdown export adapters attach the
outcome to their returned `ExportFile` objects and download a companion
`citation-formatting.json`. Keep that report with the presentation file: its
requested/applied IDs, outcome, captured message (if any), and warnings describe
what the app applied. The document body is not rewritten to hide or correct a
failed style. Standalone HTML also includes a visible fallback alert inside the
page. The low-level Blob/string helpers still return just their document;
integrations using those helpers directly must retain the prepared bundle's
provenance and expose the warning, as the built-in adapters do.

The submission ZIP includes the outcome in `metadata.json` and its readiness
manifest. When a portable source is supplied, `research-paper.json` records it
as optional top-level `citationProvenance`, adjacent to `exportStyle` rather
than overriding the requested configuration. Standalone portable backups
remain available after a style failure and record that failure too. Older
version-1 archives without the field still read. This historical field is not
imported as current readiness: rebuilding the manuscript requires fresh
citation preparation. No style bytes, renderer hash, or guide digest are
asserted by the outcome record.

**Word style import is styles, not a whole template.** Supplying your own
`.docx` lifts `word/styles.xml` — fonts and heading styles — and uses it as the
export's style base. It does not carry over the donor document's page geometry,
headers, footers, numbering definitions or theme parts; the exporter sets its
own 1-inch margins regardless. Treat it as "use my fonts and heading styles",
not "reproduce my template".

## 6. Preflight — what blocks a submission package

Hard errors, which must block the submission package export:

- unresolved citations;
- a requested citation style that is pending or failed to apply (unsupported
  style, unavailable engine, or engine error);
- unknown cross-references;
- unknown asset placements;
- missing figure images;
- empty or invalid equations;
- missing required title, author, abstract, keyword, journal or submission data.

The existing `validateSubmission` check list contains the citation-formatting
check; it is not a second readiness system. `createSubmissionPackage` prepares
citations, validates the prepared bundle, and rejects any hard errors **before
rendering or writing package members**. This guards direct API calls as well as
the disabled UI button. Successful CSL application does not bypass other hard
errors.

Draft DOCX/PDF exports may still be produced **with visible warnings**. A failed
requested style is shown as a persistent Export-panel alert and a warning
notification when a draft is downloaded, not a clean success notification.
The companion JSON records the same failure. Deliberate generic formatting
shows informational status rather than a failure. Do not suppress warnings to
show a clean status.

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
   in `[#key]` and `[[asset:key]]`. **Not supported by the importer yet — see
   the gap note below.**
5. A companion bibliography as CSL-JSON, keyed by the same `citationKey`
   values the tokens use. BibTeX is accepted and converted; CSL-JSON is
   preferred because it is stored verbatim.
6. State the target venue, or say that none has been chosen. Do not invent one.

A draft in this shape imports through the normal pipeline
(`manuscriptDocxFile.ts` → `manuscriptDocImport.ts` → the import wizard →
`manuscriptImportPrepare.ts`) rather than needing hand-built records.

This section is an executed contract, not a description. The fixture in
`manuscript/__tests__/manuscriptDraftingOutsideTheAppFixture.ts` is a draft
written exactly as above, and
`manuscript/__tests__/manuscriptDraftingOutsideTheAppRoundTrip.test.ts` drives
it through the real import pipeline. Section order and depth, cluster order and
locators, citation resolution against the bibliography, tables staying editable
grids with their merge markers, and figure/table cross-references each
resolving to exactly one asset are asserted and green. If this section drifts
from what the importer does, that suite fails.

Its scope is import only. The file reader, the wizard commit, export rendering,
and re-import into a fresh workspace are **not** covered by it — do not read a
green run as end-to-end proof.

**Item 4 is the exception — it does not hold yet.** The importer classifies a `$$…$$` block as an
equation but re-serializes it straight back into the section body: nothing
outside the portable-package path ever creates an `assetKind: 'EQUATION'`
record, so the `[#key]` and `[[asset:key]]` an author writes for a numbered
display equation resolve to nothing — which §6 counts as two hard preflight
errors. The two assertions covering it are marked `it.failing` in that suite,
so they turn red the moment the pipeline starts keeping the promise.

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

## Known limits

Recorded here so the rest of this document can be read as accurate.

| Limit                                                                  | Effect                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Numbered display equations are not extracted into assets               | §7 item 4. An author's `[#key]` and `[[asset:key]]` for a numbered equation resolve to nothing, which §6 counts as two hard preflight errors. Two `it.failing` tests stand as tripwires.                                                                        |
| Word template import is styles only                                    | Fonts and heading styles carry over; page geometry, headers, footers, numbering and theme parts do not. See §5.                                                                                                                                                 |
| Format provenance is an outcome record, not a reproducible environment | The manifest records requested/applied citation style and engine outcome, but not the guide identity/digest, CSL bytes or renderer version/hash. Re-import restores content and requested configuration, not proof that the current renderer applied the style. |
| The §7 contract covers import only                                     | File reader, wizard commit, export rendering and fresh-workspace re-import are not exercised by that suite.                                                                                                                                                     |

Do not describe an export as "lossless", "exactly formatted" or "submission
ready" while these stand.

## Authoritative sources in this repo

| Topic                                              | File                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Full transposition workflow and fidelity checklist | `packages/twenty-front/src/modules/local-db/research/AGENTS.md`              |
| Token grammar reference                            | `docs/paper-format-assessment/manuscript-token-grammar.md`                   |
| Citation storage, CSL styles, Zotero               | `docs/paper-format-assessment/citation-formats-and-storage.md`               |
| Platform setup and gap assessment                  | `docs/paper-format-assessment/README.md`                                     |
| Research object model (source of truth for fields) | `packages/twenty-front/src/modules/local-db/research/researchObjectModel.ts` |
| Manuscript implementation                          | `packages/twenty-front/src/modules/local-db/research/manuscript/`            |
