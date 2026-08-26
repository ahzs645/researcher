# What the other manuscript frameworks do, and what is worth taking

A survey of the open-source projects solving the same problem the composer
solves — a structured manuscript that becomes a journal-ready document —
read against what this app already does. Written August 2026.

The recommendations at the end are ordered by what they would actually change
about using this app on a real paper, not by how interesting they are.

## The projects

| Project | What it is | Its shape |
| --- | --- | --- |
| [MyST / mystmd](https://mystmd.org/guide) (Jupyter Book, Curvenote) | A Markdown superset for scientific writing, with a CLI that exports PDF/LaTeX/DOCX/JATS/Typst and a web renderer. | Author in Markdown; structure comes from directives and roles. |
| [Manubot](https://manubot.org/) | Manuscripts as a git repository, built by CI on every push. | Author in Markdown; citations are identifiers, not entries. |
| [Quarto](https://quarto.org/docs/authoring/cross-references.html) | Pandoc-based publishing system with a cross-reference engine and journal article templates. | Author in Markdown/notebooks; Lua filters resolve references. |
| [Pandoc Scholar](https://pandoc-scholar.github.io/) | A Pandoc pipeline that adds JATS and semantic metadata to Markdown manuscripts. | A conversion toolchain, not an editor. |
| [Texture](https://elifesciences.org/labs/8de87c33/texture-an-open-science-manuscript-editor) (eLife) | A WYSIWYG editor whose document model *is* JATS. | Edit the archival XML directly. |
| [Fidus Writer](https://www.fiduswriter.org/how-it-works/) | Collaborative academic word processor with a built-in citation manager and JATS export. | Content-first editor; layout applied later. |
| [Kotahi](https://www.ncbi.nlm.nih.gov/books/NBK579686/) (Coko) | Journal production system around the Wax editor; single source to JATS/PDF/HTML. | Publisher-side workflow. |
| [ASWG pipeline](https://www.bihealth.org/en/quest/service/service/automated-screening-tools) | Not an editor: a set of screeners that read a finished manuscript and report problems. | A quality gate. |

Two things stand out immediately.

**Almost all of them are author-in-Markdown-first.** MyST, Manubot, Quarto and
Pandoc Scholar all assume the paper starts in their syntax. Texture and Fidus
Writer assume it starts in their editor. None of them takes an existing Word
manuscript, reads its structure, and hands it back looking like itself — which
is the thing this app was built to do and the thing that made the AMT paper
work at all. That position is unusual and worth keeping.

**Word output is where everyone gives up.** Quarto emits cross-references into
DOCX as plain text ([discussion #2464](https://github.com/orgs/quarto-dev/discussions/2464)).
Pandoc has a `native_numbering` extension that numbers captions via Word
counter fields, but it is off by default and breaks the external cross-ref
filters everyone actually uses ([issue #7499](https://github.com/jgm/pandoc/issues/7499)),
and it does not make the *references* fields either. The SEQ-field-in-a-
bookmark plus REF-field pairing this app now writes is ahead of the tools it is
being compared to. Worth knowing before treating any of the below as catching
up.

## Where we actually stand

Already here: Word/PDF/Markdown/portable-ZIP import with structure mapping,
sections and typed assets, CSL-JSON references through citeproc with 16
vendored styles, 16 journal profiles, cross-references and numbering, DOCX /
PDF / HTML / JATS / Markdown-bundle / portable-ZIP / submission-package
exports, submission readiness against a journal profile, and — as of this
week — inline maths as real equation objects and live Word numbering fields.

The six gaps below were the ones that mattered, and all six have since been
built. They are kept as written because they record what was missing and why
it was worth doing. What the eight projects still do that this app does not is
a separate, later audit: [What they still do that we do not](#what-they-still-do-that-we-do-not).

---

## 1. Tracked changes and comments are silently accepted

**Verified, not assumed.** Feeding the importer a paragraph with a tracked
insertion and a tracked deletion:

```
<w:r><w:t>The window is </w:t></w:r>
<w:ins …><w:r><w:t>strictly </w:t></w:r></w:ins>
<w:del …><w:r><w:delText>loosely </w:delText></w:r></w:del>
<w:r><w:t>aligned.</w:t></w:r>
```

imports as `The window is strictly aligned.` with no warning. The insertion is
kept because it lives in `<w:t>`; the deletion vanishes because it lives in
`<w:delText>`, which the run reader does not look at. That is "accept all
changes", chosen by accident, and stated nowhere.

The AETH master happens to be clean — 0 `w:ins`, 0 `w:del`, no
`word/comments.xml` — so this has not bitten yet. It will the first time a
manuscript comes back from a co-author, which is the normal way these documents
move.

Pandoc is the reference model here:
[`--track-changes=accept|reject|all`](https://pandoc.org/MANUAL.html), where
`all` keeps insertions, deletions and comments as marked spans. Its own
limitations are documented and worth avoiding: comments are dropped under
accept and reject, and there is no way to accept *all* changes rather than only
insertions ([issue #6801](https://github.com/jgm/pandoc/issues/6801)).

**What to build.** Minimum: detect `w:ins`/`w:del`/`commentReference` and say
so as an import warning, with counts. Better: a choice in the map step —
accept, reject, or import the changes as marks — and comments imported as
notes against the section they anchor to. The importer already has a per-run
pass for scripts, which is where the deleted text would be read.

*Lands in* `manuscriptDocImport.ts` (run reader, `ImportedDocument.warnings`),
the wizard map step, and a `comments` field on the section record.

## 2. Nothing checks whether a cited paper has been retracted

Crossref [absorbed the Retraction Watch database in 2023](https://www.crossref.org/blog/retraction-watch-retractions-now-in-the-crossref-api/)
and serves it free through the REST API and as a bulk CSV. Zotero's Retraction
Scanner plugin uses it to badge library items and warn at citation-insertion
time; the ASWG pipeline uses `scite` for the same purpose.

We already fetch `doi.org` for CSL-JSON when importing a reference, so the
network path and the DOI are both in hand. A retracted citation is the single
most damaging reference error a paper can carry and the cheapest to catch.

*Lands in* `manuscriptReferenceUsage.ts` and the readiness panel, next to the
existing "Citation [@key] has no matching reference" warning.

## 3. Author metadata is thinner than the journals now require

`ManuscriptAuthor` is `{ id, name, affiliationIds, isCorresponding }`. Compare
[MyST's frontmatter](https://mystmd.org/guide/frontmatter), which carries
`orcid`, `email`, `roles` (CRediT), `equal_contributor`, `note`, and
affiliations with `ror`, `isni`, `department`, `city`, `country` — plus
`funding` with award IDs, sources, investigators and recipients.

This is not completeness for its own sake. [CRediT](https://credit.niso.org/)
is 14 roles, native in JATS as `<contrib><role>`, used by 50+ publishers, and
required by Elsevier at submission. Our JATS export cannot emit what we do not
store, and the readiness panel cannot check a field that does not exist —
which is why "Ordered authors", "Corresponding-author institution" and
"Author affiliations" all sit in the AMT checklist as items the app tells you
to go fix by hand.

**What to build.** ORCID and email per author; CRediT roles per author; ROR and
structured address per affiliation; a funding record with funder + award ID.
Then wire them into the JATS writer and the readiness checks.

*Lands in* `manuscriptContributors.ts`, `manuscriptJatsExport.ts`, the
contributors editor, `manuscriptSubmissionRequirements.ts`.

## 4. Citation by identifier stops at the DOI

Manubot's central idea is that you cite a *persistent identifier* — DOI, PMID,
ISBN, arXiv ID, URL — and the metadata is fetched and formatted for you, so
there is no reference manager and no entry to get wrong. We do DOI, plus
pasted BibTeX, pasted CSL-JSON, and a Zotero library pull.

PMID/PMCID and arXiv are two small resolvers away, and both are the everyday
identifier in fields this app is aimed at. ISBN and plain URL matter less.

*Lands in* `manuscriptReferenceImport.ts` and the reference-import tools panel.

## 5. Journal profiles should be data, not seed records

[MyST templates](https://github.com/myst-templates) is a GitHub organisation
with a template per journal family — 25 of them, reaching 471 journals —
listed through a JSON API and
contributable by anyone. Ours are 16 hardcoded `makeRecord('journalTemplate')`
calls, so adding a journal means editing the app.

We are most of the way to fixing this without adopting anyone's format: profiles
already have a stable `profileKey`, and a portable package already carries its
journal template and links or re-creates it on restore. The missing piece is
import/export of a profile on its own — one JSON file a lab can share, or a
folder the app reads at startup.

*Lands in* `manuscriptExportStyleOverrides.ts` (the serializer exists) and a
new profile import/export control beside the journal picker.

## 6. Readiness could check the things screeners check

The [ASWG tools](https://www.bihealth.org/en/quest/service/service/automated-screening-tools)
read a finished manuscript and report: open data / open code statements
(ODDPub), author-acknowledged limitations (limitation-recognizer), clinical
trial registration numbers verified against ClinicalTrials.gov
(TrialIdentifier), conflicts / funding / protocol registration statements
(rtransparent), rainbow colour maps in figures (JetFighter), bar graphs of
continuous data (Barzooka), and citations of retracted work (scite).

Our submission readiness panel is exactly the right home for these, and notably
[ODDPub — a regex-based tool — outperformed the ML tool on open-code
detection](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0342225),
so the useful half of this list is text matching over sections we already have
structured. The figure-image ones (JetFighter, Barzooka) need pixels and a
model; skip those.

*Lands in* `manuscriptSubmissionRequirements.ts` as additional checks.

## Deliberately not taking

- **Continuous publishing from git** (Manubot). It is the right answer for a
  repo-hosted manuscript and the wrong one for a local-first app with no
  backend.
- **JATS as the editing model** (Texture). Archival XML is an export target
  here, and making it the document model would give up the Word round trip.
- **Typst as a third typeset path** (MyST). This was taken after all — LaTeX and
  Typst source export both ship. What is still declined is rendering a journal's
  own template through jtex, and the reason first given here ("needs jtex") was
  wrong: Typst has a wasm compiler that runs in a browser, so local-first is not
  the obstacle. The obstacle is editorial. A jtex PDF is the journal's template
  deciding what the output looks like, where this app's promise is that the
  author's document decides.

## What happened next

All six were built, plus JATS import and the template registry itself. The
decisions behind them — and what they left open — are recorded in
[`../decisions/README.md`](../decisions/README.md).

One correction to this page: MyST's registry is **25 templates reaching 471
journals**, not 422 templates. The number quoted everywhere is the journals
those templates reach through their own required journal choice — MDPI alone
offers 355.

## What they still do that we do not

An audit against the eight projects in the survey, done by reading the code rather
than by recalling the survey. Every absence below was checked with a named grep or
a file read, and every claim about another project was re-confirmed against its
current documentation in August 2026. Several capabilities that look missing are
present in a different shape and are not counted as gaps: a figure can already be
*plotted* from a linked dataset record or a Markdown grid and re-rendered into the
DOCX at export time (`manuscript/manuscriptChart.ts`, `figure.datasetId`,
`imageSource: 'DATASET'`), Mermaid diagrams are drawn per export from source
(`manuscript/manuscriptDiagram.ts`), book-length work is representable as one
manuscript whose level-1 sections are chapters with chapter-scoped asset numbering
(`manuscript/manuscriptNumbering.ts`, `chapterBySectionId`) and a thesis cover page
(`titlePageTemplate`), and a co-author's tracked changes and comments already come
in from Word under an explicit `ACCEPT`/`REJECT` choice. Those are differences of
shape, not holes.

What follows is thirteen real differences, grouped by whether they are a deliberate
no, a different product, or simply unbuilt.

### Blocked by position

- **Executable content — MyST and Quarto.** MyST executes `.ipynb` cells, `code-cell`
  directives and inline `eval` roles at build time against a Jupyter kernel, and can
  ship a JupyterLite runtime so the reader re-runs the code in their own browser;
  Quarto does the same through knitr and Jupyter engines with `fig-cap` on computed
  figures. Nothing of the kind is here: grepping the module for
  `notebook|ipynb|jupyter|executable|kernel|pyodide|code.?cell|execute` returns only
  the word "notebooks" inside a screening regex and "Electronic lab notebook" in seed
  data. This is blocked by the Word-first round trip rather than by local-first —
  MyST's JupyterLite path proves in-browser execution is possible without a server,
  so no-backend is not the obstacle. The obstacle is that a `.docx` has no cell and no
  output object, so the moment the manuscript goes back to Word the code stops being
  code and becomes a picture, and the provenance cannot survive the trip out and
  back. The app already occupies the useful half of that space by regenerating a
  figure from a dataset record at export, which is re-execution of the only step that
  has to be re-executed to keep a figure honest.

- **Real-time collaborative editing — Fidus Writer and Kotahi.** Fidus Writer lets
  collaborators type into one document simultaneously and carries comments and
  revision tracking as first-class editor features; Kotahi's Wax editor does the same
  for a journal's editorial team. Absent here, and not by omission: grepping for
  `websocket|yjs|y-websocket|crdt|prosemirror-collab|awareness|presence|realtime`
  across the module returns nothing but a bibliography entry containing the phrase
  "real-time loading compensation". This is blocked by no-backend in the strict
  sense — a CRDT still needs a relay to exchange updates, and there is no server for
  one. The app's collaboration channel is the `.docx` itself, which is how these
  manuscripts actually circulate, and it now reads what comes back on that channel.

- **Continuous publishing and a hosted article website — Manubot and MyST.** Manubot
  rebuilds the manuscript from git on every push and deploys a versioned webpage with
  tooltips, a table of contents, figure viewers and public annotations; MyST's web
  renderer does the equivalent for a MyST project. The survey already recorded this
  as declined and the decisions record repeats it. It is blocked by no-backend twice
  over: there is no CI to run the build and nowhere to host the result. The static
  one-file HTML export is the local-first answer to the same need.

- **Rendering a journal's real page layout through jtex — MyST.** A MyST template is
  a LaTeX or Typst file that jtex renders into a PDF that looks like the journal's
  own pages; this app writes its own preamble instead, and each imported profile says
  so in its notes. Confirmed absent: `jtex|texlive|tectonic|latexmk|wasm.*tex` matches
  only the three comments that say it is not done. Worth correcting the stated reason,
  though: "needs jtex" understates it in one direction and overstates it in the other.
  Typst has a wasm compiler that runs in a browser, so local-first is not what stops
  this. What stops it is the Word-first position — a jtex PDF is the journal template
  deciding what the output looks like, where this app's promise is that the author's
  own document decides. The registry import already takes the half that is compatible
  with that promise, which is the template's *requirements*.

- **Cross-project external references — MyST.** MyST projects declare other projects
  under `project.references` in `myst.yml` and then link into them with
  `[](xref:spec#paragraph)`, resolving through the `myst.xref.json` that every
  published MyST site exposes; the same protocol reaches Sphinx inventories, and there
  are sibling `doi:`, `rrid:` and `wiki:` protocols. Grepping for
  `myst\.xref|xref\.json|intersphinx|objects\.inv|crossProject` returns nothing here.
  The outbound half is blocked by no-backend: making this paper's figures
  referenceable means publishing a resolvable `myst.xref.json` at a stable URL, and
  there is nowhere to publish it. The inbound half — resolving `xref:` to a hyperlink
  and a label inside an exported document — would technically work, but it is worth
  very little on its own, because it presumes a corpus of MyST-published targets that
  the journals this app aims at do not have, and because a reader of the submitted
  `.docx` cannot follow the link anyway. Citing the other paper by DOI, which the app
  does, is the interoperable version of the same act.

### Out of scope

- **Editorial and peer-review workflow — Kotahi, and Fidus Writer's sharing model.**
  Kotahi runs submission intake, configurable open/blind/double-blind review, shared
  and individual reviewer reports, decision letters, a production queue and DOI
  deposit, around the same Wax editor. Fidus Writer has document sharing with roles.
  This is a publisher-side product with a multi-tenant server at its centre, and it
  is a different thing from an authoring tool. The nearest thing here is submission
  *tracking* — `ManuscriptSubmissionTrackingPanel`, `manuscriptSubmission.ts` — which
  records where a manuscript has been sent from the author's side and makes no attempt
  to run the other side of the transaction.

- **Barzooka's bar-graph detector — the ASWG set.** Barzooka is a deep convolutional
  network trained on nine graph types that flags bar graphs used for continuous data.
  Absent here (`jetfighter|barzooka` matches nothing outside documentation), and it
  should stay absent: unlike its sibling JetFighter it genuinely needs a trained model,
  and shipping weights plus an inference runtime into a browser app that has no model
  hosting is a different engineering problem from anything else in this codebase.

### Unbuilt but coherent

- **Footnotes and endnotes — MyST, Quarto, Pandoc Scholar, Fidus Writer, and JATS
  itself.** All of them carry footnotes as a document object; JATS has `<fn>` and
  `<fn-group>`. This app has none, at any point in the pipeline. `manuscriptDocxFile.ts`
  reads `word/document.xml`, `word/styles.xml`, `word/_rels/document.xml.rels` and
  `word/comments.xml` and never `word/footnotes.xml` or `word/endnotes.xml`; grepping
  `footnote|endnote` across `manuscript/` returns exactly one hit, an incidental
  mention in a comment in `manuscriptEditorContent.ts`, and the editor schema has no
  footnote node. Because the run reader takes text from `<w:t>` and a footnote
  reference is a `<w:footnoteReference>` element carrying no text, a Word manuscript
  with footnotes imports with them silently gone — the same class of bug as the
  tracked-deletion one, in a feature the app's own position makes central. This is the
  clearest hole in the Word round trip. *Size: a week.* It touches the docx part
  reader and the run reader in `manuscriptDocImport.ts`, a footnote node in the editor
  schema and `manuscriptEditorContent.ts` so it survives editing, `FootnoteReferenceRun`
  plus the `footnotes` option on the `docx` `Document` in `manuscriptDocxExport.ts`
  (the exporter already builds `docx` objects directly, so this is reachable),
  `<fn>`/`<fn-group>` in the JATS writer and reader, `\footnote{}` and `#footnote[]`
  in the LaTeX and Typst writers, and the portable manifest.

- **Subfigures and panel layouts — MyST and Quarto.** MyST creates subfigures by
  putting several images in a `{figure}` directive body; each gets an implicit label
  of the parent's label plus a letter, so `#my-figure-a` renders as "Figure 1a", and a
  `{grid}` directive controls the arrangement. Quarto does it with a div carrying a
  `#fig-` id, `layout-ncol` or a `layout` array like `[[1,1],[1]]`, and `fig-subcap`
  for computed figures. Here a figure is a single flat image: grepping
  `subfigure|sub-figure|layout-ncol|fig-subcap|multipanel|figureGroup` returns nothing,
  `FigureLike` has one `imageUrl`, and `buildAssetLookup` keys one number per asset
  record. The consequence is concrete — a two-panel figure has to be pasted together
  in a graphics program with the letters baked into the pixels, and a sentence saying
  "as Figure 3b shows" cannot be a resolvable cross-reference or a live Word `REF`
  field, which is the one thing this app does better than the tools it is measured
  against. *Size: a week.* It touches a parent/child link on the figure record,
  letter-suffix numbering in `manuscriptNumbering.ts`, key resolution in
  `manuscriptCrossReference.ts`, the figure renderer in every exporter (a Word table
  or grid for the panel row, `<fig-group>` in JATS, `subcaption` in LaTeX, a Typst
  `grid`), and the figure editor UI.

- **SciScore's rigor criteria — the ASWG set.** SciScore scores a methods section on
  randomisation of subjects, blinding of investigator or analysis, sex as a biological
  variable, power analysis for group size, cell-line authentication and contamination
  checks, and the proportion of key biological resources given an RRID. The
  implementation here uses SciScore for two checks only: `ScreeningCheckKey` is nine
  values and the two attributed to SciScore are `ETHICS_APPROVAL` and
  `INFORMED_CONSENT`, both headed "the non-image half" in their own module comments.
  Grepping `randomi[sz]|blind(ed|ing)|sample.?size|power.?analysis|sex\s+as|RRID|cell.?line`
  across `manuscript/` returns nothing. The absent half is the same shape as the
  present half — sentence matching over sections the screener already receives — so
  the machinery in `manuscript/screening/` takes it without redesign. *Size: an
  afternoon per check, a week for the set.* It touches new modules under
  `manuscript/screening/`, the `ScreeningCheckKey` union and `MANUSCRIPT_SCREENING_CHECKS`
  in the barrel, the panel, and `buildScreeningReport`. Note that this half of SciScore
  is biomedical, so for a Copernicus atmospheric-measurement paper it will report
  honestly that none of it applies.

- **Verifying a trial registration number against the registry — TrialIdentifier.**
  The ASWG tool checks that a trial is actually registered, not merely that a
  registration-shaped string appears. Here `manuscript/screening/trialRegistration.ts`
  matches eight registries by pattern and the screening report prints "Identifiers
  (recognised, not verified)" in so many words; `clinicaltrials.gov` appears in the
  codebase only as the display name beside an `NCT\d{8}` regex, never as a request
  host. The app already has the exact pattern this needs: the retraction scan is a
  button, returns CLEAN or UNKNOWN rather than collapsing them, and never persists its
  verdict. *Size: an afternoon.* It touches a fetch module alongside
  `components/composer/references/manuscriptRetractionFetch.ts`, an in-memory scan
  state atom modelled on `manuscriptRetractionScanState.ts`, and the screening panel,
  with the CLEAN/UNKNOWN discipline carried over intact.

- **JetFighter's rainbow-colour-map check — the ASWG set.** This one was written off
  together with Barzooka as needing "pixels and a model", and that is half wrong.
  JetFighter converts figure images to a perceptually uniform colour space and compares
  their colour distribution against known bad colormaps using k-d trees, reporting the
  per-cent coverage of Jet-like colour: pixels, yes, but a heuristic, not a trained
  model, with under 1% strict false positives. This app has figure images as data URLs
  in the browser and already rasterises through a canvas in
  `manuscript/manuscriptChartImage.ts`, so the pixels are in hand. Nothing implements
  it. *Size: a week.* It touches a new pixel module (canvas `getImageData` over each
  figure's data URL, plus a colour-distance metric), and it is the first screening
  check whose subject is a figure rather than a section — `ScreeningSection`,
  `ScreeningManuscript` and `ScreeningFinding` in `screeningTypes.ts` are all
  section-shaped today and would grow a figure axis. Accessibility, not just
  reproducibility, is the reason it is worth doing: a rainbow colormap is unreadable
  to a colourblind reader, and it is the only accessibility check any of the eight
  projects performs.

- **Semantic metadata on the web-facing output — Pandoc Scholar.** Pandoc Scholar's
  distinguishing feature is a custom writer that emits the article's data as JSON-LD
  against schema.org, typing the document as a `ScholarlyArticle` and mapping authors,
  affiliations and dates; it also supports CiTO citation typing through an
  `@method:key` syntax. This app's HTML export writes a head of five things — charset,
  viewport, `<title>`, `<meta name="author">` and a truncated `<meta name="description">`
  (`manuscriptHtmlExport.ts` around line 472) — and grepping the whole module for
  `schema\.org|json-?ld|dcterms|citation_title` matches only test fixtures. The irony
  is checkable: `manuscriptReferenceIdentifiers.ts` *reads* Highwire `citation_*` tags
  and Dublin Core `DC.*` tags when resolving a reference from a URL, so the app knows
  that vocabulary and simply never speaks it. The practical loss is that an HTML export
  circulated as a preprint cannot be picked up by Zotero, Google Scholar or anything
  else that reads a page's metadata, even though the structured contributor data —
  ORCID, CRediT, ROR, funding — is already stored and already reaches the JATS writer.
  *Size: an afternoon to a day.* It touches only the head builder in
  `manuscriptHtmlExport.ts`, reading `bundle.metadata` and the contributor metadata the
  JATS exporter already consumes, optionally emitting a `.jsonld` sidecar file into the
  export bundle. CiTO is a separate and much smaller prize and is not worth taking.

- **Cross-references to sections — Quarto and MyST.** Both let a heading be a
  cross-reference target (`@sec-methods`, `#my-section`) so a sentence can say "see
  Section 3" and have the number follow the section. Here `CROSS_REF_PATTERN` resolves
  `[#key]` only through `resolveAssetKey`, whose lookup is `buildAssetLookup` over
  numbered assets, and whose prefix strip list is `fig|figure|tab|table|scheme|box|eq|equation`
  — no `sec`. Grepping `\[#sec` returns nothing. Section *numbers* do exist as a
  journal style (`sectionNumbering`, rendered by `manuscriptBlocks.ts` and the LaTeX
  and Typst writers), so the numbers a reference would print are already computed;
  there is just no way to point at one. *Size: a week.* It touches a stable ref key on
  the section record, a section counter in `manuscriptNumbering.ts` reconciled with
  the heading numbers `manuscriptBlocks.ts` already renders, key resolution in
  `manuscriptCrossReference.ts`, and a `SEQ`/`REF` pair or a bookmark link in each
  exporter — the same treatment assets already get.

- **Writing comments back into the Word file — Fidus Writer, Kotahi, and Pandoc's
  `--track-changes=all`.** Pandoc can read a `.docx`'s comments as marked spans, and
  both editors treat a comment as a durable object with a reply thread. This app reads
  `word/comments.xml` on import and flattens each comment into the notes field of the
  section it anchors to, which is a deliberate and good choice for reading them; but
  the export side has no comment path at all — `word/comments.xml` appears once in the
  codebase, in the reader. So a manuscript can come in from a co-author with comments
  and cannot go back out with a reply, which breaks the round trip in the one place
  the round trip is the product. One honest complication: because the import flattens
  a comment to a section note, the character anchor is already lost, so a true round
  trip needs the anchor preserved on the way in as well as written on the way out.
  Multi-user threading stays blocked for the reasons above; a single author annotating
  their own draft and handing it back does not. *Size: a week.* It touches the comment
  reader in `manuscriptDocxFile.ts` and `manuscriptDocImport.ts` to keep an anchor, a
  comment anchor representation in section content and the editor schema, a comments
  part plus `CommentRangeStart`/`CommentRangeEnd` in `manuscriptDocxExport.ts`, and
  the portable manifest.

**Not counted as gaps.** Beyond the shape differences named at the top, three
candidates were checked and dropped as padding rather than findings: EPUB and ODT
output, which Fidus Writer and Pandoc Scholar emit and no journal asks for; MyST's
glossary, abbreviation and index pages, which an author here can approximate with an
ordinary back-matter section; and a workspace-wide shared reference library, which
already exists in a different shape — `researchRelations.ts` declares a project-level
reference relation whose own comment calls it "a shared reference library (refs
reusable across manuscripts)". Structured author metadata reaches the JATS export but
not the Markdown export's YAML front matter, where `author` is still a list of plain
strings — that is a one-line fidelity detail rather than a capability the other
projects have and this one does not.

## Sources

- MyST: [guide](https://mystmd.org/guide), [frontmatter](https://mystmd.org/guide/frontmatter), [templates](https://github.com/myst-templates)
- Manubot: [manubot.org](https://manubot.org/), [PLOS Comp Biol paper](https://journals.plos.org/ploscompbiol/article?id=10.1371%2Fjournal.pcbi.1007128)
- Quarto: [cross-references](https://quarto.org/docs/authoring/cross-references.html), [DOCX numbering discussion](https://github.com/orgs/quarto-dev/discussions/2464)
- Pandoc: [manual](https://pandoc.org/MANUAL.html), [native_numbering #7499](https://github.com/jgm/pandoc/issues/7499), [track-changes #6801](https://github.com/jgm/pandoc/issues/6801)
- Texture: [eLife Labs](https://elifesciences.org/labs/8de87c33/texture-an-open-science-manuscript-editor)
- Fidus Writer: [how it works](https://www.fiduswriter.org/how-it-works/)
- Kotahi: [JATS-Con 2022](https://www.ncbi.nlm.nih.gov/books/NBK579686/)
- Pandoc Scholar: [pandoc-scholar.github.io](https://pandoc-scholar.github.io/)
- Screening: [BIH automated screening tools](https://www.bihealth.org/en/quest/service/service/automated-screening-tools), [ASWG pipeline](https://github.com/PeterEckmann1/aswg-pipeline), [PLOS One tool comparison](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0342225)
- Retractions: [Crossref × Retraction Watch](https://www.crossref.org/blog/retraction-watch-retractions-now-in-the-crossref-api/)
- CRediT: [credit.niso.org](https://credit.niso.org/), [JATS4R](https://jats4r.niso.org/credit-taxonomy/)
