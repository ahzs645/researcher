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

The gaps below are the ones that matter.

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
with a template per journal — 422 of them — listed through a JSON API and
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
- **Typst as a third typeset path** (MyST). Real, but the DOCX and PDF paths
  both work; this buys nothing a journal asks for.

## Recommended order

1. Tracked changes + comments on import — a correctness bug in the workflow's
   most common input.
2. Retracted-reference check — highest damage caught for the least code.
3. Author metadata: ORCID, CRediT, ROR, funding — unblocks the JATS export and
   six readiness items at once.
4. PMID/arXiv identifiers.
5. Journal profile import/export.
6. Statement-level readiness checks.

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
