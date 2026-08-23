# Manuscript transposition guide

This file applies to work under `packages/twenty-front/src/modules/local-db/research/`.
It supplements the repository-level `AGENTS.md` with the required workflow for
transposing an existing paper into the Manuscript Compose system.

## Objective

Transposition means reconstructing a source paper as structured, editable
Manuscript Compose records while preserving the paper's scholarly meaning and
its relationships:

- manuscript and submission metadata;
- every section and subsection, in source order;
- figures, tables, schemes, boxes, and display equations;
- citations and the bibliography;
- citation-to-reference, cross-reference-to-asset, and placement-to-asset links;
- captions, labels, notes, alt text, credits, identifiers, and URLs;
- enough source provenance to review uncertain mappings;
- an export that can be re-imported without flattening the structure.

The goal is not merely to make the paper look similar. The result must remain
editable, reference-safe, exportable, and round-trip capable.

## Use the existing pipeline

Prefer the import and portable-package pipeline over one-off record creation:

1. `manuscriptDocxFile.ts` reads `.docx`, text-based `.pdf`, `.md`, `.markdown`,
   `.txt`, and portable research ZIP files.
2. `manuscriptDocImport.ts` converts source content into import blocks,
   sections, images, tables, equations, and source metadata.
3. The import wizard lets the user review and change block classifications.
4. `manuscriptImportPrepare.ts` extracts assets, reconciles citations, removes
   duplicate references, generates collision-safe asset keys, and rewrites
   affected tokens.
5. `useManuscriptImportCommit.ts` creates the records and tracks every created
   ID so a partial import can be rolled back safely.
6. `manuscriptPortableManifest.ts` and `manuscriptPortableZip.ts` create the
   canonical round-trip package.

Do not bypass these stages unless the source cannot be represented by them. If
you extend the pipeline, preserve the review and rollback stages.

## Canonical record mapping

### Manuscript

Map document-level information to the `manuscript` record:

| Source information                                    | Manuscript field           |
| ----------------------------------------------------- | -------------------------- |
| Paper title                                           | `name`                     |
| Paper, conference paper, preprint, thesis, or chapter | `manuscriptType`           |
| Workflow state                                        | `status`                   |
| Journal, conference, institution, or publisher        | `targetVenue`              |
| Article DOI                                           | `doi`                      |
| Ordered authors                                       | `authorLine`               |
| Ordered affiliations                                  | `affiliations`             |
| Corresponding-author contact                          | `correspondingAuthor`      |
| Extra title-page lines                                | `titlePageExtraLines`      |
| Supplement title/authors/affiliations                 | supplement fields          |
| Cover letter, highlights, conflicts, reviewers        | submission-material fields |
| Journal-specific form values                          | `submissionExtras`         |

Do not infer a DOI, journal, author, affiliation, or submission status when it
is not present in the source or supplied by the user.

### Sections

Each editable document unit is a `manuscriptSection`:

- `name`: visible heading text;
- `sectionType`: semantic role such as `ABSTRACT`, `METHODS`, `RESULTS`,
  `DISCUSSION`, `REFERENCES`, `APPENDIX`, or `OTHER`;
- `placement`: `FRONT_MATTER`, `MAIN`, `BACK_MATTER`, or `SUPPLEMENT`;
- `content`: Markdown plus the live-token grammar below;
- `orderIndex`: source reading order;
- `level`: heading depth, where 1 is top level;
- `includeInExport`: false only for source material that should not render;
- `wordCount`: derived from editable content, never copied blindly;
- `wordLimit`: only when supplied by the target format or source instructions;
- `status`: normally `DRAFTING` for a newly transposed paper.

Do not combine distinct source sections merely to reduce the record count. Do
not turn headings, captions, bibliography entries, headers, footers, or page
numbers into body paragraphs.

### Assets

Figures, tables, schemes, boxes, and numbered display equations are `figure`
records. The object name is historical; `assetKind` supplies the real meaning.

| Asset kind    | Required representation                                                   |
| ------------- | ------------------------------------------------------------------------- |
| Figure/scheme | Original image data or URL, caption, stable `refKey`                      |
| Table         | Editable Markdown grid in `tableData`, not only a screenshot              |
| Box           | Caption/content represented as an asset where source semantics require it |
| Equation      | LaTeX body in `equationLatex`, without `$$` delimiters                    |

Also preserve when available:

- `sourceLabel` for the label printed by the source, such as `2.6` or `S3`;
- `caption` in full, including notes that belong to the caption;
- `altText`, `credit`, and `widthPercent`;
- `placement`, `orderIndex`, and owning `sectionId`;
- `imageSource` provenance (`UPLOAD`, `URL`, `DATASET`, `GENERATED`, or `NONE`).

