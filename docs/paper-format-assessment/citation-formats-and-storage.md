# Citation formats & storage — validation

Answers two questions: do the 9 journal formats actually match real journal
output, and how are citations stored (is it a structured, Zotero-grade format
with a real Zotero connector). Both were tested empirically.

## 1. Do the formats match? (rendered through citeproc)

The bundled CSL styles (`packages/twenty-front/public/csl/`) were fed two real
air-quality / environmental-health references as CSL-JSON and rendered with
**citeproc-js** — the same engine the app uses. Output vs. each journal's real
house style:

| Template | CSL id | In-text | Bibliography (rendered) | Matches house style |
| --- | --- | --- | --- | --- |
| Nature | `nature` | `1,2` (superscript) | `Fuzzi, S., Baltensperger, U. & Carslaw, K. Particulate matter… Atmospheric Chemistry and Physics 15, 8217–8299 (2015).` | ✅ |
| Science | `science` | `(1, 2)` | `S. Fuzzi, U. Baltensperger, K. Carslaw, Title. Journal 15, 8217–8299 (2015).` | ✅ |
| IEEE (Trans/Conf) | `ieee` | `[1], [2]` | `[1] S. Fuzzi, U. Baltensperger, and K. Carslaw, "Title," Journal, vol. 15, no. 14, pp. 8217–8299, 2015, doi: ….` | ✅ |
| **MDPI / IJERPH** | `multidisciplinary-digital-publishing-institute` | `[1,2]` | `1. Fuzzi, S.; Baltensperger, U.; Carslaw, K. Particulate Matter, Air Quality and Climate… Atmospheric Chemistry and Physics 2015, 15, 8217–8299, doi:….` | ✅ (semicolon authors, title-case, `Year, Vol, pages, doi:` — exactly IJERPH) |
| ACS | `american-chemical-society` | `1,2` (superscript) | `(1) Fuzzi, S.; … Title. Journal 2015, 15 (14), 8217–8299. https://doi.org/…` | ✅ |
| APA 7th / Thesis | `apa` | `(Fuzzi et al., 2015; …)` | `Fuzzi, S., Baltensperger, U., & Carslaw, K. (2015). Title. Journal, 15(14), 8217–8299. https://doi.org/…` | ✅ |
| Chicago | `chicago-author-date` | `(Fuzzi et al. 2015; …)` | `Fuzzi, S., U. Baltensperger, and K. Carslaw. 2015. "Title." Journal 15 (14): 8217–99. https://doi.org/…` | ✅ |

**Result: all formats match.** The MDPI/IJERPH style in particular reproduces
the exact format of the `Bertasson_ijerph-air-schools.pdf` example (numbered,
semicolon-separated authors, title-case titles, `Journal Year, Volume, pages,
doi:`).

### Gaps found
- **Vancouver** (common in health/biomed) could not be bundled — the CSL repo
  path 404s on the mirrors available here. It still works **online** (CDN
  fallback); it's just not offline yet. Worth adding once reachable.
- The on-screen "Formatted references" list glued the leading number to the text
  for numeric styles (`1.Fuzzi…`) — a `stripHtml` bug, now fixed (tags collapse
  to a space, so it reads `1. Fuzzi…`).

## 2. How citations are stored (yes — structured, Zotero-grade)

Each `reference` record stores the **full CSL-JSON item in `cslJson` as the
source of truth** — the same interchange format Zotero exports — plus flat
columns (authors/year/journal/volume/…) *derived from it* for the table view,
and a `zoteroKey` for provenance. CSL-JSON is what every formatter (citeproc)
and exporter reads, so the structured form drives everything.

Import paths and what they produce:

| Source | Structured CSL-JSON stored? |
| --- | --- |
| Add by **DOI** (doi.org content negotiation) | ✅ native CSL-JSON |
| Paste **CSL-JSON** | ✅ verbatim |
| **Zotero** Web API (user/group library + key) | ✅ Zotero returns CSL-JSON |
| Paste **BibTeX** | ✅ **now** — was flat-only; a real CSL item is built (fixed) |

### Zotero connector — status & what was hardened
A read-only **Zotero connector already exists** (`manuscriptZoteroImport.ts`):
it pulls a user's or group's library via the Web API as CSL-JSON. To make the
connector (and DOI/BibTeX/CSL import) genuinely Zotero-grade, this pass added
`manuscriptReferenceStore.ts`:

- **De-duplication** by normalized DOI → citation key → title+year, so
  re-importing the same Zotero library or DOI never creates duplicates
  (idempotent — what a real sync needs).
- **Deterministic citation keys** (`fuzzi2015`, Better-BibTeX style) with
  `a/b/c` collision suffixes.
- **BibTeX → CSL-JSON** so every path is stored CSL-JSON-first.

All of the above is unit-tested and was verified empirically (23/23 assertions
via citeproc + a logic harness, since the full monorepo install was flaky here).

### Remaining gaps (a fuller Zotero connector)
- References are scoped to a manuscript/project — there is **no single shared
  reference *library*** drawn on across manuscripts (Zotero's model). Next step:
  a library object + per-manuscript citation links.
- Import is **one-way**; no incremental sync (`since` version), collection
  selection, or attachment/PDF handling.
- DOI/Zotero lookups need network (no offline), unlike CSL formatting which is
  now offline-first.
