# Decisions

Every choice in this branch that could reasonably have gone the other way, why
it went the way it did, and what was rejected. Written August 2026, after
transposing a real Copernicus/AMT paper through the composer and then bringing
in what the other manuscript frameworks do.

The format is deliberate: a decision is only worth recording with the
alternative beside it. Anything here that reads as obvious in hindsight was not
obvious at the time.

What the eight surveyed projects still do that this app does not is a separate
question, kept in [`../prior-art/README.md`](../prior-art/README.md) beside the
survey that raised it.

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

## 8. One paper, one version per journal's rules

MDPI caps an abstract at 200 words, arXiv at 320, Copernicus not at all. A
manuscript with a single abstract means submitting to the next journal is a
destructive rewrite of the one you have.

**A section can have alternative versions, and the export substitutes the right
one.** Nothing else changes — same order, same placement, same section type,
only the words.

*Instead of:* a word-limit warning that leaves the author to keep the short
version in another document. That is what every tool in this space does, and it
is why the short version drifts out of date the first time the paper is edited.

**A version is an ordinary section record, keyed to its base by `variantOfId`.**
*Instead of:* a field on the section holding alternates as JSON. A version needs
the editor, the word count, the save status and the record list that a section
already has; a blob would have needed all of it rebuilt.

**Not abstract-specific.** Keying on section *type* would have made this an
abstract feature for no gain. A lay summary, a significance statement, a data
availability statement worded to one funder's policy all work the same way.

**A version declares the rule it satisfies, not the journal it is for.**
`{"maxWords": 200}`, and any journal whose requirement it meets uses it. One
short abstract serves all 355 MDPI journals rather than 355 copies of the same
text.

*Instead of:* keying every version to a journal profile, which was the first
implementation. It made the common case — a family of journals with one shared
limit — into duplicated writing, and it bound a version to a record whose rename
would orphan it.

Journal pinning survives as an override, because a journal sometimes wants
particular wording regardless of length, and explicit must beat inferred.

**Selection, in order.** A pinned version wins. With no cap the base ships,
because the base is the fullest text. If the base fits, the base ships — a short
version exists for when the full text will not fit, not to replace it whenever
it exists. Otherwise the longest version that fits, so a 200-word version is not
sent where 320 words were allowed. If nothing fits, the base ships and readiness
reports it as over.

*Instead of:* shipping the closest version when nothing fits. That would hide a
problem the author has to solve rather than surface it.

**`maxWords` is the author's target and the label, never the measurement.**
Eligibility and ranking use the version's actual word count, so a version
declaring 200 that has drifted to 210 is refused by a journal capping at 200 and
accepted by one capping at 250. A version that declares neither a rule nor a pin
is never substituted: it has not offered to stand in anywhere.

**Only `maxWords` ships.** The field takes JSON so a structured-abstract flag or
a no-citations rule can follow. *Instead of:* shipping a richer rule vocabulary
now — rules nothing checks would be a promise the app cannot keep, the same
reason a MyST profile carries a checklist and not a page layout (§7).

**A version never exports on its own.** This is the obvious way to get the
feature wrong: every alternative appearing as an extra section in every journal.
It is rule 1 of the resolver and it is tested directly.

**A resolved section keeps the base's id.** Cross-references and figure anchors
point at the base, and they must keep resolving after the substitution.

**Resolution happens in `manuscriptSectionsForExport`** — the one function every
exporter goes through — so Word, PDF, LaTeX, Typst, JATS, HTML, Markdown, the
submission package and the portable package all honour it without any of them
knowing the feature exists. *Instead of:* resolving in each exporter, which is
nine chances to forget.

**Filtering runs before resolution.** That is what gives a version's own
`includeInExport` its only possible meaning — switch the alternative off and its
base speaks for itself again — because a resolved section keeps the base's flag,
never the version's.

**Screening drops version rows itself.** It reads the records rather than the
assembled bundle, so it is the one reader outside that choke point. Without it a
paper with two abstract versions would be screened as though it had two
abstracts, and every statement written twice would count twice.

**The editor says which version you are typing into**, and the base chip reads
"Paper" rather than "Base" because that names the thing that ships if you do
nothing. Someone who edits the MDPI abstract believing it is the real one has
been actively harmed by this feature.

**The cap is written onto the version record** so the editor's existing footer
counts against the journal's limit while typing. *Instead of:* a second display
path computing it, which could disagree with the first.

