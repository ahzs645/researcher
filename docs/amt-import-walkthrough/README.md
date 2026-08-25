# A real AMT paper through the composer — captured run

These are screenshots of the running app importing an actual manuscript: the
bookmarked editable master from the AETH Modular editing kit
(`AETH_Modular_AMT_editable_master.docx`, 334 bookmarks, 21 tables, 3 figures,
13 references). The paper is the Copernicus/AMT working draft described in
`../paper-format-assessment/amt-paper-transposition.md`.

The run was driven end to end through the interface — upload, map, review,
commit, then the composer's own tabs and its Export panel — not through the
pure functions underneath.

| Step | What it shows |
| --- | --- |
| `01-upload.png` | The import wizard's upload step. |
| `02-map-document.png` | The map step: every block with the role the import will give it, and the heading outline the document produced. The equations Word set as one-row layout tables are named `EQUATION`, and the shaded status callout is `BODY`. |
| `03-review-and-commit.png` | The summary before anything is saved: **36 sections · 5 tables · 3 figures · 15 equations · 13 references · 16 linked citations**. |
| `04-composer-write.png` | The manuscript in the composer, with live citation chips in the prose. |
| `05-assets.png` | Figures, tables and equations as numbered assets, each anchored to its section. |
| `06-references.png` | The reference records parsed out of the paper's own reference list. |
| `07-export.png` | The Export panel, including submission readiness (the 361-word abstract exceeds AMT's limit — the paper's own known issue). |
| `08-restore-portable-package.png` | The same paper coming back from its portable package: it restores itself, with a statement of what arrived and a **Done** button — no mapping and no confirm step. |

## The portable package

`aeth-modular-portable-research.zip` is that import, exported back out as a
portable research package: `research-paper.json` (36 sections, 23 assets, 13
references, contributors, export settings and the AMT journal template) plus
the three figure PNGs.

Import it with **Import as new manuscript… → drop the ZIP**. Because the app
wrote it, there is nothing to classify and nothing to confirm: the wizard
restores it on arrival and shows what came back.

```
36 sections · 13 references · 15 equations · 3 figures · 5 tables
journal → Atmospheric Measurement Techniques (Copernicus)
eq-7 → "x̄j,time — equation (7)", latex "\bar{x}j,time = \sum_{i} wij xi / \sum_{i} wij"
```

The restored manuscript reports the same submission readiness as the one it
was exported from (6 ready · 14 warnings · 3 required items missing, against
AMT's 350-word abstract limit), which is what makes it a usable fixture: the
paper comes back whole, not as a document to be re-read.

## Reproducing the run

```bash
REACT_APP_DATA_MODE=local npx nx start twenty-front   # http://localhost:3001
```

Then `/compose` → **Import as new manuscript…** → choose the `.docx`. The
wizard analyses the document in the browser; nothing is saved until *Confirm
import*. Drop the portable ZIP instead and it restores straight away.
