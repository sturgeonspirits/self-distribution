# Distribution System Audit

Date: 2026-09-15
App version audited: 2026.08.04.1
Git commit audited: 8bd09be
Production URL checked: https://sturgeon-staff-distribution.netlify.app/
Backend spreadsheet: test-self-distribution-Main
Backend spreadsheet ID: 1BO3u4N6_tEYHzOrPajckgUAcbQazL1fz9tTjVl_UNxs

## Scope

This audit begins the expansion of the existing self-distribution inventory app into the comprehensive distribution system described in the "Find distribution list" planning conversation. No runtime code or production data was changed during this audit.

The existing inventory/count/reorder workflow must remain operational while new distribution features are built in staging and deployed only after verification.

## Current Production Surface

The current app is a static Netlify app with a Google Apps Script backend and a Google Sheets data store.

Tracked deployment files:

- `.gitignore`
- `README.md`
- `index.html`
- `netlify.toml`
- `netlify/functions/inventory.js`
- `apps-script/Code.gs`

Untracked local files were present and were not audited as production code:

- `_karl-edit/`
- `index-old.html`

## Current Code Architecture

### Frontend

`index.html` is a single-file application of about 2,635 lines. It contains:

- CSS
- HTML templates/dialogs
- app state
- API wrappers
- inventory rendering
- manager grid rendering
- sold-since-count rendering
- UPC scanner handling
- add SKU/product flows

Current UI workflows:

- Store + rep selection
- Store contact names
- Inventory count
- Shelf/back split counting
- Sold since last count
- Manager summary grid
- Add existing SKU to store
- Add new product
- Create reorder
- Submit physical counts
- UPC scanning on supported mobile browsers

### Netlify Function

`netlify/functions/inventory.js` is a small proxy from `/api/inventory` to the Apps Script web app.

Current behavior:

- Allows GET, POST, and OPTIONS.
- Adds permissive CORS headers.
- Adds `X-App-Version`.
- Forwards query strings and JSON bodies to Apps Script.
- Optionally appends `API_KEY` from Netlify environment variables.

Risk notes:

- It returns status 200 for Apps Script responses even when Apps Script likely encountered an application-level error.
- It has no request shape validation.
- It has no rate limiting or role enforcement.
- CORS is open to all origins.

### Apps Script

`apps-script/Code.gs` is about 544 lines. It provides the current JSON API.

Current actions:

- `initData`
- `listSkus`
- `addSkuToStore`
- `upsertProduct`
- `submitCounts`
- `createReorder`
- `managerGrid`
- `salesSinceCount`
- `updateStoreContacts`

Current backend style:

- Normalizes sheet headers.
- Reads rows into objects.
- Appends counts and reorders.
- Updates inventory on count submit when requested.
- Adds missing store-contact columns on first save.

Risk notes:

- `REQUIRE_API_KEY` is currently `false` in `Code.gs`.
- There is no Apps Script `LockService` around writes.
- There is no migration/version table for schema changes.
- Several writes depend on expected headers or positional output arrays.
- There are no durable row IDs for counts, reorders, imports, orders, or activities.

## Current Live Sheet Model

Metadata read from `test-self-distribution-Main`:

| Sheet | Sheet ID | Grid size |
| --- | ---: | --- |
| Inventory | 1032860386 | 986 rows x 26 columns |
| Stores | 0 | 1000 rows x 26 columns |
| SKUs | 1301334226 | 1000 rows x 26 columns |
| Counts | 1306161487 | 995 rows x 26 columns |
| Reorders | 2142537331 | 1000 rows x 26 columns |

### Stores

Current headers:

- `store_id`
- `store_name`
- `route`
- `active`

Observed data shape:

- 12 active store rows in the first column read.
- Store IDs are compact manual keys such as `FEST-OSHK`, `CUJA-FDL`, `PIG-OSHK`.

Audit notes:

- The deployed code supports `manager_name` and `assistant_manager_name`, but those columns were not present in the live sheet at audit time.
- Store records currently mix account identity, route grouping, and inventory location. The expanded system needs a broader `Accounts` model and should map current stores to accounts/locations.

### SKUs

Current headers:

- `sku_id`
- `upc`
- `sku_name`
- `size`
- `units_per_case`
- `active`

Observed data shape:

- 14 SKU rows in the first column read.
- Product IDs are stable manual keys such as `STUR-VOD-CHRY-750`.

Audit notes:

- This table is useful and should remain the product/SKU foundation.
- Future order items and invoice lines should reference the same `sku_id`.

### Inventory

Current headers:

- `store_id`
- `sku_id`
- `on_hand_units`
- `par_level_units`
- `reorder_point_units`
- `last_count_date`
- `last_count_units`

Observed data shape:

- Store/SKU rows are grouped by store with blank separator rows.
- The app filters by exact `store_id` and ignores blank rows.

Audit notes:

- This table is the current operational inventory state and should be preserved.
- For the expanded model, this should become `InventoryLevels` or `AccountInventory` tied to account/location and SKU.
- Shelf/back split counts are used in the UI but are not persisted as separate columns in `Counts`; only total counted units are saved.

### Counts

Current headers:

- `timestamp`
- `store_id`
- `rep`
- `sku_id`
- `system_on_hand_units`
- `counted_units`
- `delta_units`
- `notes`

Audit notes:

- This is an append-only event log of physical counts.
- It has no count session ID, count item ID, location split, or device/user metadata.
- `salesSinceCount` derives latest count per store/SKU from this table and compares it to current inventory.

### Reorders

Current headers:

- `timestamp`
- `store_id`
- `rep`
- `sku_id`
- `system_on_hand_units`
- `counted_units`
- `delta_units`
- `notes`

Observed rows contain a ninth value `OPEN` without a matching header.

Audit notes:

- This is the most immediate schema mismatch.
- `apiCreateReorder_()` appends `[timestamp, store_id, rep, sku_id, need, cases, "Below RP", notes, "OPEN"]`.
- The current header labels imply count fields, but the row values represent reorder need, case count, reason, notes, and status.
- Before building order/reorder management, this table should be migrated or replaced with explicit `Reorders` and `ReorderItems` fields.

## Planned Comprehensive System

From the planning conversation, the expanded app should add:

- Today
- Accounts
- Visits & Contacts
- Orders & Invoices
- Inventory
- Email Campaigns
- Reports
- Admin

The durable business model should include:

- Accounts
- Account aliases
- Contacts
- Activities
- Follow-ups
- Opportunities
- Products/SKUs
- Inventory levels
- Count sessions
- Count items
- Reorders
- Reorder items
- Orders
- Order items
- Invoices
- Invoice lines
- Payments received
- Badger remittances/checks
- Campaigns
- Campaign recipients
- Campaign messages
- Template versions
- Import batches
- Source records
- Import review queue
- Users
- Territories/routes
- Audit log

The post-sale workflow must remain connected end to end. A won sale should link
to the matching Badger invoice, delivery and store inventory. Counts and order
history should then produce a reviewable reorder signal and an employee should
be able to send a Zoho email asking whether the customer needs a new order.

## Source Systems To Preserve

These links are the authoritative migration sources supplied by the owner. They
must be referenced by immutable source ID in every import batch.