Every asset needs a unique, stable `refKey`. Generate a collision-safe key and
rewrite both cross-reference and placement tokens together when the key changes.
Never allow a duplicate key to overwrite another asset in a lookup.

### References

Each bibliography entry is a `reference` record:

- `cslJson` is the formatting source of truth and should retain the fullest
  valid CSL-JSON available;
- `citationKey` is the stable key used by in-text citations;
- flat fields such as title, authors, year, container, DOI, URL, volume, issue,
  and pages support editing and search;
- preserve DOI and URL links as structured values, not display text only;
- keep useful raw or unsupported CSL fields instead of discarding them.

Deduplicate by normalized DOI, then citation key, then title and year. When a
key collision is renamed, rewrite all affected section tokens in the same
preparation step.

## Live-token grammar

Section content is Markdown with semantic tokens:

| Meaning          | Syntax                      | Example                                              |
| ---------------- | --------------------------- | ---------------------------------------------------- |
| Citation         | `[@key]`                    | `Evidence [@li2017].`                                |
| Citation cluster | `[@first; @second]`         | `Prior work [@li2017; @smith2020].`                  |
| Locator          | `[@key, p. 42]`             | `The result is reported elsewhere [@li2017, p. 42].` |
| Citation prefix  | `[see @key]`                | `[see @li2017]`                                      |
| Suppress author  | `[-@key]`                   | `Li's model [-@li2017]`                              |
| Cross-reference  | `[#asset-key]`              | `Shown in [#exposure-map].`                          |
| Asset placement  | `[[asset:asset-key]]`       | `[[asset:exposure-map]]`                             |
| Inline equation  | `$latex$`                   | `$E = mc^2$`                                         |
| Display equation | `$$latex$$` on its own line | `$$E = mc^2$$`                                       |

Rules:

- Use one citation token for a source cluster; do not create adjacent tokens
  when the source presents one citation cluster.
- Preserve cluster order, locators, prefixes, suffixes, and suppressed authors.
- Use `[#key]` where prose refers to an asset.
- Use a standalone `[[asset:key]]` at the source placement location.
- One asset should normally have one placement marker. Duplicate placement is
  a warning and must be reviewed.
