# Decisions

Every choice in this branch that could reasonably have gone the other way, why
it went the way it did, and what was rejected. Written August 2026, after
transposing a real Copernicus/AMT paper through the composer and then bringing
in what the other manuscript frameworks do.

The format is deliberate: a decision is only worth recording with the
alternative beside it. Anything here that reads as obvious in hindsight was not
obvious at the time.

---

## 0. The position everything else follows from

**This app takes the author's existing Word document and hands it back looking
like itself.** Every other project in this space — MyST, Manubot, Quarto,
Pandoc Scholar — assumes the paper begins in *their* markup; Texture and Fidus
Writer assume it begins in *their* editor. None of them reads a `.docx` and
preserves its structure and look.

That single position decides most of what follows: why JATS is an export target
and not the document model, why an imported `.docx`'s style table travels with
the manuscript, and why the Word output gets more care than the Markdown one.

**Local-first, no backend.** State is IndexedDB. Network calls go straight from
the browser to public APIs and every one of them must degrade to "not checked"
rather than "clean" when offline.

---

## 1. Import

**Word heading styles beat the prose heuristic.** → *Instead of:* one heuristic
for everything. → A numbered heading like "1 Introduction" and a 200-character
title both read as prose to a heuristic; the document already said they were
headings. The heuristic still runs on unstyled paragraphs.

**A title block is metadata, not sections.** → *Instead of:* importing the
centred bold lines as headings. → An author byline is centred and bold exactly
like a heading. Guessed headings before the first classified section become
title-page furniture.

**Wrapped title lines rejoin with a space; a following paragraph joins with a
colon.** → *Instead of:* treating every centred line as more title. → The
editing kit's block index named `front.title` and `front.subtitle` separately.
All three shapes of the paper now import to the identical string.

**Numbered display equations are lifted out of their layout tables.** →
*Instead of:* importing them as tables. → Word has no display-equation object,
so a Copernicus template sets them as one-row two-column borderless tables.
Imported as tables they became "Table 3" and renumbered the real tables.

**Tracked changes are resolved explicitly, and reported.** → *Instead of:* the
accidental status quo. → The importer read `<w:t>` and never `<w:delText>`, so
a tracked insertion survived and a tracked deletion silently vanished: "accept
all changes" chosen by accident and stated nowhere. Now `ACCEPT` or `REJECT` is
a choice in the map step, with counts, and `ACCEPT` stays the default so no
existing caller changes.

**Comments are imported as section notes, not a new database column.** →
*Instead of:* a comments table. → They are provenance about the text, and the
section already has a notes field. Both `.docx` entry points read
`word/comments.xml` through one shared parse.

**JATS import produces a portable manifest, not its own draft shape.** →
*Instead of:* a second importer. → Everything downstream — sections, numbered
assets, references, contributor parsing, cross-reference links — is the restore
path that already exists and is already tested.

---

## 2. Numbering and cross-references

**Word gets `SEQ` fields in bookmarks and `REF` fields pointing at them.** →
*Instead of:* the digits we happened to print. → Move an equation and the
sentence naming it should follow. Quarto writes DOCX cross-references as plain
text; pandoc's `native_numbering` numbers captions but not references and ships
disabled. This is ahead of the field, not catching up.

**Only the number is a field.** → *Instead of:* fielding the whole label. →
"Eq." and "Fig." are the journal's wording and the author's text. `REF`
returns the bookmark's text, so bookmarking just the number is also what makes
the journal's own cross-ref format survive.

**A number a counter cannot reproduce stays literal — inside its bookmark.** →
*Instead of:* forcing everything into a `SEQ`. → "(11a)", an appendix's "B1", a
per-section "1.2" carry information a counter cannot. References to them are
still links showing the right text; they simply do not renumber, which is what
`keepSourceNumbers` is for.

**A `REF` is only written when its bookmark exists.** → *Instead of:* emitting
one per resolved reference. → Pointing at an asset that is never printed reads
as "Error! Reference source not found". The emitted blocks are scanned first.

**An asset can be taken out of the numbering, and takes no number with it.** →
*Instead of:* numbering everything. → Unnumbered display equations are ordinary.
Switch off Eq. (5) and what was (6) becomes (5) — which is exactly why a
reference to it cannot be a hand-typed number.

**A cross-reference to an unnumbered asset is reported, and its token stays
visible.** → *Instead of:* printing the empty label. → Silently substituting
nothing leaves "defined in Eq. ." in the exported paper.

---

## 3. Maths

**Inline `$…$` becomes a real Word equation object.** → *Instead of:* leaving
it as text. → A display equation was already an OMML object; the same symbol
named in the sentence beside it was four characters with its subscript flat.