| Source | ID | Role in the new system |
| --- | --- | --- |
| [Distribution Directory and Leads](https://docs.google.com/spreadsheets/d/1DCUhEWLFgolgCdzU-inahM43tuNTzh7NfL5LJczjyeY/edit) | `1DCUhEWLFgolgCdzU-inahM43tuNTzh7NfL5LJczjyeY` | Accounts, contacts, prospect attributes, segmentation, suppression, Zoho campaign configuration and activity |
| [Badger Invoice Tracker](https://docs.google.com/spreadsheets/d/1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk/edit) | `1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk` | Existing PDF-parser output, invoices, invoice lines, location aliases, diagnostics and import errors |
| [Badger invoice PDF folder](https://drive.google.com/drive/folders/1ccOfQpk69SLyMYskD2srlNqHCGm1VBJ5) | `1ccOfQpk69SLyMYskD2srlNqHCGm1VBJ5` | Original invoice documents consumed by the existing parser |
| [Current inventory-app backend](https://docs.google.com/spreadsheets/d/1BO3u4N6_tEYHzOrPajckgUAcbQazL1fz9tTjVl_UNxs/edit) | `1BO3u4N6_tEYHzOrPajckgUAcbQazL1fz9tTjVl_UNxs` | Protected Stores, SKUs, Inventory, Counts and Reorders workflows |
| [Distribution Form responses](https://docs.google.com/spreadsheets/d/1C5R2oknS0BQpEZ9eR_-9dCYZ4TUGyimhVkOtkWAmHRo/edit) | `1C5R2oknS0BQpEZ9eR_-9dCYZ4TUGyimhVkOtkWAmHRo` | Historical visits, contacts, follow-ups and reported sales |
| [Old distribution spreadsheet](https://docs.google.com/spreadsheets/d/1KE2lRn0V3nKcFbkJBgxuKZ5UfxWjw3dsdwOiGAoDbh8/edit) | `1KE2lRn0V3nKcFbkJBgxuKZ5UfxWjw3dsdwOiGAoDbh8` | Historical prospects, contacts, rep notes and visit history |
| [Bar/Restaurant Visits](https://docs.google.com/spreadsheets/d/11QjFIukHtYVWRVvsxwj_Fv6jSyfSb_QeGaynmQW0Ahc/edit) | `11QjFIukHtYVWRVvsxwj_Fv6jSyfSb_QeGaynmQW0Ahc` | Historical visit activity, next steps and samples/materials left |
| [First-year customer data folder](https://drive.google.com/drive/folders/1ajtcD9mZugSzgzf63u-2kOIfYqr2TMAy) | `1ajtcD9mZugSzgzf63u-2kOIfYqr2TMAy` | Earlier customer sales reports used to establish account history |

### Distribution Directory and Leads

The main sheet currently has 34 columns and 493 prospects according to its
dashboard. It combines account identity, one contact, campaign queue state,
email status, suppression, fit score, geographic segmentation and summarized
sales history. These concerns should be separated during migration.

This workbook is an active sales workflow, not merely a source list. The new
app must preserve the complete loop: maintain the store directory, rank stores
by likelihood of a sale, select and queue outreach, send through Zoho, track
responses and outcomes, and schedule the next electronic or in-person action.
Moving these records into normalized tables must not remove the employee's
ability to perform that work from one screen.

The workbook also contains:

- `Campaign Settings`, including Zoho endpoints, TEST/LIVE mode and a maximum
  send count.
- `Email Editor`, which stores segment and reactivation copy.
- `Activity Log`, which stores send attempts and Zoho message IDs.
- `Historical Sales Data`, which records Badger-derived relationship summaries
  and account-name matching notes.
- `Apps Script Setup`, which contains the current Zoho mailer source in cell
  `A12` and confirms that current customers are blocked from cold outreach.

The campaign workbook therefore supplies both data and behavior. Its TEST-mode
default, current-customer suppression, opt-out handling, confidence checks and
explicit queue approval are required behaviors in the expanded app.

### Historical Visits and Distribution Data

Observed source shapes:

- Form responses contain 11 used fields covering place, contact, discussion,
  duration, follow-up, sale outcome, products and visit date.
- The old distribution workbook has separate main, out-of-area, Seth and
  Brianne sheets with inconsistent column order and date completeness.
- The visit workbook contains `Date`, `Place`, `Time`, `Description`,
  `Next Steps` and `Items Left`; blank dates continue the preceding dated route.

These sources must import as immutable source records first. Account matching,
contact extraction, sale interpretation and follow-up creation should happen in
a second, reviewable transformation step.

### Badger Invoice Parser and Tracker

The existing Apps Script parser is the required ingestion engine. The expanded
app must consume its output or call a thin adapter around it; it must not add a
second PDF parser.

The parser currently has no automatic trigger; historically, an operator has
run it manually from the Badger Invoice Tracker. The expanded system may add a
trigger around this same parser after its source and idempotency behavior are
reviewed in staging. Until then, files in the Drive folder are only parser
candidates until a run produces the expected output rows. A pending file is
not automatically a parser failure.

Observed parser output contract:

- `Invoices`: 17 columns including PDF ID/name, invoice number/date, customer,
  order information, amount due and legacy Delivered/Paid/Submitted values.
- `Invoice Lines`: invoice number, customer, quantity, volume, description,
  beverage class, unit price and line total.
- `Location_Directory`: invoice-name aliases and public location details.
- `Import Errors`: timestamp, file ID/name, processing stage, error and source
  text snippet.
- `Diagnostics`, `Monthly Summary` and `Previous Month`: derived reporting
  surfaces, not canonical transaction tables.

At audit time, `Invoices` and `Invoice Lines` were populated through `SS0157`
on 2026-09-09. The source folder also contained `0159-crimson-still-09-2026.pdf`,
so parser completion and folder presence cannot be treated as the same state.
Because execution is manual, this gap may simply mean the parser has not been
run since the newer PDF arrived.

The import-error queue includes ordinary Sturgeon invoices and older non-SS
invoice formats that do not match the parser's `SS####` expectation. Those rows
need classification as `unsupported document`, `non-Badger sale`, `supplier
invoice` or `true parse failure`; they should not all count as failed Badger
sales imports.

The bound parser source was not present in this repository, local Drive sync or
Drive search. The Sheets connector exposes the parser's data contract but not
bound Apps Script source. Browser inspection reached a Google sign-in screen,
so exact function-level source review remains an explicit pre-implementation
gate. No parser replacement was written.

## Key Model Decisions

### Store vs Account

The current app treats a store as the main entity. The expanded system needs `Accounts` as the main entity.

Recommended mapping:

- Existing `Stores.store_id` becomes or maps to `Accounts.account_id`.
- Keep `store_id` for inventory compatibility until migration is complete.
- Add account fields separately: relationship status, account type, fit score, address, territory, owner, source, do-not-contact flags.

### Relationship, Fit, and Priority

Keep these separate:

- Craft-spirit fit: stable manual judgment, 1-5.
- Relationship status: prospect, current, win-back, lapsed, closed, do-not-contact.
- Opportunity stage: qualified, attempted, conversation, sample/tasting, trial order, won, lost.
- Outreach priority: calculated from fit, relationship, distance, last touch, last order, follow-up due date, contact quality, and suppression rules.
- Queue/send approval: deliberate human action.

### Invoice Lifecycle

The invoice/payment model must reflect the clarified Badger workflow:

- Invoice created through Badger.
- Physical delivery occurs separately.
- Customer may pay Badger directly or pay Sturgeon.
- If Sturgeon receives payment, Sturgeon sends/remits a check to Badger.

Recommended event records:

- Delivery event
- Customer payment event
- Badger remittance event
- Reconciliation status

Do not treat unchecked legacy boxes as proof that something did not happen. Migrate them as unknown unless there is positive evidence.

## Major Gaps

1. No account/contact CRM model.
2. No activity timeline for calls, emails, visits, tastings, samples, or notes.
3. No follow-up task model.
4. No opportunity/pipeline model.
5. No order/invoice/payment/remittance model.
6. No import provenance or review queue.
7. No campaign entities inside the app.
8. No email event/activity attribution inside the app.
9. No role/user model.
10. No audit log.
11. No schema migrations.
12. No write locking.
13. Reorders sheet header mismatch.
14. Shelf/back location split is not retained in the count history.
15. The frontend is too monolithic for the planned breadth.

## Production Safety Recommendations

Before production code changes:

1. Create a staging branch.
2. Create or copy a staging backend sheet.
3. Add a schema/version tab to the staging backend.
4. Add migration helpers that create missing tabs/headers intentionally.
5. Keep the existing Inventory tab as a preserved module.
6. Build new navigation behind staging only.
7. Add regression checks for existing inventory actions.
8. Test with Netlify deploy previews before merging to `main`.

## Recommended Implementation Sequence

### Phase 1: Foundation Without Breaking Inventory

- Add a small schema manifest in code.
- Add staging-only creation for new normalized tabs.
- Fix the Reorders schema in staging.
- Add IDs to new records while preserving legacy `store_id`/`sku_id`.
- Add backend actions for `dashboardInit`, `accountList`, `accountDetail`, `logActivity`, and `upsertFollowUp`.
- Add frontend navigation shell with Inventory preserved as-is.

### Phase 2: Mobile Sales MVP

- Today screen for overdue follow-ups, assigned visits, likely reorders, and delivery/payment tasks.
- Accounts screen with search, filters, relationship status, fit, and priority.
- Account detail screen with contacts, timeline, purchases, open opportunity, and next action.
- Quick "Log a Touch" flow for calls, emails, visits, tastings, samples, outcomes, notes, and next action.

### Phase 3: Orders, Invoices, and Reconciliation

- Import Badger Invoice Tracker output.
- Reuse the existing PDF parser rather than rebuilding it.
- Add import batches and source records.
- Add invoice matching review.
- Add delivery/payment/remittance events.
- Add reconciliation dashboard.

### Phase 4: Email Campaigns

- Bring the campaign workbook concepts into the app.
- Keep TEST mode as the default.
- Store template versions.
- Record sent email as activities.
- Enforce suppression for current customers and opt-outs.
- Queue live sends only after explicit approval.

### Phase 5: Reporting and Admin

- Revenue by account/product/rep/period.
- Placement and reorder reporting.
- Activity-to-revenue attribution.
- Rep performance and unattended accounts.
- Import review and dedupe tools.
- Scoring and priority rules administration.

## Immediate Next Step

The isolated staging folder now contains verified copies of the inventory
backend and Badger Tracker. Inspect and version the copied bound parser source,
then create staging-only Apps Script and Netlify deployments. Build Phase 1
against those resources only. The first implementation should wrap the existing
inventory workflow in a broader app shell and add the normalized backend
tables/actions needed for Today, Accounts, and Visits.