- Escape a token with `\` only when the source text is meant to remain literal.
- Do not put semantic tokens in code blocks or links.
- Keep ordinary, unnumbered inline math as inline content. Use an equation asset
  when the source gives the display equation a number or cross-references it.

## Required workflow

### 1. Inventory before writing

Create a source inventory before committing records. At minimum count and list:

- title-page and contributor fields;
- sections and heading depths;
- figures, tables, other assets, captions, and printed labels;
- inline and display equations;
- citation occurrences and citation clusters;
- bibliography entries and external identifiers;
- footnotes/endnotes, appendices, supplements, and submission materials;
- hyperlinks that must remain live.

For Word files, inspect both the rendered document and its structured XML when
necessary. For PDFs, verify extracted text against rendered pages. A scanned or
custom-encoded PDF may not contain usable text; request or use a DOCX source
instead of silently importing garbled text.

### 2. Parse without inventing

Preserve source wording, ordering, emphasis, and relationships. Normalization is
allowed for whitespace, Markdown structure, citation keys, asset keys, and
machine-safe identifiers. Substantive rewriting is a separate editorial task
and requires explicit user authorization.

When extraction is uncertain:

- retain the source text;
- mark the item for review;
- show confidence for guessed citation links;
- do not auto-confirm ambiguous reference matches;
- do not invent missing captions, equation bodies, authors, years, or labels.

### 3. Map and review blocks

Use the import wizard's upload, mapping, and review steps. Confirm that:

- title and author blocks are not body sections;
- heading levels reflect the source hierarchy;
- front matter, main text, back matter, and supplements are separated;
- captions stay attached to the correct assets;
- tables remain editable tables;
- references are not duplicated as an exported prose section when structured
  reference records will render the bibliography;
- source headers, footers, page numbers, and repeated running titles are omitted.

### 4. Reconcile links

Before commit:

- link every resolvable in-text citation to a real `citationKey`;
- require explicit confirmation for ambiguous author-year guesses;
- preserve unresolved source markers visibly for later review;
- ensure each `[#key]` and `[[asset:key]]` resolves to exactly one asset;
- ensure asset and citation keys are unique;
- verify reference counts against the source bibliography.

### 5. Commit recoverably

Use the import commit hook or an equivalent transactional/idempotent operation.
If sequential record creation is unavoidable, record every created ID and offer
rollback before retry. Do not tell the user an import succeeded when only part
of it was created.

After a failure:

1. report counts created for references, sections, and assets;
2. roll back the tracked partial import;
3. confirm rollback completion;
4. retry from the reviewed prepared import.

### 6. Run preflight

Build the manuscript bundle and run the unified submission readiness checks.
Submission-package export must remain blocked for hard errors, including:

- unresolved citations;
- unknown cross-references;
- unknown asset placements;
- missing figure images;
- empty or invalid equations;
- missing required title, author, abstract, keyword, journal, or submission data.

Draft DOCX/PDF exports may remain available with visible warnings. Do not hide
warnings merely to produce a clean status.

### 7. Export the handoff

Produce the format the user requested, and normally include the portable
research ZIP as the editable archival handoff.

- DOCX/PDF: presentation exports for reading or submission.
- Markdown + bibliography: inspectable text/data export.
- Submission package ZIP: journal-facing package; only when preflight passes.
- Portable research ZIP: canonical round-trip export containing
  `research-paper.json`, structured sections, references, and embedded assets.

Re-import the portable ZIP in a test or a clean workspace when fidelity matters.
The restored counts, keys, content, and links should match the source records.

## Fidelity checklist

Do not mark transposition complete until all applicable items pass:

- [ ] Manuscript title and type are correct.
- [ ] Authors, affiliations, and corresponding author remain ordered and linked.
- [ ] Section count, order, placement, and hierarchy match the source.
- [ ] Body text was not substantively rewritten.
- [ ] Every figure/table/equation is represented by the correct asset kind.
- [ ] Images are present and tables remain editable.
- [ ] Captions, printed labels, credits, and alt text were preserved.
- [ ] Asset keys are unique; all references and placements resolve.
- [ ] Equations contain valid LaTeX and cannot be saved in an invalid state.
- [ ] Citation cluster order and locators are preserved.
- [ ] Ambiguous citation guesses were reviewed rather than auto-confirmed.
- [ ] Reference count and key coverage match the cited source material.
- [ ] CSL-JSON, DOI, URL, and unsupported fields remain linked and structured.
- [ ] Headers, footers, page numbers, and repeated running text were excluded.
- [ ] Import can roll back cleanly if commit fails.
- [ ] Unified preflight contains no hard errors for a submission package.
- [ ] Portable export re-imports without losing sections, assets, or references.

## Required agent handoff

Report these facts to the user:

1. source file and output/export paths;
2. number of sections, figures, tables, equations, and references transposed;
3. number of citations and asset links resolved;
4. unresolved or low-confidence items requiring human review;
5. preflight errors and warnings;
6. tests or round-trip checks performed;
7. any source content intentionally omitted and why.

Do not use “complete,” “lossless,” or “submission ready” without evidence from
the inventory, link reconciliation, preflight, and export verification.

## Relevant implementation files

- `manuscript/manuscriptDocxFile.ts`: source-file reader.
- `manuscript/manuscriptDocImport.ts`: document parsing and extraction.
- `manuscript/manuscriptImportBlocks.ts`: reviewable block model.
- `manuscript/manuscriptImportPrepare.ts`: normalization and reconciliation.
- `import-wizard/`: upload, mapping, review, commit, retry, and rollback UI.
- `manuscript/manuscriptEditorContent.ts`: live-token parsing and serialization.
- `manuscript/manuscriptReferenceForm.ts`: structured reference editing.
- `manuscript/manuscriptSubmission.ts`: unified readiness checks.
- `manuscript/manuscriptTableGrid.ts`: merged-cell table grid (`<` / `^` markers).
- `manuscript/manuscriptHtmlExport.ts`: self-contained HTML exporter.
- `manuscript/manuscriptHtmlMarkdown.ts`: Markdown → HTML for that exporter.
- `manuscript/manuscriptHtmlStyles.ts`: the exported file's inlined stylesheet.
- `manuscript/manuscriptMathMl.ts`: LaTeX → MathML (KaTeX, no stylesheet).
- `manuscript/manuscriptDiagram.ts`: Mermaid rendering for figures and fences.
- `manuscript/manuscriptDocxTemplate.ts`: styles.xml lifted from a user template.
- `manuscript/manuscriptPortableManifest.ts`: canonical manifest schema.
- `manuscript/manuscriptPortableZip.ts`: round-trip ZIP creation/reading.
- `manuscript/manuscriptSubmissionPackage.ts`: journal submission package.
- `docs/paper-format-assessment/manuscript-token-grammar.md`: token reference.
- `docs/paper-format-assessment/citation-formats-and-storage.md`: CSL storage.

## Verification commands

Prefer focused tests while working, then run the research suite:

```bash
npx jest packages/twenty-front/src/modules/local-db/research \
  --config=packages/twenty-front/jest.config.mjs --runInBand
npx nx typecheck twenty-front
npx nx lint:diff-with-main twenty-front
```

Also run Prettier/Oxlint directly on uncommitted files when the Nx diff target
does not include working-tree-only changes.
