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
| Directory, outreach, campaigns, orders, applications | `1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo` (named "STAGING", but it already holds live outreach, including the 111-recipient campaign sent 2026-09-25) | Same workbook | Keep. Optionally rename it to drop "STAGING". |
| Inventory (Stores, SKUs, Inventory, Counts, Reorders) | Staging copy `1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8`, copied 2026-09-15 (last counts in it are April 2026) | `1BO3u4N6_tEYHzOrPajckgUAcbQazL1fz9tTjVl_UNxs`, which holds the 2026-09-17 count | Point the Hub at production (step 3). |
| Badger invoices | Staging copy `10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ` (parser reads a test fixture folder) | `1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk`, fed from the central Drive invoice folder | Point the Hub at production (step 3). The Hub only reads this workbook. |

## Before cutover day

- [ ] Deploy the current Inventory API and Netlify versions from `PROJECT_STATUS.md`. Use the phone app for a few days of normal work.
- [ ] Sign in once with a non-admin staff account (for example an inventory-only user) and confirm it sees only its assigned workspace.
- [ ] Rotate the exposed Supabase service-role key named in `docs/badger-parser-audit-2026-09-15.md`, and update it wherever the production parser stores it.
- [ ] Make sure every person who uses the old app has an entry in `STAFF_ROLES_JSON` with the right areas.
- [ ] Back up: in Drive, make a dated copy of the production Inventory Backend and the production Badger Invoice Tracker.

## Cutover day (about 30 minutes)

1. **Freeze the old app.** Tell staff not to submit counts in `sturgeon-staff-distribution` from now on.
2. **Protect production headers.** Compare the header rows of production `Stores`, `SKUs`, `Inventory`, `Counts` and `Reorders` with the staging copy. If they differ (for example the `Reorders` layout), stop and resolve before step 3. The Hub may add missing columns, and the old app must not break if you need to roll back.
3. **Point the Hub at production.** After confirming the precondition above, change these in `apps-script/Code.gs`:
   - `LEGACY_INVENTORY_SPREADSHEET_ID` to `1BO3u4N6_tEYHzOrPajckgUAcbQazL1fz9tTjVl_UNxs`
   - `BADGER_TRACKER_SPREADSHEET_ID` to `1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk`
   - their comments, from "staging" to "production"

   Bump `APP_VERSION`, update `PROJECT_STATUS.md`, commit, paste the full `Code.gs`, and deploy a new version of the existing web-app deployment.
4. **Grant access.** The Inventory API script's account must be able to edit the production Inventory Backend and view the production Badger Tracker. Run any function once in the editor to approve new permissions if Google asks.
5. **Re-attach triggers and refresh caches.** Run `installHubReadCacheWarmer()` so the change trigger watches the production Badger Tracker, not the staging copy. Then run `warmHubReadCaches()`.
6. **Verify, and write the results down:**
   - [ ] Inventory: each store's on-hand totals and the 2026-09-17 count dates match the production sheet.
   - [ ] One test count submitted in the Hub appears in production `Counts`. Delete that test row afterward.
   - [ ] Orders & Accounts shows invoices through the newest PDF in the central folder. The "Badger invoices to match" count is reasonable, with learned and location matches applied.
   - [ ] Outreach and Campaigns load normally.
7. **Retire the old URL.** In the old Netlify site, add a `_redirects` rule `/*  https://distribution-hub.netlify.app/:splat  301`, or replace its page with a link to the Hub. Keep the old site's code and deploy history for two weeks.

## Rollback (if verification fails)

1. Revert `LEGACY_INVENTORY_SPREADSHEET_ID` and `BADGER_TRACKER_SPREADSHEET_ID` to the staging IDs and redeploy the Inventory API. This works only while the migration flag is off, as required above.
2. Remove the old site's redirect so staff can use `sturgeon-staff-distribution` again.
3. If the Hub wrote anything incorrect to production inventory, restore the affected tabs from the step "Back up" copies.

## After cutover

- Update `PROJECT_STATUS.md`: production spreadsheet IDs, live versions, and the old URL marked retired.
- Point the Badger parser and invoice-folder instructions at production only; stop using the staging fixture folder.
- After two quiet weeks, delete the old Netlify site.
