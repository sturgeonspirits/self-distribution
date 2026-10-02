# Production Cutover Runbook — Distribution Hub

Prepared: 2026-09-25
Goal: retire `https://sturgeon-staff-distribution.netlify.app/` and make `https://distribution-hub.netlify.app/` the single staff app.

## Precondition: the Hub inventory migration must stay inactive

This runbook depends on the Hub's inventory migration flag being **off**. `getSs_()` reads and writes inventory in `LEGACY_INVENTORY_SPREADSHEET_ID` only while `inventory_migration_status` is not `ACTIVE`. When the flag is `ACTIVE`, it uses the Hub workbook's own inventory tabs, and changing `LEGACY_INVENTORY_SPREADSHEET_ID` would have no effect.

Checked 2026-09-25: the Hub workbook's `Hub Configuration` tab has only its header row, and the Hub workbook has no `Stores`, `SKUs`, `Inventory`, `Counts` or `Reorders` tabs. So the flag is off and step 3 below works as written.

- [ ] On cutover day, confirm again that `Hub Configuration` has no `inventory_migration_status = ACTIVE` row.
- [ ] Do not run **Initialize hardened Hub** (`initializeHardenedHub`) before or during this cutover. If it has been run, stop; this runbook no longer applies and needs a reviewed backend-routing change first.

## Where the data lives today

| Data | Hub currently uses | Production source | Cutover action |
| --- | --- | --- | --- |
| Directory, outreach, campaigns, orders, applications | `1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo` (`Distribution Hub`) | Same workbook | Keep. |
| Inventory (Stores, SKUs, Inventory, Counts, Reorders) | Older attached copy `1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8` (`STAGING - Inventory Backend - 2026-09-15`), whose Counts history ends 2026-04-13 | `1XVe0ffTLWQ4QJ3ersJ4RTh_XFTXiGjd7vyv5UnQ0sOY` (`Distribution Hub - Inventory Backend`), which contains the same initial records plus 192 later count rows through 2026-09-16 | Point the Hub at the current workbook (step 3). Retain the older copy for rollback. |
| Badger invoices | `1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk` (`Distribution Hub - Badger Invoice Tracker`), fed from the central Drive invoice folder | Same workbook | Already live; do not change this ID. The Hub reads it directly. |

## Before cutover day

- [ ] Deploy the current Inventory API and Netlify versions from `PROJECT_STATUS.md`. Use the phone app for a few days of normal work.
- [ ] Sign in once with a non-admin staff account (for example an inventory-only user) and confirm it sees only its assigned workspace.
- [ ] Rotate the exposed Supabase service-role key named in `docs/badger-parser-audit-2026-09-15.md`, and update it wherever the production parser stores it.
- [ ] Make sure every person who uses the old app has a row in the Hub's Staff Access tab with the right areas (see `docs/staff-access-setup.md`).
- [ ] Back up: in Drive, make a dated copy of the production Inventory Backend and the production Badger Invoice Tracker.

## Cutover day (about 30 minutes)

1. **Freeze the old app.** Tell staff not to submit counts in `sturgeon-staff-distribution` from now on.
2. **Protect production headers.** Compare the header rows of production `Stores`, `SKUs`, `Inventory`, `Counts` and `Reorders` with the staging copy. If they differ (for example the `Reorders` layout), stop and resolve before step 3. The Hub may add missing columns, and the old app must not break if you need to roll back. Also add the **Out of Stock** checkbox column to the production `SKUs` tab, with the same ticks as the staging copy, so out-of-stock products stay blocked on the order page after cutover.
3. **Point the Hub at the current Inventory Backend.** After confirming the precondition above, change these in `apps-script/Code.gs`:
   - `LEGACY_INVENTORY_SPREADSHEET_ID` to `1XVe0ffTLWQ4QJ3ersJ4RTh_XFTXiGjd7vyv5UnQ0sOY` (`Distribution Hub - Inventory Backend`)
   - its comment to identify the current Inventory Backend

   Do **not** change `BADGER_TRACKER_SPREADSHEET_ID`: it already points to the live `Badger-invoice-Tracker`.

   Bump `APP_VERSION`, update `PROJECT_STATUS.md`, commit, paste the full `Code.gs`, and deploy a new version of the existing web-app deployment.
4. **Grant access.** The Inventory API script's account must be able to edit the production Inventory Backend and view the production Badger Tracker. Run any function once in the editor to approve new permissions if Google asks.
5. **Re-attach triggers and refresh caches.** Run `installHubReadCacheWarmer()` to re-establish the current tracker change trigger, then run `warmHubReadCaches()`.
6. **Verify, and write the results down:**
   - [ ] Inventory: each store's on-hand totals and the 2026-09-16 count dates match `Distribution Hub - Inventory Backend`.
   - [ ] One test count submitted in the Hub appears in production `Counts`. Delete that test row afterward.
   - [ ] Orders & Accounts shows invoices through the newest PDF in the central folder. The "Badger invoices to match" count is reasonable, with learned and location matches applied.
   - [ ] Outreach and Campaigns load normally.
7. **Retire the old URL.** In the old Netlify site, add a `_redirects` rule `/*  https://distribution-hub.netlify.app/:splat  301`, or replace its page with a link to the Hub. Keep the old site's code and deploy history for two weeks.

## Rollback (if verification fails)

1. Revert `LEGACY_INVENTORY_SPREADSHEET_ID` to `1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8` and redeploy the Inventory API. Do not change the live Badger tracker ID. This rollback works only while the migration flag is off, as required above.
2. Remove the old site's redirect so staff can use `sturgeon-staff-distribution` again.
3. If the Hub wrote anything incorrect to production inventory, restore the affected tabs from the step "Back up" copies.

## After cutover

- Update `PROJECT_STATUS.md`: production spreadsheet IDs, live versions, and the old URL marked retired.
- Point the Badger parser and invoice-folder instructions at production only; stop using the staging fixture folder.
- After two quiet weeks, delete the old Netlify site.
