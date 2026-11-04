# Integrating the repair ticket demo into the UZBL portal

This guide is for the team building the demo's intake flow into the UZBL portal. It describes the integration **from this demo's side only**: what the demo does, what it produces, and the steps to plug that into an existing ticketing system. Details of the portal itself come from the UZBL team, not from this document.

**Reviewer:** Jacob Lopez. **Jacob reviews before it goes to production.**

---

## At a glance

- **What:** bring the demo's bulk intake into the portal, so a school can send its repair list in whatever format it already has and get repair tickets out of it.
- **Approach:** treat this repo as the **reference, not code to paste in**. Port the logic into the portal's own stack and conventions.
- **Locked decisions:**
  - There is **no separate incident screen or field.** The feature reads whatever the school already wrote and only asks "What happened?" when something is missing (section 7).
  - Submitting **reuses the portal's existing ticket and claim creation flow.** Don't build a new submission path.
- **Release:** dev → staging → production (section 8), with Jacob's review before production.

---

## 1. What the feature does

1. **Reads any file:** .xlsx, .csv, PDF, Word, a screenshot, or pasted text such as an email.
2. **Works out the columns:** finds the header row and decides what each column holds. Student-name columns are dropped.
3. **Pulls the facts for each device:** serial, asset tag, model, what happened, when, where, and the ship-to address, each with a confidence score.
4. **Judges each device:** damage type; accident, defect or intentional; whether it was in the case; and whether the note really says what happened.
5. **Runs plain-code pre-checks:** inventory match with "did you mean", PO box, duplicates, missing description, beyond-repair risk, Break-Fix credits, and routing to the warranty claim, the OEM warranty or Break-Fix.
6. **Asks the person only what it has to,** one tap per question, then submits every device at once.

---

## 2. Files to read first

| Concern | File |
|---|---|
| The whole flow, in order | `src/server/intake/pipeline.ts` |
| Model calls (Clef, Clairic, vision, document-to-Markdown) | `src/server/ai/models.ts` |
| Keyword fallback when a model call fails | `src/server/ai/mock.ts` |
| File readers and header-row detection | `src/server/intake/xlsx.ts`, `csv.ts`, `markdown.ts`, `table.ts` |
| Pre-check rules (plain code) | `src/shared/rules.ts`, `src/shared/text.ts` (PO box, serial normalisation) |
| Demo inventory (replace with real data) | `src/shared/inventory.ts` |
| Column, damage and cause option lists | `src/shared/labels.ts` |
| Data shapes | `src/shared/types.ts` |
| Demo HTTP API (upload, submit) | `src/server/api.ts` |
| Review questions and edits | `src/app/lib/review.ts`, `src/app/components/Review.tsx` |
| Upload box | `src/app/components/Home.tsx` |
| Sample messy files (fake data) | `public/samples/` (built by `samples/make_samples.py`) |
| Tests | `tests/` and `tests/e2e/demo.spec.ts` |

To run the demo locally, see the README (`npm install`, `npm run preview`, `npm test`).

---

## 3. Model calls the demo makes

| Step | Model | Calls |
|---|---|---|
| PDF, Word, .xls, .ods, .numbers to text | Workers AI Markdown Conversion | 1 per file, only for those formats |
| Screenshot to text | `@cf/meta/llama-4-scout-17b-16e-instruct` (vision) | 1 per image |
| Decide what each column holds | **Clef**, `@cf/cloudflare/clef` (multiple choice, with probabilities) | 1 per file |
| Pull each row's fields | **Clairic**, `@cf/cloudflare/clairic` (typed extraction, with confidence) | 1 per row (+1 to list serials when there's no table) |
| Judge damage, cause, in-case, complete | **Clef** | 1 per row |

If a call fails, the demo falls back to keyword rules and says so on screen. Demo limits: 60 rows and 4 MB per file, 6 rows processed at a time.

---

## 4. Build steps (in order)

Each step is one pull request into the portal's development branch (section 8). Keep them in this order.

### Step 0: Decide how the portal calls the models
- **Option A:** the portal's server calls the models directly (for example Workers AI over its REST API, through an AI gateway).
- **Option B (closest to the demo):** deploy the intake as a small separate service (for example a Cloudflare Worker) that the portal's server calls with a service token. Only file bytes go out and only parsed rows come back. The browser never calls it.
- First confirm the models are reachable the way Option A needs. If they aren't, use Option B.
- Either way:
  - Keys live only in the server environment, never in code or the browser.
  - Set a usage cap and a per-school rate limit.
  - Log the model name and version and the confidence of every value.
- **Deliverable:** a short written decision plus the input/output interface (section 5), shared with Jacob and the UZBL team before Steps 1–5 start.

