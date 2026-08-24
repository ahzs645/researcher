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

## 4. Still open

1. **Equation bodies are plain Unicode, not LaTeX.** Layout-table equations
   carry the text Word showed (`x̄j,time = Σi wij xi / Σi wij`). It typesets
   and exports, but it is not structured maths — unlike the OMML path, which
   produces real LaTeX. Recovering LaTeX from the flattened text would let the
   equation editor work on imported equations.
2. **Equation numbers renumber; the source's do not.** An imported `(11a)` is
   kept as the *source* label and re-numbered continuously on export. A paper
   that renumbers 11a/11b to 11/12 is correct per the journal, but the author
   may expect their own numbering preserved — there is no per-manuscript
   "keep source numbering" switch yet.
3. **Reference field parsing stays heuristic.** Author/year/DOI are reliable and
   the title now survives both the APA and Copernicus forms, but journal,
   volume and pages are still best-effort; the raw entry is kept verbatim in
   `notes` and printed by the fallback formatter.
4. **Multi-line titles lose their punctuation.** A title split across Word lines
   is rejoined with a space, so the AMT draft's title comes back without the
   colon its numbered sibling has.
5. **Superscript affiliation markers stay inline.** `Ahmad Jalil¹*` imports with
   the marker attached to the name rather than resolved into an affiliation
   link.
