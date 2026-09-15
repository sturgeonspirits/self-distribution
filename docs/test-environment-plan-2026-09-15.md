# Distribution Test Environment Plan

Date: 2026-09-15
Status: required before production changes
Working branch: `codex/distribution-system-foundation`
Staging Drive folder: [STAGING - Sturgeon Distribution System - 2026-09-15](https://drive.google.com/drive/folders/1eQzYcfzlIGxE1tdl7bABFu32OGL__TW2)

## Established Resources

| Resource | Staging ID | Verification |
| --- | --- | --- |
| [Inventory Backend staging copy](https://docs.google.com/spreadsheets/d/1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8/edit) | `1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8` | All five operational tabs present; full used ranges match source |
| [Badger Invoice Tracker staging copy](https://docs.google.com/spreadsheets/d/10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ/edit) | `10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ` | All eight tabs present; core parser-output ranges match source |
| [Private Badger parser fixture folder](https://drive.google.com/drive/folders/1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq) | `1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq` | Four private PDF fixtures; valid, review and duplicate cases represented |
| [Distribution Directory and Leads staging copy](https://docs.google.com/spreadsheets/d/1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo/edit) | `1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo` | Private copy; TEST mode; Karl-only recipient; complete staging mailer prepared |

Verified baseline row counts include the header row:

| Sheet | Rows | Source/staging comparison |
| --- | ---: | --- |
| Stores | 13 | Identical |
| SKUs | 15 | Identical |
| Inventory | 69 | Identical |
| Counts | 321 | Identical |
| Reorders | 7 | Identical |
| Invoices | 153 | Identical |
| Invoice Lines | 468 | Identical |
| Import Errors | 190 | Identical |

These copies and fixtures establish the data-isolation boundary. Complete test
parser version `2026.09.15.5-TEST` is prepared locally and restricted to the
staging spreadsheet, fixture folder and `TEST - ...` tabs. Installing it in the
staging bound Apps Script project, then creating a staging web deployment and
Netlify deploy preview, are still required before application runtime testing.

Five empty, formatted parser tabs have been added to the staging Tracker:
`TEST - Invoices`, `TEST - Invoice Lines`, `TEST - Import Errors`,
`TEST - Parser State` and `TEST - Monthly Summary`. The original eight copied
tabs and their baseline data were not rewritten.

### Parser Checkpoint: `2026.09.15.5-TEST`

Manual fixture import passed on 2026-09-15:

- `SS0157` imported with 5 line items and an invoice total of `$286`.
- `SS0159` imported with 9 line items and an invoice total of `$792`.
- The nonstandard service PDF was classified `REVIEW` and logged once.
- The second `SS0157` PDF was classified `DUPLICATE`.
- A second complete parser run imported no additional data.
- Verified row counts after the second run remained 2 invoices, 14 invoice
  lines, 4 parser-state records and 1 expected import-error row.

This establishes manual-run idempotency for the current fixture set. It does
not yet approve an automatic trigger or production installation.

### Zoho Outreach Checkpoint: `2026.09.15.6-TEST`

Karl's Zoho mailbox connection and one controlled send passed on 2026-09-15:

- Authenticated mailbox: `karl@sturgeonspirits.com`.
- Visible sender alias: `sales@sturgeonspirits.com`.
- Zoho account ID: `2924079000000008002`.
- The test message for `1850 Tavern on Main` was delivered only to Karl and
  entered Zoho's five-minute-delay Outbox.
- Zoho message ID: `1789513236864155300`.
- The test did not mark the prospect as contacted and did not queue a live
  message.
- `Activity Log` now records the prospect as `Intended Recipient`, the actual
  Karl-only destination as `Delivered To`, and the mailer version separately.
- The complete `2026.09.15.6-TEST` source remains locked to the staging
  spreadsheet and blocks queued and LIVE sends at both menu and send-function
  levels.
- Every template now includes only a small public Sturgeon Spirits logo linked
  to the company website. The website and logo URLs are maintained in `Email
  Editor!B15:B16`, not hardcoded in the script.
- Footer sender name and title are editable shared fields. Karl's staging
  defaults are `Karl Loewenstein` and `President`; changing them does not alter
  the authenticated Zoho mailbox or sender alias.
- Every template leaves one blank line between the closing and sender name.

The staging audience audit found 493 accounts, 143 syntactically valid email
addresses, 115 cold-prospect addresses that satisfy the current safety rules,
and 18 safe Top-50 prospects. No account is queued. A `Pilot Review` tab holds
three Wave 1 candidates, all with `Pending review` status:

| Source row | Business | Segment | Email confidence |
| ---: | --- | --- | --- |
| 217 | DOCKSIDE TAVERN | A | Confirmed |
| 221 | FAR VU GOLF COURSE | A | Published |
| 227 | HILTON GARDEN INN OSHKOSH | B | Published |

The wholesale sell-sheet file was verified with an **Anyone with the link can
view** reader permission on 2026-09-15. Its URL is maintained in the
pale-yellow `Email Editor!B13` cell and flows into `Campaign Settings`
automatically, so future sell-sheet replacements do not require a code change.

## Purpose

The test environment must allow repeatable data migration and full mobile
workflow testing without writing to the live inventory backend, the live Badger
Tracker, the live invoice folder or Zoho LIVE campaigns.

## Isolation Model

Create these staging resources:

1. A copy of `test-self-distribution-Main` named with an obvious `STAGING - DO
   NOT USE FOR LIVE COUNTS` prefix.
2. A separate staging Apps Script web app bound to or configured for that copy.
3. A read-only adapter connection to the existing Badger parser output. If
   parser behavior itself must be tested, use a copied tracker and a small
   fixture folder of copied PDFs.
4. A Netlify deploy preview for the non-production branch.
5. Staging-only environment values for the Apps Script URL and API key.
6. Zoho mode fixed to TEST with a single controlled test recipient.

Do not connect a deploy preview to the production Apps Script URL.

## Branch and Deployment Rules

- Development occurs on `codex/distribution-system-foundation` or child
  feature branches.
- `main` remains the production branch.
- Netlify branch/deploy previews may build the staging UI.
- No merge to `main`, production Netlify deploy or live Apps Script deployment
  occurs during audit and migration-model work.
- Every deployable file, including Apps Script files, carries the same app
  version.

## Staging Data Setup

### Inventory Baseline

Copy the live workbook as a point-in-time snapshot and record:

- Source spreadsheet ID and modification time.
- Row counts and headers for Stores, SKUs, Inventory, Counts and Reorders.
- A checksum/fingerprint for each nonblank source row.
- Known baseline totals by store and SKU.

The staging migration may add new tabs but must not rewrite the original five
tabs until a compatibility test proves the existing API behavior.

The malformed Reorders header is tested by importing its rows according to the
current `apiCreateReorder_()` writer contract. A new normalized Reorders model
is created alongside the copied legacy tab.

### Badger Parser Fixtures

First inspect and version the existing bound parser source. Then create a small
fixture set that covers:

- A recent successfully parsed invoice such as `SS0157`.
- A multi-line, multi-product invoice.
- A duplicate PDF/file ID.
- A PDF present in the folder but not yet processed.
- An unsupported non-`SS####` Sturgeon invoice.
- An older Badger-format invoice with a different number pattern.
- A supplier invoice that must not count as distribution revenue.
- A malformed or unreadable PDF.

Expected `Invoices`, `Invoice Lines` and `Import Errors` rows are captured as
golden fixtures. The canonical adapter is tested against those outputs; it does
not parse PDF text itself.

Verify parser-state migration separately: a successful file is skipped from its
`Invoices` PDF File ID, unsupported files remain visible in `Parser State` as
`REVIEW`, and retryable errors remain eligible for a later run. Confirm that the
parser maintains only one `ocr_daily_state` property. Run
`cleanupLegacyParserProperties()` only in staging first and verify it removes
legacy `processed_pdf_` and `ocr_count_` entries, preserves their file IDs as
`LEGACY_PROCESSED` rows, and does not delete `SUPABASE_KEY`, `SUPABASE_URL` or
an unrelated sentinel property.

Begin fixture testing with manual runs so the existing behavior is captured.
After the source review, add the proposed trigger only in staging and run the
same fixtures through it. Tests must distinguish three states: PDF candidate
waiting for a parser run, parser output waiting for app sync and canonical
import completed. The manual command remains the recovery path if a trigger is
disabled or fails.

### CRM and Historical Fixtures

Use a limited, representative subset containing:

- One current customer with inventory and multiple Badger invoices.
- One win-back customer.
- One lapsed/former customer found only in first-year reports.
- One cold prospect with a verified email.
- One prospect without email.
- One business with multiple contacts.
- One chain with multiple locations.
- One ambiguous alias requiring review.
- Historical visit rows with a blank carried-forward date.
- A Form response with a claimed sale that needs review.

Store original source values and expected canonical IDs in fixture manifests.

## Configuration

Recommended staging controls:

- Netlify `APPS_SCRIPT_URL`: staging deployment only.
- Netlify `API_KEY`: staging-specific secret.
- Apps Script `REQUIRE_API_KEY`: enabled before shared preview testing.
- Apps Script spreadsheet ID: staging workbook only.
- Zoho mode: `TEST`.
- Zoho test recipient: controlled Sturgeon address.
- Live campaign send action: disabled in staging unless explicitly unlocked for
  a narrowly approved test.

No secrets are stored in Git, Sheets cells or browser code.

## Regression Suite for Existing Inventory

These behaviors are release blockers:

1. Load all active stores and select a rep.
2. Load a store's existing SKU inventory and current counts.
3. Enter shelf and back-stock quantities on a narrow phone screen.
4. Verify total count is shelf plus back stock.
5. Switch between shelf and back without losing entered values.
6. Submit counts and verify Counts append plus Inventory update.
7. Verify sold-since-last-count results remain correct.
8. Create a reorder and verify quantities, cases and status.
9. Add an existing SKU to a store.
10. Create a new product and add it to a store.
11. Update manager and assistant manager contacts.
12. Scan a known UPC and focus the correct item.
13. Load the manager grid.
14. Recover cleanly from API and validation errors.

Tests should include a standard phone, a narrow Galaxy Fold cover-screen
viewport and the Fold's wider unfolded viewport. Touch targets, sticky actions,
numeric entry, text wrapping and keyboard overlap must be checked on each.

## New-System Test Suites

### End-to-End CRM Scenario

The principal acceptance test follows one staged business through the complete
lifecycle:

1. Import or create a lead and rank its sales likelihood.
2. Send an approved Zoho test message and record the outbound activity.
3. Record a response and create an in-person follow-up.
4. Complete the visit, add/update contacts and record a tasting or sample.
5. Mark the opportunity won and create an order.
6. Run the existing Badger parser and match the resulting invoice.
7. Confirm delivery and establish inventory history.
8. Submit shelf and back-stock counts without breaking existing inventory
   behavior.
9. Generate a restock signal and send an approved reorder inquiry.
10. Record the response and create the next proposed order.

Every step must appear in the same Account timeline, retain source provenance
and remain attributable to the prior step. The employee must complete the flow
without opening a source spreadsheet, except the administrative parser fallback
while it remains manual.

### Account Migration

- Re-running the same import is idempotent.
- Approved aliases match deterministically.
- Chain locations do not collapse into one location.
- Ambiguous matches enter ImportReview.
- Every canonical record links back to its SourceRecord.

### Historical Activity

- Blank dates inherit only within a valid dated route block.
- Contact names are not silently merged when identity is uncertain.
- Free-text sales claims do not create paid invoices automatically.
- Next steps create open FollowUps with traceable source evidence.

### Invoice and Reconciliation

- New PDFs remain pending until the existing parser runs, either through the
  approved trigger or the manual fallback.
- The app shows the parser's last acknowledged run and last successful sync as
  separate timestamps.
- Syncing before a parser run does not mark pending PDFs as failures.
- Trigger retries do not duplicate invoices, lines or import batches.
- Overlapping parser runs are prevented by a lock.
- Existing parser output imports once.
- Invoice lines map to SKUs by approved aliases and volume.
- Unknown Delivered/Paid/Submitted values remain unknown.
- Sturgeon-received payments create a Badger remittance obligation.
- Badger-direct payments do not create that obligation.
- Partial payments and partial remittances reconcile by allocation.
- Unsupported documents are classified separately from parser defects.
- A won sale links to exactly one matching Badger invoice when the evidence is
  unambiguous.
- Ambiguous sale-to-invoice matches enter ImportReview and remain unlinked.
- Delivery quantities create inventory-history evidence without overwriting a
  later physical count.

### Sale-to-Reorder Loop

- Below-par counts, estimated depletion, elapsed reorder interval and manual
  flags can each create a ReorderSignal.
- Every signal displays its evidence and suggested quantity.
- Duplicate source evidence does not create duplicate open signals.
- `Ask about reorder` uses an approved template and Zoho TEST mode.
- Customer-facing messages do not expose internal counts, confidence scores or
  uncertain sales estimates.
- The inquiry records its Zoho message ID, account activity and follow-up date.
- A positive response creates a proposed order for human confirmation.
- Declined, deferred, no-response and in-person outcomes close or reschedule the
  signal correctly.
- The resulting order remains attributable to the inquiry and original sale.

### Zoho Campaigns

- Accounts can be ranked by sales likelihood with visible score reasons.
- Outreach priority changes with follow-up timing without rewriting the sales
  likelihood score.
- TEST messages go only to the configured test recipient.
- Current customers and do-not-email contacts are suppressed.
- Win-back/lapsed accounts require reactivation copy.
- Invalid or unverified addresses cannot be queued for live send.
- Template version and Zoho message ID are recorded.
- Sending a message creates an account activity.
- Manual reply classification and any future Zoho inbox sync produce the same
  CampaignResponse and account timeline result.
- A response can create either an electronic or in-person FollowUp assigned to
  an employee.
- A completed visit or sale remains attributable to the originating outreach.
- No priority calculation automatically approves a send.

## Reconciliation Reports

Before any production proposal, generate and retain:

- Source versus staged account counts by source and relationship.
- Matched, new and review-required account totals.
- Invoice count and amount totals by month.
- Invoice-line quantity and sales totals by product.
- Unmatched customer aliases and product descriptions.
- Delivered, customer-paid and Badger-remitted totals with unknown counts.
- Inventory row, count event and reorder totals before and after migration.
- Campaign suppression totals by reason.

Differences must be explainable at the source-record level.

## Promotion Gates

Production work may be proposed only when all of these are true:

- The current code/data audit is accepted.
- The migration model is accepted.
- The existing Badger parser source has been inspected and versioned.
- Staging resources are isolated and clearly labeled.
- Import reruns are idempotent.
- All inventory regression tests pass.
- Invoice and financial reconciliation totals are approved.
- ImportReview has no unresolved high-risk financial matches.
- Galaxy Fold and standard mobile workflows pass visual/touch testing.
- Zoho remains in TEST through acceptance testing.
- Current Supabase credentials may be stored in Apps Script Properties for
  compatibility, but staging must not write to the live map without explicit
  production-write approval.
- A backup, rollback plan and production runbook are documented.
- The owner explicitly approves production migration and deployment.

## Current Status

Completed:

- Non-production branch created.
- Clearly labeled staging Drive folder created.
- Inventory Backend and Badger Invoice Tracker copied into staging with owner
  approval.
- Protected inventory tables and core Badger output tables compared with their
  sources and verified identical at the recorded baseline.
- Current repository and production data flow audited.
- Linked source spreadsheet structures and sample records inspected.
- Badger parser output contract and processing lag observed.
- Migration model and staging acceptance criteria documented.

Still required before implementation:

- Sign in to the browser or export the bound Badger Tracker `Code.gs` so its
  exact parser logic can be inspected and versioned.
- Confirm that the Badger staging copy retained its bound Apps Script project,
  then configure and test the proposed trigger only on the staging copy.
- Create the staging Apps Script web deployment and Netlify deploy preview.
- Capture fixture snapshots and expected results.
- Implement migration tooling and the new app shell only against staging.
