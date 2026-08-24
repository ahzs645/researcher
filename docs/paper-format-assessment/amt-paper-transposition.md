# Transposing a real AMT paper through the composer

A second pass over the research-paper pipeline, this time driven by an actual
manuscript instead of a hand-built sample: the working draft of *"Quantifying
temporal aggregation and representativeness bias when integrating aethalometer
and filter-based carbonaceous aerosol measurements"* (Jalil & Kazemian), in the
two shapes its author keeps it in —

| Source | Shape | What it stresses |
| --- | --- | --- |
| `AETH_Modular_AMT_reframed_draft.docx` | Copernicus/AMT layout | centred multi-line title block, numbered headings (`1 Introduction`), 14 display equations set as one-row layout tables, a shaded one-cell status callout, captions under figures and over tables, an appendix table lettered `B1` |
| `quantifying…representativenessbias.docx` | numbered Word draft | Word heading styles with `1. `-style numbering, 15 real OMML equations, superscript affiliation markers, a supplement that repeats the title block |

Both were run through the real pipeline —
`parseWordDocument` → `prepareManuscriptImport` → `buildManuscriptBundle` — not
through a reimplementation. What follows is what that run exposed, what is
fixed, and what is still open.

---

## 1. What broke, and why it mattered

### Word's own heading styles lost to a prose heuristic
`wordParagraphToMarkdown` refused to treat a paragraph as a heading when it
"read like prose" — a test that fires on any full stop followed by a space.
That demoted **every `1. Introduction`-style heading** and any title longer
than 120 characters, even though `styles.xml` had already declared them
`Heading 1`. In the numbered draft, 11 top-level sections (Introduction,
Measurement framework, Discussion, Limitations, Conclusions, the appendices…)
silently merged into whatever section preceded them: 28 sections imported where
the author wrote 38.

**Fixed** — an explicit heading style is a declaration, not a guess, and is now
trusted up to a 250-character sanity limit. The heuristics still decide for
paragraphs the template left unstyled.

### The journal title block imported as sections
A Copernicus title block is centred bold lines that Word styles as *nothing*.
The bold-heading heuristic turned each into a section: the paper's title came
out as its first line only, its second line became the "author line", the
subtitle became a section, and the real author list became a heading whose body
swallowed the affiliation and the correspondence line.

**Fixed** — three rules, all narrow:
- a line that reads as a list of people is never promoted to a heading;
- once a document proves it uses heading styles, any *guessed* heading before
  its first recognisable section (Abstract, Keywords…) is title-page furniture;
- title lines above the author line join the title instead of being filed as
  furniture, and an email-bearing line under the author line is the
  corresponding author.

### Numbered display equations imported as tables
Word has no display-equation object, so Copernicus (and Elsevier, and Springer)
set equations in a borderless one-row, two-column table with the number in the
right cell. All 14 came in as captionless `Table` records — which also
**renumbered the paper's four real tables to 5–8** and printed a bordered grid
around the maths. A shaded one-cell callout became a ninth junk table.

**Fixed** — `extractLayoutTables` runs before table extraction and lifts these
into `EQUATION` assets (`eq-7`, `eq-11a`, …), keeping the source number and
leaving an `[[asset:…]]` marker exactly where the equation stood. A one-cell
layout table is unwrapped back into prose. The composer already knew how to
number, cross-reference and typeset `EQUATION` assets — the importer simply
never produced one. `Eq. (7)` and `Eqs. (7) and (8)` in the prose now link to
them.

### Citations: three losses in one reference list
- **Narrative citations were never linked.** `Petzold et al. (2013)` — the
  dominant form in an author-date paper — left the parentheses untouched
  because the paren holds no author name. Now linked as `[-@petzold2013]`, the
  Pandoc author-suppressed form the composer's editor already round-tripped but
  the renderer did not understand; `formatInTextCitation` and the citeproc path
  now honour it (`suppress-author`), so it prints the year alone.
- **Year suffixes collapsed.** `(Weakley et al., 2018a, b)` cites two papers;
  both mapped to one key and the `, b` was dropped, leaving a reference cited
  nowhere. Entries now keep the source's own `2018a` / `2018b` identity, and the
  shorthand expands to both.
