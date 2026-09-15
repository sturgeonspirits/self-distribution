# Badger Invoice Parser Audit

Date: 2026-09-15
Status: source reviewed; no deployment performed
Reference version: `2026.09.15.5-TEST`
Original source SHA-256: `5b7122a55fb74f3f452f6d2c2ea6ed8248448d1458a4faaab5150d98cdb0b22d`

## Source Captured

The pasted 1,577-line integrated master script has been preserved as a
versioned, redacted reference at `docs/reference/badger-parser/Code.gs`. Its
JavaScript syntax check passes.

The Apps Script project shown in the supplied screenshot contains:

- `Invoice Parser.gs`
- `supakeys.gs`
- `appsscript.json`

The manifest uses the V8 runtime, America/Chicago time zone, Stackdriver
exception logging and the Advanced Drive service v3. The manifest has been
reconstructed at `docs/reference/badger-parser/appsscript.json`.

The contents of `supakeys.gs` have not been captured because it contains
credentials. It is intentionally excluded from the repository. The parser
audit does not require its secret values.

The Apps Script project already contains the required Script Properties under
the exact names `SUPABASE_KEY` and `SUPABASE_URL`. The sanitized reference now
reads those existing properties and does not define or store their values.

## Existing Import Flow

The parser already supplies the required ingestion engine:

1. `importNextBatch_()` obtains a script lock.
2. It recursively lists PDFs in the configured Drive folder and subfolders.
3. The production source skips file IDs marked as processed in Script
   Properties. Test version `2026.09.15.5-TEST` instead derives successful IDs
   from `Invoices` and terminal exceptions from `Parser State`.
4. It extracts text using Drive conversion and falls back to OCR.
5. It parses an `SS` invoice number, date, customer, amount and line items.
6. It rejects duplicate invoice numbers already present in `Invoices`.
7. It appends invoice and line rows.
8. It applies status validation and rebuilds the monthly summary.

This logic should be adapted and wrapped, not rebuilt.

## Blocking Findings

### 1. Exposed Supabase service-role credential (deferred owner task)

The pasted source contains a Supabase service-role credential in code. The
repository reference replaces it with a redaction marker. Treat the original
credential as exposed. At the owner's direction, rotation is deferred until the
CRM and parser workflow are working in staging. The current credential may be
used through Apps Script Properties, but it must not be committed, printed in
logs or copied into source code.

### 2. Processed flags are committed before sheet writes

The production parser calls `markProcessed_()` while building in-memory rows,
then appends the invoice and line batches afterward. If either sheet write
fails, those file IDs remain marked processed even though their rows were not
saved. A retry will skip them and can leave invoices or lines missing.

Test version `2026.09.15.5-TEST` queues state rows and writes them only after
the invoice and line writes return successfully. It also treats the `Invoices`
PDF File ID column as the durable success index. Staging still needs a forced
partial-write fixture before this is considered production-ready.

In staging, write and verify both tables before committing processed state. A
run journal should record pending, written and committed file IDs.

### 3. New invoices default unknown facts to false

`buildInvoiceWriteRows_()` writes Delivered and Paid as `false` and Submitted as
`No`. This conflicts with the clarified business rule: blank legacy values mean
unknown, not that delivery, payment or remittance did not occur.

The parser output should leave these fields unknown. Canonical DeliveryEvents,
Payments and BadgerRemittances should record positive facts separately.

### 4. Live PDF folder exposure in staging (resolved in test package)

The captured production source points at the live Badger invoice folder. Test
version `2026.09.15.5-TEST` is instead bound to private fixture folder
`1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq` and rejects the production folder ID.

### 5. Destructive reset is exposed in the regular menu

`RESET: Clear Sheets & Headers` clears parser state and data below headers. It
is adjacent to normal operational commands and has no typed confirmation,
authorization check or backup step. Remove it from the ordinary menu or protect
it behind an explicit administrative recovery flow.

## Additional Findings

- The original parser creates one `processed_pdf_<file-id>` Script Property per
  handled PDF and one `ocr_count_<date>` property per OCR day. Those properties
  grow without limit, causing the Apps Script settings page to exceed its
  50-property display threshold. Test version `2026.09.15.5-TEST` replaces them
  with a visible `Parser State` sheet and one rolling `ocr_daily_state` JSON
  property.
- `cleanupLegacyParserProperties()` is a one-time migration utility. Before
  deleting old properties, it copies previously handled file IDs to
  `Parser State` as `LEGACY_PROCESSED`. It then deletes only properties beginning
  with `processed_pdf_` or `ocr_count_`; it preserves `SUPABASE_KEY`,
  `SUPABASE_URL` and all unrelated properties. It has not been run against the
  live Apps Script project.
- Unrecognized PDFs previously remained unprocessed, so every later batch could
  OCR and log the same unsupported document again. The staging reference records
  these as `REVIEW`, which is terminal until an operator changes the latest
  state to `RETRY`.
- Recursive scanning treats every PDF in every subfolder as a candidate. Add a
  document classification state so unsupported Sturgeon invoices, supplier
  invoices and malformed PDFs are handled intentionally.
- Invoice parsing is deliberately narrow: `SS` plus digits, US slash-formatted
  dates and a specific line layout. Keep this parser for Badger invoices and
  route other document families to review rather than broadening patterns until
  fixtures prove the change.
- Customer extraction can fall back from the Reseller Number label. That match
  requires fixture coverage because a reseller identifier is not necessarily a
  customer name.
- Address, reseller number, winery, phone, order number and terms columns are
  created but not populated by the current parser.
- The tracker stores only `Paid to Me`; it cannot represent customer payment
  directly to Badger without the canonical payment model.
- The Supabase retail-map synchronization is unrelated to invoice ingestion and
  uses a high-privilege key. Separate it from the parser's import permissions.
- There is no durable ParserRuns table or last-run record beyond per-file Script
  Properties and sheet timestamps.

## Trigger Design

Retain the manual menu command as a recovery path. Add a public trigger entry
point that calls the same import core and records one ParserRuns row per run.

The staging trigger must:

- Use the existing script lock to prevent overlapping runs.
- Read folder, spreadsheet and credential configuration from Script Properties.
- Point only at the fixture folder during tests.
- Record invocation type, start/end, candidate count, processed count, skips,
  errors and final status.
- Commit processed file IDs only after invoice and line writes are verified.
- Be idempotent when retried after a partial failure.
- Classify unsupported documents so they do not consume OCR quota forever.
- Leave delivery, payment and remittance states unknown.
- Continue syncing output to the CRM through the separate adapter.

No trigger should be created against the live Tracker until fixture tests,
reconciliation checks and explicit production approval are complete.

## Credential Migration

Do not copy or paste `supakeys.gs` into Git. During staging and before
production promotion:

1. Continue using the existing `SUPABASE_KEY` and `SUPABASE_URL` Script
   Properties for compatibility testing.
2. Do not run a staging map sync against live Supabase data without explicit
   approval for that production write.
3. Keep invoice parsing independent from optional map sync so the parser does
   not require a Supabase credential.
4. Before production promotion, rotate the exposed service-role credential and
   store the replacement only in Apps Script Properties.
5. Replace the current credential with a narrowly scoped key when the Supabase
   integration is revised.