**`countWords` moved to its own module.** The resolver needs it and the
assembler calls the resolver, so importing it from the assembler made a cycle.
*Instead of:* a second counter — a word count that disagrees with itself is how
an author trusts "182 / 200" in the editor and is rejected by the journal.

**Versions travel in the portable package**, and the manifest schema stays at 2.
Adding optional fields is compatible both ways, and the readable-versions list
is a whitelist: a bump would make an older build refuse the whole paper rather
than ignore fields it does not know.

---

## 9. How things were decided to be true

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

## 10. What is left

Ordered by what it would change about using the app.

### Dangling seams — closed

These three were built-but-unconnected when this record was first written. All
three are now wired, and the shape of each fix was a decision in its own right.

1. **Retractions and screening reach the readiness list.** `validateSubmission`
   takes them as an argument rather than computing them, because it is pure and
   synchronous and they are neither: the retraction verdicts are session state
   from a Crossref scan, and screening reads the manuscript sections the bundle
   flattens away. *Instead of:* making `validateSubmission` async and letting it
   fetch — which would have put a network call behind every keystroke that
   re-renders the export panel.
2. **Screening never raises an ERROR, and now produces a file.** One aggregate
   line naming the absent and weak items, plus `screening-report.txt` in the
   submission ZIP. *Instead of:* one check per finding (a dozen new rows would
   bury the handful of real errors in a list already running about fifteen), or
   gating the export (the panel promises the author these do not block, and a
   heuristic false negative would strand a finished paper).
3. **The scan result is an in-memory atom, never storage.** A scan is true only
   of the reference list as it stood when it ran. The References tab retires one
   whose bibliography has changed underneath it, and says so rather than quietly
   forgetting the author ever ran it — decided there, because that is where the
   reference ids are and a count of references is not evidence that they are the
   same references. *Instead of:* persisting the scan (a stale all-clear would
   outlive the references it was about) or re-scanning at export (a network call
   on a button that must work offline).
4. **The application-import screen renders the whole warning channel.** The
   original bug was larger than "comments are not shown": `ApplicationImportPage`
   never rendered `document.warnings` at all, so the parser's own "this document
   has N comments" line had never reached a grant author either. Comments now
   land in section notes via the wizard's own formatter, so the same document
   reads identically on both paths. The count is stated once, in the warnings and
   not also in the snackbar — `summarizeWordRevisions` counts one comment per
   anchor in `document.xml` while only comments with a surviving body in
   `comments.xml` can reach a note, so two counts could legitimately disagree on
   screen.

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

### Closed since

- **Tracked formatting revisions (`w:rPrChange`, `w:pPrChange`) are resolved.**
  This record previously described the gap as "detected but not applied", and
  understated it: because Word omits default properties, an empty current
  property set left the previous copy as the only one present, so a run the
  reviewer had *un*-bolded still read as bold under ACCEPT and invented a
  heading. Both resolutions were wrong, in opposite directions. Generalised to
  all seven `*PrChange` elements, since `trPr` and `tcPr` were already in the
  properties strip and leaving their partners unhandled would have left the same
  residue in tables.
- **A JATS package imports with its artwork.** Matching is normalised path, then
  bare filename, then filename without extension — the last is not an edge case,
  because a typesetter writes `<graphic xlink:href="fig1"/>` so one article can
  be set from `fig1.tif` for print and `fig1.jpg` for web. Capped at 10 MB per
  image and 40 MB per package, rejected inside the unzip filter so an oversized
  entry is never inflated: everything here lives in the browser and base64 costs
  another third. A bare `.xml` still degrades to no image, unchanged.
- **`manuscriptScreening.ts` is a 282-line barrel** over thirteen modules in
  `manuscript/screening/`. Split by *check* rather than by tool, because
  rtransparent covers three unrelated statements and SciScore two. The test file
  is byte-identical across the refactor, which is what makes it one.

### House-keeping

11. **`manuscriptLatexExport.ts` (555) and `manuscriptTypstExport.ts` (575)** are
    just over the 500-line guideline. The ~250 lines they once duplicated now
    live in `manuscriptSourceExport.ts`; what remains is genuinely per-format.
12. **Image-based screening is not implemented** — rainbow colour maps
    (JetFighter), bar graphs of continuous data (Barzooka). They need pixels
    and a model, and were deliberately skipped.

### Not planned

Continuous publishing from git (Manubot's model, wrong for a local-first app),
JATS as the editing model (would give up the Word round trip), and rendering
MyST's own LaTeX/Typst templates (needs jtex).