**Maths is hidden from the Markdown parser and put back after.** → *Instead
of:* parsing first. → `$\bar{x}_j$ … $b_{abs,\lambda}$` reads to a Markdown
parser as an italic run opened at the first underscore and closed at the
second, and both underscores are eaten. Only found by exporting and reading the
XML back.

**A `$` is not always maths.** → *Instead of:* the bare rule. → `$40 per filter`
and `$1.2M of funding` stay literal, as does anything in a code span.

**Unicode maths is recovered only where the characters state it.** → *Instead
of:* inferring structure. → `wij` stays `wij`; recovering `w_{ij}` needs the
original OMML or an author decision, and imported equations are editable as
LaTeX, which is where that decision belongs.

---

## 4. References

**Cite by identifier — DOI, PMID, PMCID, arXiv, ISBN, URL.** → *Instead of:*
DOI only. → Manubot's central idea: cite a persistent identifier and there is
no entry to get wrong. Recognisers run in a deliberate order because the
near-misses are the whole problem — a doi.org URL is a DOI, an arxiv.org URL is
an arXiv id, a blog post whose slug says "arxiv" is a URL.

**URL import is allowed to be the weak one, and says so.** → *Instead of:*
dropping it or adding a proxy. → Most publisher pages refuse a browser fetch,
so it lands on a `webpage` item with title and accessed date. A server-side
fetch would need a backend this app does not have.

**CLEAN and UNKNOWN are different answers.** → *Instead of:* one "no
retractions found". → A work Crossref answered for with no `update-to` is
clean; offline, a failed request, or a DOI Crossref never heard of is not.
Reporting those as clean is worse than not checking.

**The retraction scan is a button.** → *Instead of:* running on mount. →
Network on render is rude, and this is the user's bibliography going to a third
party.

**No Crossref polite-pool `mailto`.** → *Instead of:* the faster lane. → It
means putting the user's email in a query string to a third party.

---

## 5. Structure and metadata

**Structured contributors layer over the free-text byline; they do not replace
it.** → *Instead of:* a proper contributor table as the source of truth. → The
app's whole position is that it reads the author's real document. The byline
stays authoritative for order and names; ORCID, CRediT, ROR and funding attach
to it, matched by name first and position second, so moving an author up the
byline carries their ORCID rather than handing it to whoever they displaced.

**An ORCID that fails its checksum is not emitted.** → *Instead of:* passing it
through. → Publishing a wrong ORCID attaches the paper to a stranger.

**Everything structured is optional, and a manuscript without it exports
byte-identical JATS.** → *Instead of:* a migration. → Proven with a snapshot
captured from the exporter before it was changed.

---

## 6. Export

**Six targets, one bundle.** DOCX, PDF, HTML, JATS, Markdown, LaTeX, Typst and
the portable ZIP all consume the same `ManuscriptBundle`, so a new backend is a
registry entry rather than a rewrite.

**LaTeX and Typst emit source, not compiled output.** → *Instead of:* bundling
a wasm toolchain. → It is what MyST does before it shells out, and the
description says so.

**Everything LaTeX can work out for itself is left to LaTeX.** → *Instead of:*
baking in our numbers. → `\caption{}` carries only the caption text; `\ref` and
`\eqref` do the referring; the supplement resets the counters and lets LaTeX
arrive at "Figure S1". Same reasoning as the Word fields.

**The two table renderers were not merged.** → *Instead of:* one shared
renderer. → They are opposite algorithms: LaTeX must expand spans into a full
owner matrix or a dropped column silently shifts every `&`, while Typst
consumes the anchor-only shape and skips covered slots itself.

**A first-party package restores itself; anything else is shown first.** →
*Instead of:* one "structured" flag. → "Structured, so there is nothing to map"
and "ours, so there is nothing to review" are not the same claim. A JATS
article is just as structured and came from somebody else.

**One document's Word styles do not travel in a journal profile.** → *Instead
of:* exporting the whole style record. → `referenceDocStyles` is the styles.xml
an imported `.docx` carried, which makes that manuscript export as itself. It
is the author's file, not the journal's format, and it was 370 kB of the 380 kB
profile.

---

## 7. Journal profiles and the template registry

**The number is 25 templates reaching 471 journals, not 453 templates.** →
*Instead of:* repeating the figure from marketing copy. → MyST's registry has
one repository per *family*, each with a required journal choice: MDPI offers
355, EGU Copernicus 45, AGU 21. The refresh script prints what it wrote, so the
figure stays checkable.

**A template's requirements travel; its typesetting does not.** → *Instead of:*
claiming template support. → A MyST template is a LaTeX or Typst file rendered
by jtex; this app writes its own preamble. Each imported profile says so in its
own notes rather than implying a fidelity it has not got.

