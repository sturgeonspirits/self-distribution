# Hardened Google Sheets Architecture

Version: `2026.09.17.27`

Status: staging only. Production is not modified or deployed by this revision.

## Workbook Model

The system uses two spreadsheets, each with one clear responsibility:

1. **Staging Distribution Hub** (`1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo`) is the primary operational workbook. It owns the directory, outreach, applications, ordering access, orders, deliveries, inventory, counts, reorders, import history, audit history, and integration jobs.
2. **Staging Badger Invoice Tracker** (`10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ`) continues to own the proven PDF parser and its invoice output. Distribution Hub reads normalized invoice rows and does not duplicate or mutate the parser.

The prior staging Inventory Backend (`1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8`) is a read-only rollback source during migration. No additional spreadsheet file is created.

## Source Of Truth

- `Distribution Directory and Leads`: one account row per business.
- `Account ID`: permanent UUID identity used across every workflow. Sheet row numbers are display locations, not identities.
- `Customer Applications`: submitted application facts and staff approval state.
- `Account Programs`: newsletter and ordering access for an account.
- `Online Order Requests` and `Online Order Lines`: customer requests before confirmation.
- `Deliveries` and `Delivery Lines`: delivery events linked to an order and account.
- `Stores`, `SKUs`, `Inventory`, `Counts`, and `Reorders`: preserved inventory workflow.
- Badger `Invoices`: invoice truth supplied by the existing parser.

Delivery records do not directly reduce inventory. Physical counts remain the inventory truth, preserving the existing shelf-plus-back workflow.

## Write Safety

- Apps Script API-key validation remains mandatory.
- Sensitive staff actions also require the Netlify `STAFF_ACCESS_CODE`.
- Script locks serialize inventory, application, account, order, import, and reconciliation writes.
- Public submissions use a write-ahead `Submission Journal` before normalized rows are written.
- Submission tokens make application and order retries idempotent.
- `Hub Audit Log` is append-only and records staff/system changes.
- `Integration Jobs` records notification attempts and retry state.
- CSV imports have batch IDs, source hashes, row hashes, row outcomes, and duplicate checks. Imports never overwrite existing accounts.
- Customer activation upserts the directory account, ordering program, and optional inventory store by permanent IDs.
- Badger matching is repeatable and read-only against parser output.

## Migration Gate

`initializeHardenedHub` runs only after the exact confirmation `STAGING ONLY` and staff authentication. It:

1. Creates foundational tabs inside the existing staging Hub.
2. Copies the five inventory tabs from the prior staging Inventory Backend only when those tab names do not already exist.
3. Compares source and destination SHA-256 checksums.
4. Stops on any mismatch.
5. Marks `inventory_migration_status` as `ACTIVE` only after every checksum matches.

Until that final flag is active, inventory API calls continue reading and writing the prior staging Inventory Backend. The prior workbook remains unchanged for rollback.

## Reconciliation

The protected reconciliation action is safe to rerun. It links orders to available Badger invoice rows, creates or updates delivery records by order ID, and reports accounts or invoices that still need staff attention. It does not resend notification email and does not change physical inventory counts.

## Toast Boundary

The order catalog currently uses active rows from `SKUs`. Existing `Toast Item Map` values may identify future mappings, but availability remains `Not connected`. No Toast credential is stored and no stock promise is made. A future server-side, read-only adapter can replace the catalog source without changing the public order contract.

## Rollback

Before production cutover, retain exports of both staging workbooks and the prior Apps Script deployment. If staging verification fails, leave the migration flag inactive and continue using the prior Inventory Backend. Production cutover requires a separate approval, fresh backups, a quiet write window, and post-cutover count/order reconciliation.