- **DOIs truncated and names mangled.** `10.1016/S0021-8502(03)00359-8` was cut
  at the first `)` (the DOI pattern excluded closing brackets), and
  `Düsing` was stripped to `Dsing` because family names were filtered to ASCII.
  A DOI containing a year (`…/02786826.2018.1439571`) also fooled the title
  parser into reporting `.1439571` as the paper's title. All three fixed; the
  citation *key* is now transliterated (`dusing2019`) rather than mutilated.

### Smaller things the paper caught
- An appendix table labelled `Table B1` lost its label — the caption parser
  only understood a leading `S`. Lettered labels now parse.
- Synthetic front-matter headings (the `Keywords:` paragraph) were emitted at a
  fixed depth, so they nested one level below the paper's own sections.

---

## 2. What was added rather than fixed

**An Atmospheric Measurement Techniques (Copernicus) journal template**, seeded
like the rest of the starter library: author-date citations against a vendored
`copernicus-publications.csl` (so it formats offline), numbered sections,
figure captions below / table captions above, a 350-word abstract limit, an
AMT-shaped section skeleton ending in *Code and data availability / Author
contributions / Competing interests / Acknowledgements*, and the submission
requirements the journal asks for.

---

## 3. The test

`manuscriptAmtPaperImport.test.ts` runs the paper end to end against the
fixture in `__tests__/fixtures/amtPaperWordMl.ts` — the real document's
headings, equations, captions, table shapes and complete reference list, with
body prose trimmed to the sentences carrying citations and cross-references.
It asserts the full outline, the 15 equation assets and their placement, that
only the real tables are numbered, every citation form, the parsed reference
fields, and the assembled export (labels, cross-references, the
`Abstract is 361 words (limit 350)` warning, and the JATS article).

It is deliberately a *transposition* rather than a synthetic case: everything
in it is something a working scientist's document actually does.

---

## 4. What the export needed next

Fixing the import surfaced the defects that only show up in the *finished*
document. All four are now built.

### The bibliography lost every co-author, initial, journal, volume and page
The importer kept one family name and a year per entry, so the exported
Copernicus bibliography read

> Bond: Bounding the role of black carbon in the climate system: A scientific
> assessment., https://doi.org/10.1002/jgrd.50171, 2013.

and every in-text citation read "(Bond, 2013)" where the paper said
"(Bond et al., 2013)" — citeproc renders CSL fields, and there were none to
render. `manuscriptReferenceParse.ts` now reads the whole entry, in the three
shapes reference lists actually come in:

| Shape | Example |
| --- | --- |
| author-date | `Bond, T. C., and Doherty, S. J. (2013). Title. Journal, 118, 5380–5552.` |
| Copernicus | `Bond, T. C., and Doherty, S. J.: Title, J. Geophys. Res., 118, 5380–5552, 2013.` |
| ACS / Vancouver | `Mendell MJ, Eliseeva EA, et al. Title. Indoor Air. 2013;23(6):515-528.` |

It reads families and initials apart (`C.-H.`, `MJ`, `A. S. H.`), the journal
(keeping the abbreviating period in `J. Geophys. Res.-Atmos.`), volume, issue
and pages, and it records that the source itself truncated the list. The same
entry now exports as the paper wrote it. An entry with no punctuated author
head — an institutional or web reference — is deliberately left whole rather
than having a journal invented for it.

### The byline imported as one author, the affiliation as two institutions
`Ahmad Jalil and Hossein Kazemian` was a single contributor named after both
of them, and the affiliation, wrapped onto a second Word line mid-clause,
became two institutions. Author lines now split on `and` / `&` / commas — but
only when every piece still reads as a whole name, so `Smith, J.` stays one
person — a wrapped affiliation line rejoins its predecessor, and a
single-institution paper (which prints no markers at all) attaches that one
affiliation to every author.

### Equations imported as text, not maths
A layout-table equation arrives as characters — `x̄j,time = Σi wij xi / Σi wij`
— and both the MathML and OMML renderers expect LaTeX, so it printed as a
sentence instead of typesetting. `manuscriptMathUnicode.ts` recovers what the
characters state outright: named symbols (`λ` → `\lambda`, `∩` → `\cap`), the
Unicode sub/superscript alphabets (`b₁` → `b_{1}`, `r⁻ᵅ` → `r^{-\alpha}`), a
combining accent (`x̄` → `\bar{x}`), and a summation written against its index
(`Σi` → `\sum_{i}`). It never infers structure the source did not write:
`wij` keeps its letters, because only the author knows which of them is an
index. LaTeX that came from the OMML path is left untouched.