**One profile per template, pinned to a journal at import.** → *Instead of:*
471 rows in a dropdown. → MyST models it that way itself — one template, one
required journal choice — and 355 MDPI journals in a picker helps nobody.

**A skeleton is only written when the template describes the argument.** →
*Instead of:* always. → Most of these templates describe only the back matter,
and a skeleton of "Acknowledgements, Competing interests" would scaffold a
manuscript with no paper in it.

**An imported profile is untrusted input.** → *Instead of:* spreading it onto
the record. → An unknown key is dropped rather than written, and a wrong-typed
value is dropped rather than coerced: a profile that silently half-applies
leaves the author formatting against settings they never chose.

**Descriptors are vendored, not fetched.** → *Instead of:* calling the API. →
The app has no backend and has to work offline. 84 kB of the fields the mapper
reads, refreshed by a script.

---

## 8. How things were decided to be true

**The running app is the test of record.** Unit tests are necessary and were
not sufficient — every one of these was green in tests and wrong in the app:
the PDF exporter hanging on its own output, "0 equations" in the wizard summary,
citation labels misaligned by one, a journal profile exporting at 380 kB,
inline maths mangled by the Markdown parser, and adding a profile failing with
"could not find the selected journal".

**Real documents, not fixtures.** The AMT paper, its bookmarked editing-kit
master, a second grant proposal, and the kit's own `references.bib` as ground
truth — which is how the reference parser was shown to be 13/13 field-exact
rather than "looks right".

**Refactors are proven byte-identical.** The LaTeX/Typst extraction was checked
by emitting four bundle variants before and after and diffing all 26 files;
the checksum manifest hashes the same both ways.

**A claim that cannot be checked does not get made.** Where our own PDF text
extractor cannot read our own PDF exports, that is stated rather than papered
over.

---

## 9. What is left

Ordered by what it would change about using the app.

### Dangling seams — built but not connected

1. **Retractions do not reach the readiness panel.**
   `retractionSubmissionChecks()` is exported and tested, and nothing calls it.
   The scan works from its own button; the checks were meant to sit beside
   unresolved citations.
2. **Screening findings do not reach the export or the submission package.**
   They render in the readiness panel only. Nothing blocks an export by design,
   but a package could carry the report.
3. **Comments do not render on the application-import screen.**
   `ApplicationImportPage` creates sections without notes, so imported comments
   reach it and are not shown. The wizard path renders them.

### Fidelity gaps

4. **Page geometry is not imported.** The style table travels; the section
   properties that set A4 and the master's margins do not.
5. **`extractPdfText` cannot read our own PDF exports.** react-pdf embeds CID
   subset fonts; the extractor only reads literal `(…) Tj` strings, so
   re-importing our own PDF yields almost nothing. Needs a ToUnicode CMap
   reader.
6. **LaTeX detail:** `headingColor` and heading font sizes are not emitted
   (needs `titlesec`/`xcolor`); `titlePageExtraLines` are not carried; table
   columns are all `l`, so a wide table can overrun `\textwidth`; body font
   sizes round to the nearest `article` class option; plain `\cite` only, no
   natbib or biblatex.
7. **Typst detail:** line numbering needs Typst ≥ 0.12; a multi-letter run like
   `mc` renders as one upright identifier, because splitting letters would
   break `sin`, `log` and `alpha`.
8. **"et al." cannot be forced back on.** CSL-JSON has no flag for "the source
   truncated this list". The fact is recorded as `researcher:truncatedAuthors`
   and nothing consumes it.
9. **Reference parsing has no publisher/edition/chapter support.** Journal
   articles read well; books, chapters and reports fall back to title + year
   with the verbatim entry kept.
10. **Contributor metadata gaps:** affiliation `url`/`isni`, free-form
    (non-CRediT) roles, the ROR checksum (shape-validated only), collaboration
    and group authors, and writing the rendered contributions/funding
    statements into manuscript sections.

### House-keeping

11. **`manuscriptScreening.ts` is 913 lines** against a 500-line guideline.
    `manuscriptLatexExport.ts` (555) and `manuscriptTypstExport.ts` (575) are
    just over; extracting `latexToTypstMath` and the LaTeX tabular span-filler
    into their own modules would bring both under.
12. **Image-based screening is not implemented** — rainbow colour maps
    (JetFighter), bar graphs of continuous data (Barzooka). They need pixels
    and a model, and were deliberately skipped.

### Not planned

Continuous publishing from git (Manubot's model, wrong for a local-first app),
JATS as the editing model (would give up the Word round trip), and rendering
MyST's own LaTeX/Typst templates (needs jtex).