### Step 1: Upload
- Add an "Upload a repair list" entry point where the UZBL team wants it (section 10).
- Accept .xlsx, .csv, PDF, Word, PNG/JPG screenshots, or pasted text. Limits: 4 MB and 60 rows for now.
- Keep the person on the page while it works. The demo streams one JSON line per event (`IntakeEvent` in `types.ts`). Streaming or polling a job id are both fine; say which in the PR.
- Never store the uploaded file, and never store any student-name column.

### Step 2: Read the file and map the columns
- Port `table.ts`: find the header row; skip title, blank, total and instruction rows.
- Ask Clef what each column holds (column types are in `labels.ts`).
- Drop `student_name` columns **before any other model call.**
- **Close the demo's privacy gap (required):**
  - The demo sends up to 3 example values from *every* column to Clef, student-name columns included, and only drops them afterwards.
  - In production, a column whose header looks like a person's name (`name`, `student`, `kid` and similar) is classified from its header alone, or with masked examples. No real values from it are sent.
  - Drop `staff_contact` columns (teacher names and emails) too, unless the claim needs them; if so, say why in the PR.
  - For text with no table (pasted email, PDF letter, screenshot), mask anything that looks like a name or email address before any model call.
  - **Required test:** no student-name value, and no masked staff name or email, appears in any model request.

### Step 3: Pull the facts and judge each row
- Send each row's kept columns to Clairic as plain text, with `Today is …` as the first line so "yesterday" and "last Tuesday" resolve to real dates. The demo hard-codes one time zone; **use the school's time zone.**
- Extract `serial_number`, `asset_tag`, `device_model`, `what_happened`, `incident_date`, `location`, `ship_to`, each with a confidence.
- Ask Clef for `damage`, `cause`, `in_case` and `complete` (exact wording: `ROW_QUESTIONS` in `pipeline.ts`).
- Keep the original cell next to every value so the review screen can show where it came from.
- Below a set confidence threshold, ask the person instead of guessing. State the threshold in the PR.

### Step 4: Pre-checks in plain code
- Port `rules.ts`, replacing the demo inventory and credits with the school's real data.
- If the portal already has a PO box check, reuse it rather than adding a second one.
- Flags: unknown serial (with "did you mean"); no serial; duplicate in the file; **already has an open claim** (new, not in the demo); PO box ship-to; missing or thin description; no date; beyond-repair risk; no coverage; likely to be denied (intentional, not in the case, defect).
- Routing: warranty claim, OEM warranty, or Break-Fix using the school's Break-Fix credits.
- **The demo's warranty rules are samples.** Replace them with UZBL's actual coverage terms and the warranty provider's confirmed claim rules (the UZBL team has these). In particular, check how liquid damage, battery failure and the repair-count limit should route; the demo's beyond-repair warning (`priorRepairs >= 2`) is a placeholder.
- Unit tests for every rule.