### Renumbering threw away numbering the author chose
An imported `(11a)`/`(11b)` pair collapsed to `(11)`/`(12)`, and the appendix's
`Table B1` became `Table S1`. `keepSourceNumbers` — an export-style switch in
the Numbering section, off by default — keeps the labels the source used, for
an author re-exporting their own submitted draft. Assets added after the
import have no source label and still take the next number in their sequence.

---

## 5. The test

`manuscriptAmtPaperImport.test.ts` runs the paper end to end against the
fixture in `__tests__/fixtures/amtPaperWordMl.ts` — the real document's
headings, equations, captions, table shapes and complete reference list, with
body prose trimmed to the sentences carrying citations and cross-references.
It asserts the full outline, the 15 equation assets and their placement, that
only the real tables are numbered, every citation form, the parsed reference
fields, the contributors, the CSL-rendered bibliography, both numbering modes,
and the assembled export (labels, cross-references, the
`Abstract is 361 words (limit 350)` warning, and the JATS article).

It is deliberately a *transposition* rather than a synthetic case: everything
in it is something a working scientist's document actually does.

---

## 6. Checked against the author's editing kit

The manuscript editing kit (a bookmarked master `.docx`, a YAML edit language,
a block index and the source material) supplied ground truth for three things
that had been inferred:

**The reference parser is exact.** The kit's `references.bib` holds the
authoritative metadata for all 13 sources. Parsing the paper's *prose*
reference list and comparing field by field against that BibTeX — authors,
journal, year, volume, pages, title — gives **13/13 exact matches** (once
BibTeX's own notation is normalised: `--` for an en-dash, `\&` for an
ampersand). Nothing in the printed bibliography is a guess.

**Bookmarks are invisible to the importer.** The editable master carries 334
invisible Word bookmarks, one per addressable paragraph and table cell.
Imported, it produces a byte-identical outline to the un-bookmarked draft —
same 36 sections, 23 assets, 13 references, 16 linked citations. Covered by a
regression test.

**The title block really does have a subtitle.** The kit's block index names
`front.title`, `front.subtitle`, `front.authors`, `front.affiliation`,
`front.correspondence` — so the third centred line is a subtitle, not more
title. Wrapped lines (a `<w:br/>` inside the title's own paragraph) now rejoin
with a space and a following paragraph joins with a colon, which reproduces
the author's canonical title exactly:

> Quantifying temporal aggregation and representativeness bias when integrating
> aethalometer and filter-based carbonaceous aerosol measurements: **The AETH
> Modular measurement-integration framework**

All three shapes of this paper — the AMT draft, the bookmarked master and the
numbered Word draft, which states that title outright in one heading — now
import to the identical string.

The kit's `style_and_layout_notes.md` also confirmed the layout conventions the
importer had been inferring: "equations: one-row, two-column borderless tables
with equation number right aligned", "figures … with caption paragraphs
underneath", "main data tables: grid layout with shaded header rows".

### An imported paper now keeps its own look

The notes describe a document with its own typography (Liberation Serif 10.5 pt
body, Liberation Sans headings, A4). The app could already borrow a Word
template's styles for export — but only if you uploaded the same `.docx` a
second time in the export panel, because the importer read `word/styles.xml`
for heading levels and then threw it away. An imported `.docx` now carries its
style table through to the manuscript's export settings, so the file it exports
is a drop-in replacement for the file it came from. An explicit template choice
always wins over the inferred one.

---

## 7. Still open

1. **"et al." cannot be forced back on.** CSL-JSON has no flag for "the source
   truncated this list", so a style whose et-al threshold sits above the number
   of names the entry printed will list them all. The fact is recorded
   (`researcher:truncatedAuthors`) but nothing consumes it yet.
2. **Reference parsing has no publisher/edition/chapter support.** Journal
   articles read well; books, chapters and reports fall back to title + year,
   with the verbatim entry in `notes`.
3. **Equation structure beyond the characters.** `wij` stays `wij`: recovering
   `w_{ij}` would need either the original OMML or an author decision.
   Imported equations are editable as LaTeX, which is where that decision
   belongs.
4. **Page geometry is not imported.** The style table travels; the section
   properties that set A4 and the master's narrow margins do not, so the export
   uses the app's own page setup.
