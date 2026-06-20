# connector-runner

A small Express + Playwright service that drives a human-authenticated browser
(via the BlitzBrowser backend) to read data out of authenticated portals. It
backs the funding/discovery features by extracting structured data from sources
that have no usable API.

Connectors are registered in `src/connectors.ts`. Each one is a manifest plus a
provider with one or more actions. Actions run in two modes:

- **profile** — a one-shot throwaway browser (`POST /connectors/:id/actions/:actionId`)
- **session** — an already-open, signed-in live session
  (`POST /connectors/:id/auth/sessions/:sessionId/actions/:actionId`)

Existing connectors (`wave`, `bc-registry`, `gcos`) are strictly read-only: they
extract and download, they never write to the portal.

## Application autofill (`application-autofill`)

Assisted autofill for grant and scholarship application portals. This is the
first connector that *writes* into a page — but it stops at pre-filling fields
for a human to review. **It never clicks submit and never calls `form.submit()`.**

Two actions:

### `analyzeForm`

Reads the visible form on the current page (session mode) or a given `url`
(profile mode) and returns every fillable field with a stable selector, label,
type, options, required flag, and current value. Password and obviously
sensitive fields (SIN, bank/account numbers, card numbers) are skipped entirely.
File inputs are reported but flagged as not autofillable.

```bash
# session mode (live, signed-in browser)
curl -X POST "$RUNNER/connectors/application-autofill/auth/sessions/$SESSION/actions/analyzeForm" \
  -H "x-connector-runner-secret: $SECRET" -H 'content-type: application/json' \
  -d '{}'
```

### `fillForm`

Pre-fills the live form. Session mode only — it refuses to run without a live
session. Accepts **either**:

- `applicantProfile` — a list of `{ key, label?, value, aliases?, sensitive? }`
  fields. The runner matches them onto the analyzed form with a deterministic
  scorer (`buildAutofillPlan`) and a default alias dictionary for common
  application vocabulary (name, email, organization, project title, amount, …).
- `assignments` — an explicit `{ selector, value, optionValue?, … }[]`. This is
  the seam for an LLM planner: have the model produce assignments from the
  `analyzeForm` output, then pass them straight through.

```bash
curl -X POST "$RUNNER/connectors/application-autofill/auth/sessions/$SESSION/actions/fillForm" \
  -H "x-connector-runner-secret: $SECRET" -H 'content-type: application/json' \
  -d '{
    "applicantProfile": { "fields": [
      { "key": "firstName", "value": "Ada" },
      { "key": "email", "value": "ada@example.org" },
      { "key": "projectTitle", "value": "Analytical engine" }
    ] },
    "dryRun": true
  }'
```

`dryRun: true` returns the plan (assignments + unmatched fields + unused profile
keys) without touching the page — useful for a review step. A real run fills the
fields, outlines each filled field in blue (`highlight`, default on), and returns
a per-field result (`filled` / `not_found` / `no_option` / `skipped`). The
response always includes `submitted: false`.

## Where this plugs in next

The pieces from the design that are now in place: the **action layer**
(`analyzeForm` / `fillForm`, no submit), the **field-mapping/profile model**
(`buildAutofillPlan`, alias dictionary, `applicantProfileFromRecord`), and reuse
of the existing **BlitzBrowser session auth**. Remaining work toward the full
feature:

1. **Profile builder** — map a `grantApplication` + researcher/team record into
   an `ApplicantProfile` (a thin Convex/front-end adapter over
   `applicantProfileFromRecord`).
2. **LLM planner** — feed `analyzeForm` output + the profile to a model and have
   it emit `assignments` for fields the deterministic matcher misses. The browser
   code does not change; the planner only produces assignments.
3. **Review UI** — surface the `dryRun` plan, let the user edit/approve, then run
   the real fill. Submission stays manual by design.

## Develop

```bash
npm install
npm run typecheck
npm test          # unit tests for the pure matching/plan logic (node:test)
npm start         # requires a reachable BlitzBrowser backend
```