### Step 5: Review screen and submit
- One card per question, each answered with one tap: PO box (suggest the school's street address); mistyped serial (suggest the closest match); missing description (one text input); likely to be denied (offer Break-Fix instead); no coverage.
- Show where in the file each value came from.
- **Submit through the portal's existing ticket and claim creation flow** (section 6). Re-run the same rules on the server before creating anything, as the demo's `createTickets` (`src/server/tracker.ts`) does.
- Show the result for each device and link each new ticket to its existing tracking page.

---

## 5. What the demo produces

From `src/shared/types.ts` (trim as needed):

```ts
IntakeResult {
  fileName, sheetName, source,
  columns: { index, header, kind, confidence, dropped }[],
  rows: IntakeRow[],                       // one per device
  skippedRows: { rowNumber, reason }[],
  stages: { id, model, ms, calls, inputTokens, fallback }[]
}
IntakeRow {
  rowNumber,
  fields: { serial, assetTag, model, whatHappened, incidentDate, location, shipTo }, // each { value, confidence }
  decisions: { damage, cause, inCase, complete }, // complete = probability 0..1
  raw: { [header]: cellValue },            // kept columns only
  serial, device, suggestion, route, routeLabel, routeReason,
  flags: { code, level: 'block'|'warn'|'info', title, detail }[],
  include: boolean,
  aiSource: 'models' | 'backup-rules'
}
```

What the browser sends to submit, one per device (`SubmissionRow`):
`{ rowNumber, serial, route: 'warranty'|'oem'|'break_fix', whatHappened, incidentDate, location, shipTo, damage }`

In the demo, `POST /api/intake` (multipart `file`, or JSON `{ text }`) returns NDJSON events and `POST /api/submissions` takes `{ rows }`. Use the portal's own route conventions and list them in the PR.

---

## 6. Plugging the output into the portal

Map the demo's output onto the portal's existing records. The UZBL team confirms the exact targets.

| Demo output | Goes to | Notes |
|---|---|---|
| Demo inventory (`src/shared/inventory.ts`) | The school's real device list | Serial, model, touch/non-touch, coverage, prior repairs |
| Demo credits | The school's real Break-Fix credit balance | Touch and non-touch counted separately |
| `route` | Which existing submission flow to use | `warranty`, `oem` or `break_fix` |
| `fields.whatHappened` | The ticket's description | Store the school's text exactly as written |
| `fields.incidentDate` | The ticket's incident or problem date | Defaults to today, with a warning, if none was found |
| `decisions.damage`, `decisions.cause` | The ticket's issue type and cause | Keep these in their own fields; don't merge them into the description |
| `decisions.inCase`, `fields.location` | Wherever the claim needs them | Confirm with the UZBL team whether these have their own fields |
| `fields.shipTo` (one string) | The ticket's return address | Parse it, or default to the school's address |
| `raw` / source cell | Kept alongside the ticket | So staff can see where each value came from |

---

## 7. How the "what happened" text is handled

- **No separate incident field or page.** The text comes from what the school already wrote:
  - **Spreadsheet:** Clef marks the description column as `what_happened` or `notes`. Each row's kept cells are joined, and Clairic pulls out `what_happened` in the reporter's own words, plus `incident_date` and `location`.
  - **Pasted email, letter or screenshot:** Clairic lists every serial in the text, then reads the text once per serial ("for the device with serial X only…") to pull out that device's what, when and where.
- **"How it happened" is judged, not typed:** Clef returns `cause` (accidental, defect, intentional, wear, unknown), `in_case`, `damage`, and `complete` (the probability the note gives real detail rather than "broken" or "pls fix").
- **Missing or thin description** (under 8 characters, or `complete` < 0.5): the row is blocked and the review screen asks **"What happened?"** in one text input, minimum 8 characters. The answer replaces the extracted value with confidence 1.
- **On submit,** the server re-checks `whatHappened` is at least 8 characters.
- **Requirement:** store the text **exactly as the school wrote it**, keep Clef's judgements in their own fields, and keep the source cell so staff can see where the text came from.

---

## 8. Release process: dev → staging → production

1. **Dev.** Branch from the development branch for each step and open a pull request into it.
   - Automated checks must pass: lint, type check and tests, including the privacy test from Step 2. Add a CI workflow if there isn't one.
   - No merge conflicts with the development branch.
2. **Staging.** Merge into a staging branch.
   - Staging uses its own database (never production data) and a preview URL.
   - All tests pass on the preview URL, including an end-to-end run of every sample file in `public/samples/` plus a pasted email, through to submitted tickets.
   - Fake data only on staging. No real school or student data.
3. **Production.** Merge staging into production and deploy. **This happens only after Jacob's review.**

**For each PR, include:**

- what changed and which build step (0–5) it implements;
- test output (unit tests, plus the student-name privacy test);
- screenshots or a short screen recording of the upload, review cards and submit result, **fake data only**;
- the model log for one sample file (models, versions, calls);
- for Step 0, the written decision (Option A or B) and the interface.

Never put real school or student data, or any key, in a PR, screenshot or log.

---

## 9. Done when (acceptance criteria)

1. Every sample file in `public/samples/` (the .xlsx with a title row and an instructions sheet, the .csv, the screenshot), plus a pasted email, reads correctly without renaming any column.
2. In each sample, every device either has its serial and its what, how and when filled in, or is flagged for a person to check.
3. An automated test proves that no student-name value, and no masked staff name or email, appears in any model request.
4. Every pre-check rule has unit tests, and every flagged row says what's wrong in plain words.
5. A PO box ship-to can't be submitted, and no shipping label is requested for it.
6. Submitting creates tickets through the portal's existing flow. Each new ticket shows on its existing tracking page, visible only to that school.
7. If a model call fails, the person sees that backup rules were used, and nothing is submitted without the person confirming.
8. No keys in code; every new setting comes from the server environment.
9. Each model call is logged with model, version and confidence, with nothing personal in the logs.
10. A typical 14-device file goes from upload to submitted in a few taps.
11. It has passed dev and staging as described in section 8.

---

## 10. Open questions for the UZBL team

1. Where should the upload live, and should it replace any existing bulk upload?
2. Should warranty claims created from a bulk upload be filed immediately, or wait for staff approval?
3. What should happen to OEM-warranty rows?
4. Where should "in a case" and the incident location be stored?
5. Which model setup (Option A or B) fits UZBL's infrastructure, and who can deploy it?
6. Who deploys, and where do staging and its database run?

---

**Jacob reviews before it goes to production.**
