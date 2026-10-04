# Sturgeon Distribution Hub — Project Status

Last updated: 2026-10-04

Read this file before inspecting the repository or changing the application. Update it whenever a deployment, version, service URL, known issue, or required setup step changes. Never put secret values in this file.

## Current state

| Component | Source version | Deployment state |
| --- | --- | --- |
| Netlify web app and staff proxy | `2026.10.03.18-WEB` on `codex/work`; `.17-WEB` (c7b1812) live on `codex/distribution-system-foundation` | `.17` (nurture outcomes + stage campaigns) went live 2026-10-03. `.18` adds the campaign Send-at scheduler controls and the two proxy actions; repo only until promoted. |
| Inventory API Apps Script | `2026.10.04.24-APP` on `codex/work`; `2026.10.04.20-APP` live | `.20` was deployed by Karl on 2026-10-04 (with `installOutreachCampaignScheduler()` and `installToastStockImport()` run, and the tracker's Current Prices tab deleted). `.21` fixes chat's 2026-10-04 review of `5f9675b`; `.22`–`.24` are Outreach Deploy B, pending review. After deploying `.21` or later, run `installHubReadCacheWarmer()` once so edits to the inventory workbook clear caches. |
| Distribution Outreach Apps Script | `2026.10.03.15-APP` in `docs/reference/distribution-outreach/Code.gs` on `codex/work` | Repo only for `.15`; no mailer deployment was made. The prior tracked `2026.09.24.14-APP` deployment remains unverified. |
| Public customer Netlify proxy | `2026.09.18.3-WEB` | Deployed with Netlify; unchanged by the latest staff-app UI work |

Current Git branch: `codex/work` (development). Netlify production builds `codex/distribution-system-foundation`; after Claude review, promote with `git push origin codex/work:codex/distribution-system-foundation` (fast-forward only). Never commit directly to the production branch, so the two cannot diverge again.

Current remote: `https://github.com/sturgeonspirits/self-distribution.git`

Current Badger checkpoint: Karl ran `testBadgerLogin()` successfully on 2026-09-30 (163 invoices). The `payment_reminders_enabled` Hub Configuration flag defaults off when absent; do not enable it before review completes. The Distribution Outreach mailer must be `2026.09.24.14-APP` or a reviewed later version before reminders are enabled.

Badger tracker safety answer (Karl, 2026-09-30): the PDF importer never writes the `Paid to Me` or `Submitted` columns. Direct, audited P/Q writes to the live tracker are therefore safe; no Hub override ledger is needed.

Phase 5 deployment state: staging Inventory API `2026.10.01.5` and Netlify `2026.10.01.8-WEB` are live. Next, run `seedCurrentPricesTab()` once in staging and review/activate the tracker prices with Claude before any Badger invoice creation. Never create a test invoice in Badger.

Latest completed changes:

- Outreach Deploy B — Cocktail list campaigns, Phase 4 (`2026.10.04.24-APP`, repo only, 2026-10-04): the existing review → freeze → approval-token → batch/scheduled-send campaign path now also supports **Cocktail list** campaigns for subscribed Newsletter Contacts. The appended Email Editor block supplies the subject, introduction, featured cocktail, distillery line, and reply-to-order line; the renderer adds the physical address and “Reply stop to unsubscribe,” never a tasting offer, sell sheet, or customer application link. A staff-recorded **Unsubscribed** outcome also marks the matching Newsletter Contact Unsubscribed. Newsletter status and Directory do-not-email are rechecked at send time. A seven-day cross-send cooldown blocks Cocktail list after sales outreach and sales outreach after Cocktail list. `repairHubStructure()` appends the editor rows, settings formulas, and campaign-recipient contact-ID column. **Deploy the Inventory API with Deploy B, then run `repairHubStructure()` once; Claude must fill/review the appended Cocktail list template cells. The existing Distribution Outreach mailer is unchanged because this phase uses its existing `sendAppEmail` action, but it must be deployed with Deploy B.** Tests: `node --test tests/security-workflow.test.mjs`.

- Outreach Deploy B — Phase 3 review hardening (`2026.10.04.23-APP`, repo only, 2026-10-04): direct tests now cover the monthly tasting gate’s 12-month cutoff, void/ignored invoices, explicit-link precedence, ambiguous names, and conflicting order references. If any Badger lookup reader fails, the gate logs one warning, memoizes the failure, and suppresses tasting offers for every recipient for that execution rather than risking an offer to a recent customer. No sheet changes. Tests: `node --test tests/security-workflow.test.mjs`.

- Outreach Deploy B — monthly content and tasting gate, Phase 3 (`2026.10.04.22-APP`, repo only, 2026-10-04): `repairHubStructure()` appends the shared **MONTHLY CONTENT** section to the existing Email Editor and five linked keys to the existing Campaign Settings tab; it never moves existing template cells. Templates can render HTML-escaped `{{Month}}`, `{{Featured Cocktail}}`, `{{Second Cocktail}}`, `{{Tasting Offer}}`, and `{{Cocktail List Offer}}`. Tasting Offer is blank unless the recipient is a Prospect with no matched, non-void Badger invoice in the previous 12 months, and is always blank for Reactivation. The matcher follows the existing Badger precedence (explicit invoice link, order link, learned alias, location name, then unique business name). The reviewed campaign snapshot retains the rendered HTML, so freeze and send use the same offer. Paragraph 3 template copy intentionally remains untouched for Claude's sheet review. **After review and Apps Script deployment, Karl must run `repairHubStructure()` once, enter the month and approved content in the appended cells, then have Claude revise the specified Paragraph 3 cells. Do not start Phase 4 before Claude reviews this commit.** Tests: `node --test tests/security-workflow.test.mjs`.

- Wholesale catalog review fixes (`2026.10.04.21-APP`, repo only, 2026-10-04, written by Claude from chat's review of `5f9675b`): Badger invoice preview and create always read SKUs, Price Tiers and Customer Prices fresh (`badgerCurrentPrices_(true)`), so a fixed price or proof is used at once and a change between preview and create fails the fingerprint check. `installHubReadCacheWarmer()` also installs a change trigger on the inventory workbook (`getSs_()`). Duplicate Price Tiers rows with different prices drop that tier (its products can't be invoiced until fixed); duplicate active Customer Prices rows for one SKU and account with different prices give that account a zero price, which blocks the invoice instead of picking a row or falling back to the tier. `checkWholesaleCatalog()` reports `tier_conflicts` and `customer_price_conflicts`, and lists active products with no Toast item under `not_stock_tracked` (information; bitters are Toast modifiers) instead of as a problem. The Toast import clears `toast_stock` and `toast_stock_date` for a mapped SKU missing from the newest report, so the order page shows "Staff will confirm availability" rather than an old "In stock". Sheet data: proof is still blank on every active bottle SKU, so bottles can't be invoiced until Karl enters proofs (gift boxes 60, bitters 180 are set).
- Wholesale catalog, prices and stock on SKUs (`2026.10.04.20-APP`, repo only, 2026-10-04, written by Claude; Karl to review the design before pushing). One product list: the inventory workbook's `SKUs` tab (today `Distribution Hub - Inventory Backend`). Columns added: `price_tier`, `wholesale_price` (optional override), `proof` (required for Badger invoice lines), `toast_stock`, `toast_stock_date`, `toast_item_name` (the exact Toast item name used to match stock). Tier amounts live on the new `Price Tiers` tab (one row per tier; the SKUs `price_tier` dropdown lists them). Account-specific deals go on the new `Customer Prices` tab (`sku_id`, `account_id`, `price`, `active`, `notes`). `badgerCurrentPrices_` builds prices from these (`wholesalePriceRows_`: active SKUs only; override beats tier; customer rows need an active SKU and an account). `apiListSkus_` shows Out of stock when `toast_stock` is 0 and In stock above 0 (counts are never sent to the public page); the Out of Stock checkbox still forces it out. Toast stock import: save the Toast 86 Report CSV (Reports > Menus > 86 Report, threshold 9999) into Drive folder `Toast 86 Reports` (`1kwjhWWg4KONWlcl-FmQ8oXeR9De6e5d_`); `importLatestToastStockReport()` (hourly after `installToastStockImport()`) reads the newest unread CSV and updates `toast_stock`/`toast_stock_date` by `toast_item_name`, logging SKUs missing from the report and Toast bottles (750 ml, 375 ml, Box Sets groups) with no SKU to the Hub Audit Log. `checkWholesaleCatalog()` lists active products with no price, no proof, no Toast item, or a tier missing from Price Tiers. Verified against the real 10/4 report: 129 of 130 mapped SKUs match exactly; one duplicate Toast item ("Jalapeno Cucmber Oshgave 750mL") is reported. The Current Prices tab and `seedCurrentPricesTab()` are retired; delete the unused `Current Prices` tab in the Badger Invoice Tracker after deploying. Sheet data (Claude, 2026-10-04): 103 bottle SKUs plus 13 gift-box SKUs (`5 x 100ml`, tier Gift Box) appended inactive; Price Tiers (Karl, 2026-10-04): Standard $22, Premium $30, Squadron $40 (Spitfire Gin, Mustang Moonshine, Hellcat Rum, Flying Fortress Bourbon), 375 mL $12, Gift Box $35. Bitters are cocktail modifiers, not wholesale products (no tier). Gift boxes invoice on Badger as one 375 mL, 60-proof line until Karl confirms the right size with Badger: SKUs column `invoice_volume` (optional; defaults to `size`) is `375ml` for boxes and `proof` is 60. Changing it later is a sheet edit only (a size missing from `badgerVolumeUnitOfMeasureId_`, such as 500 mL, would also need that one map entry; `checkWholesaleCatalog()` reports it as `no_invoice_unit`). Old Fashioned, Espresso Martini and Decaf Espresso Martini boxes stay inactive (not in distribution yet). Karl is entering ABV/proof for bottles. Also fixes the PROJECT_STATUS version test so it follows `Code.gs`. Setup after deploying: `installOutreachCampaignScheduler()` and `installToastStockImport()`. Tests: 62 passing.

- Scheduled campaign sends (`2026.10.03.19-APP` Inventory API, `2026.10.03.18-WEB`, repo only, 2026-10-04, written by Claude while chat was out of tokens): an **Approved** campaign's review dialog has a **Send at** date/time, **Schedule send** / **Change schedule** / **Reschedule**, and **Cancel schedule**. New staff-proxy actions `scheduleOutreachCampaign` (requires the current approval token; send time 1 minute to 30 days ahead; refuses while the schedule is already sending) and `cancelOutreachCampaignSchedule` (outreach area). Campaign tab columns appended: `Scheduled Send At`, `Scheduled By`, `Schedule Status` (Scheduled, Sending, Paused, Done, Cancelled), `Schedule Detail`. A five-minute time trigger, `runScheduledOutreachCampaigns`, picks up due Approved campaigns and sends through `apiSendOutreachCampaignBatch_` in locked batches of 5 with a 4-minute run budget (`deadline_at` stops a batch before starting a recipient past the budget), so every manual-send guard still applies per recipient. A recipient blocked before the mailer is called (reply, opt-out, stage change, due date) is skipped and the run continues; a block after a mailer attempt (`mailer_attempted:true`) or any other error pauses the schedule with the reason. A busy lock leaves it Sending for the next run. Approval clears any schedule; reopening cancels an active one; finishing the last recipient (manually or scheduled) marks the schedule Done. The campaign list shows a Scheduled / Sending / Paused badge. **Setup after deploying the Inventory API: run `installOutreachCampaignScheduler()` once in the Apps Script editor and approve the trigger permission.** Then promote the web app. Tests: `node --test tests/security-workflow.test.mjs` (60 passing). **Awaiting chat review; no deployment was made.**

- Outreach Deploy A review corrections (`2026.10.03.18-APP` Inventory API; `2026.10.03.15-APP` Distribution Outreach mailer; repo only, 2026-10-03): `repairHubStructure()` now repairs strict Directory dropdown validation through the sheet's existing rows for every supported Next Email, Status, and Outcome value; run it once immediately after deploying the Inventory API and before any outreach send. Follow-up 1/2 require a populated due date no later than today at preview, freeze, and send. Campaign rebuild and timeout reconciliation use the frozen Criteria stage instead of `Initial`, and rebuild skips a recipient whose live stage changed. Nurture check-ins keep a 60-day duplicate-send cooldown in both Apps Script projects, permitting the planned 90-day cadence while retaining fail-closed protection for missing timestamps. Tests: `node --test tests/security-workflow.test.mjs` (59 passing). **No deployment was made.**

- Outreach nurture lifecycle and stage campaigns (`2026.10.03.17-WEB`; Inventory API `2026.10.03.18-APP` supersedes the original `.17-APP` source; repo only, 2026-10-03): Phase 1 adds **Wants cocktail list** (Directory status `Nurture`) and **Tasting visit** (status `Interested`) outcomes. A cocktail-list reply logs the normal Activity Log outcome and upserts one Newsletter Contacts record by email with `Subscribed`, the account's Customer/Prospect relationship, the reply consent source/date, `Monthly cocktail ideas`, Account ID, and source row; it cannot receive Follow-up 1/2, Reactivation, or Nurture check-ins. After Follow-up 2, Directory stage becomes `Nurture check-in`, status becomes `Nurture`, and its due date uses Campaign Settings `Nurture check-in days` (90 if unset). Phase 2 adds Initial, Follow-up 1 due, Follow-up 2 due, and Nurture check-in due choices to the campaign builder, plus an optional original-campaign filter. The frozen Criteria JSON, campaign card, recipient snapshot, audience checksum, and live send check retain the stage. Preview, freeze, and send all enforce stage eligibility; a newly logged reply blocks a frozen recipient at send time. No spreadsheet tabs were added. Tests: `node --test tests/security-workflow.test.mjs` (58 passing before the review corrections). **Await Claude review before proceeding to Phase 3.**

- Inventory Summary (`2026.10.03.16-WEB`, repo only, 2026-10-03): every signed-in staff member whose Staff Access row has Inventory checked can open Inventory → **Inventory Summary**. It is read-only and uses the existing `managerGrid` inventory-staff API read—no new permissions, Netlify variables, spreadsheet tabs, or Apps Script deployment. It excludes products with zero stock at every location. The top per-store list keeps count locations in the left column and displays only products actually stocked there; the searchable product-total table follows it. Requires a normal Netlify web deployment to become visible.

- Badger invoice parser `2026.10.03.1` (repo, 2026-10-03): adds a daily automatic import at about 5:45 am Central (production only), switched on/off from the Sturgeon Invoice Parser menu; Parser Status shows whether it is on. Install: paste `docs/reference/badger-parser/Code.gs` over `Invoice Parser.gs` in the live tracker (and staging), reload, then **Turn On Daily Automatic Import** once and approve the new trigger permission. Tests: 17 pass.

- Badger invoice parser `2026.10.02.1` **live since 2026-10-03** (`docs/reference/badger-parser/Code.gs`). Installed in both trackers. Staging fixture test passed (2 imported, 1 review, 1 duplicate). First live import: 0 imported, 161 already done, 1 duplicate PDF, which exposed that SS0154 had been imported in August from the branding test copy (`0154-wagner-08-2026-branded.pdf`) by the old subfolder-scanning parser; the row and its lines were deleted and re-imported from the real Badger PDF on 2026-10-03 (3 lines), with Delivered/Paid/Submitted restored by Karl, 4 non-PDF files reported. Legacy cleanup removed 174 old Script Properties (`processed_pdf_`, `ocr_count_`, Supabase); 0 markers needed migrating because every file was already in `Invoices`. `supakeys.gs` deleted 2026-10-03; the tracker's Apps Script project now holds only `Invoice Parser.gs` and `appsscript.json`. One file for both trackers: in the live tracker it reads the top level of the Badger `Invoices` folder and writes the real tabs; in the staging tracker it reads the fixture folder and writes `TEST -` tabs; anywhere else it stops. Supabase map sync and credentials removed (the Hub does not use Supabase; the old key pointed at a project that no longer exists). Saves lines, then the invoice row, then `Parser State`, so an interrupted run never loses an invoice or doubles its lines. Non-invoice PDFs are marked `REVIEW` once instead of re-logged every run; non-PDF files (such as a saved `.html` page) and subfolders are reported in the import toast. Production stops on a changed header instead of rewriting it, and checkboxes/validation apply only to new rows. `One-time: Move Old Parser Settings` replaces the hundreds of `processed_pdf_`/`ocr_count_` Script Properties with `Parser State` rows and removes `SUPABASE_URL`/`SUPABASE_KEY`. No pop-up dialogs. Tests: `node tests/badger-parser.test.cjs` (14 pass).

- Removed "Initialize staging Hub" (`.13-WEB`, not yet deployed). The admin button under Orders & Accounts > System status ran `initializeHardenedHub`, which copies the inventory tabs into the Hub workbook and sets `inventory_migration_status = ACTIVE`; after that the live API would read and write those copies and `Distribution Hub - Inventory Backend` would silently go stale. Its confirm dialog wrongly said it did not modify production, and the browser supplied the `STAGING ONLY` confirmation itself. The button, its handler and the proxy route are gone; the proxy now answers `400 UNKNOWN_ACTION`. The Apps Script handler remains but is unreachable without the API key. No Apps Script redeploy is needed. Test added: "the Hub migration action is not proxied and has no button" (55/55 pass).

- Badger invoice folder cleanup (2026-10-02). Seven non-SS PDFs (Discover Oshkosh ×2, Nicolet Bank, Potawatomi, Cujak's wine night, Parm pairing, 2024 Sunken Paddle statement) moved from the Badger `Invoices` folder to the sibling Drive folder `Non-Badger Invoices` (`1Rk7GlynqdkhsKHQ6Les7V3WbRSMU6BDC`). The live parser re-read and re-logged them on every run. The `Branded` and `sturgeon_invoice_utility_PRINT` subfolders were moved to the sibling folder `Invoice Branding Project` (`16giq58JsvSLIi-g3ALP2OKLxvHCtct4u`), because the parser scans subfolders. Keep anything that is not a Badger SS invoice PDF out of the Badger `Invoices` folder and all of its subfolders.

- Staff access from the Hub (`.12-WEB`, not yet deployed). Zoho stays the login. Roles and work areas come only from the **Staff Access** tab of the Hub spreadsheet (`1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo`); no staff email, role, or area is read from a Netlify environment variable. `netlify/lib/staff-roster.js` reads the tab through the Google Sheets API (`values.get`, drive.readonly scope) with the relay service account and caches a successful read for two minutes per function instance. Email, Role, and Active headers are required; blank roles and inactive rows are denied. Once a cache expires, an unavailable or invalid roster returns retryable `503 STAFF_ROSTER_UNAVAILABLE` without clearing the browser's Zoho session; an email absent from a readable roster still receives `401 STAFF_AUTH_REQUIRED`. **Do not promote this release until the Staff Access tab is populated with an active admin, the Hub is shared Viewer with the relay service account, the Google Sheets API is enabled, `STAFF_ROSTER_SHEET_ID` is set, and both an admin and a staff account pass staging sign-in.** Rollback after a failed promotion: restore `.8-WEB` by returning foundation to `be8752c` (see `docs/staff-access-setup.md`). No Apps Script change: the Inventory API stays `2026.10.01.5`.

- First Inventory load after sign-in (`.49-WEB`). The Inventory tab often stayed blank after sign-in while Outreach and Orders loaded, and needed a second click. Cause: the Inventory workspace stays hidden until both startup requests finish (store list, then the store's lines, one after the other), and during that time the screen showed only the sign-in panel, whose "Loading stores…" line is inside the hidden workspace. If either request failed, the error went to the Orders & Accounts status line (`handleCustomerError`), so Inventory stayed blank until the tab was clicked again, which re-ran the load. Now `startInventory()` shows "Loading inventory…" on the Inventory screen, loads the remembered store at the same time as the store list, retries once after 1.5 s, runs one load at a time, and on failure shows the error with a Try again button on the Inventory screen. Sign-in errors still go through `handleCustomerError`.

- Drive response relay (`netlify/lib/drive-relay.js`, `relayedOutput_` in Code.gs). Executions and Netlify logs on 2026-09-25 showed Apps Script finishing reads and writes in 1–11 s, while Google's web-app response handoff still stalled past 25 s or returned an HTML 404 (including Approve). Compression and read retry did not fix it. Now the staff proxy sends each request once with a `relay_id`. Apps Script also writes the response text into one of 32 fixed Drive slot files (the slot is chosen by a hash that is identical on both sides and tested). The proxy reads the slot through the Drive API with a read-only service account, polling from 0.9 s, and returns whichever valid JSON arrives first (deadline 23.5 s). HTML error pages never win. Setup: `docs/drive-relay-setup.md`. Netlify variables: `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `RELAY_MANIFEST_FILE_ID`. Script Property `RELAY_SLOT_IDS` is written by `setupDriveRelay()`.

- Busy feedback: `staffApiGet`/`staffApiPost` run through `withApiBusy`, which shows a thin progress bar at the top of the page while any request is in flight. It also dims and disables the button pressed within the previous 1.5 s until its request finishes, so slow responses never look like missed clicks or invite double presses. The Campaigns tab shows "Loading campaigns…" while its list loads.

- Outreach load failures diagnosed 2026-09-25. The Apps Script profiler showed every screen builds in 1.2–6.1 s (Outreach 4.6 s, Orders & Accounts 6.1 s), and every tab read costs about 0.4–1 s regardless of size. Netlify logs showed `outreachDashboard` failing with a 500 after 25.1 s while the matching Apps Script `doGet` completed in 1.6–2.0 s: the 647 KB response stalled in Google's web-app response handoff. Fix: read responses over 50 KB are sent gzip+base64 (`compressedJson_`, requested by the staff proxy with `gz=1`) and unpacked in `netlify/functions/inventory.js`; read-only GETs get two 11.5 s attempts instead of one 24–25 s attempt; refresh-failure messages now include the real error. The cache warmer and change triggers were deleted by the owner the same day. The profiler lives in the owner's editor as a separate `Profiler.gs` file and is not in the repo.

- Campaign timeouts on a ~700-row Directory. `campaignRecipientRows_` read each recipient row separately (100+ sheet reads per campaign open); it now reads the recipients' row block once. `warmHubReadCaches` rebuilt all three read caches in one run (30+ seconds), which competed with campaign preview and freeze; it now rebuilds at most one missing cache per run. In the browser, when Confirm and freeze hits the connection limit, the app checks the campaign list every 20 seconds for up to five minutes for the new campaign and opens it. It never re-sends the create. If the freeze succeeds but loading it back is slow, the message now says the campaign was created.

- Out-of-stock switch for online ordering: add a column named `Out of Stock` to the `SKUs` tab and use Insert → Checkbox on it. `listSkus` returns `out_of_stock` and `availability_status: "Out of stock"` for ticked products, and `order.html` (`2026.09.25.1`) lists them but disables them. Unticked products stay orderable with staff-confirmed availability. The code never adds the column itself, so production sheets change only by hand (see the cutover runbook, step 2).

- Review corrections, ready to deploy: a Badger invoice marked Ignored can no longer reappear on an account through an order reference. Conflicting Badger `Location_Directory` mappings stay in matching review. CSV part failures distinguish a confirmed server error from an unconfirmed timeout. Learned aliases now match an exact customer name first and use the loose name key only when it points to one account (labelled "Learned customer name (similar spelling)"). Every staff link is learned, so correcting a loose-name collision teaches the right account instead of being refused. The cutover runbook is usable again: its step 3 depends on `inventory_migration_status` not being `ACTIVE`, which was verified on 2026-09-25 (the `Hub Configuration` tab has only its header row). Do not run `initializeHardenedHub` before cutover.

- CSV business import is split into parts in the browser: 20 businesses per `importOutreachBusinesses` request, sent one after another with progress shown. Even with batched writes, a full 100+ row file could still exceed the ~25-second proxy limit on the large Directory sheet. Each part is duplicate-checked and logged as its own Import Batch ("file.csv (part 2 of 6)"). If a part stops, the message shows what finished and that re-running is safe.

- Refresh timeouts: the Orders & Accounts, Outreach and Inventory store-list Refresh buttons now rebuild through `cachedReadPayload_` with bypass, so the fresh result is saved even if the ~25-second proxy limit is hit. The next normal page load shows it, and the timeout message tells staff to reload in a minute instead of clicking Refresh again. Production cutover steps are in `docs/production-cutover-runbook-2026-09-25.md`.

- Faster business CSV import: `importOutreachBusinesses` collects new Directory rows and Import Rows log entries in memory and writes each sheet once, instead of two `appendRow` calls per business that pushed imports of a few dozen rows past the ~25-second proxy limit. If the Directory batch is rejected (for example by data validation), it falls back to row-by-row and records each failure in Import Rows. Duplicate checks are unchanged, so re-running a timed-out import is safe.

- Learning Badger invoice matching: linking an invoice in Orders & Accounts also saves its Badger customer name → Account ID in the Hub tab `Badger Customer Aliases`, so later invoices for the same customer match automatically ("Learned customer name"); ignoring an invoice never saves an alias. The Badger Tracker `Location_Directory` tab (Invoice Name → Public Name) is also used ("Badger location name"), cached with the invoice cache. Name comparisons ignore case, punctuation, spacing, a leading "The", and trailing LLC/Inc./Co./Corp. Match order: manual invoice link → order link → learned customer name → Badger location name → business name; anything matching more than one account stays in review.

- Account ID repair fix: `repairHubStructure()` and the nightly repair no longer rewrite entire tabs. The Directory write touches only Account ID and Record Created At; related tabs (Drafts, Programs, Email Engagement, Activity Log, Customer Applications, Online Order Requests, Newsletter Contacts) touch only their Account ID column. A pre-existing out-of-list value (for example in Email Engagement's validated Event Type column) no longer stops the repair, and a tab that still fails is reported in the result while the others finish.

- Account-level Badger invoice ledger: Orders & Accounts attaches Badger Tracker invoices to the existing permanent Directory Account ID even if no inventory store is tracked. Match precedence is an explicit manual link, then one existing order link, then one unique exact business-name match. Conflicting or unmatched invoices stay in a staff review card; staff can explicitly link, ignore, or restore an invoice without changing the Badger Tracker source. On first account-box focus, the app loads a compact server-cached account index once; every subsequent business/city/Account ID match is browser-only. After deploying the Apps Script source, run `repairHubStructure()` once to create the `Badger Invoice Links` tab.

- Read-cache safety fixes: Hub cache entries now expire after 15 minutes in 45 KB chunks; the cache-warmer installer also creates change triggers for the Outreach and Badger spreadsheets; editor-run maintenance functions and every API write attempt invalidate the version; and the three screen Refresh buttons request a forced current read. After this Apps Script source is deployed, run `installHubReadCacheWarmer()` once to install or replace the triggers.

- Review fixes: an external email logged without an outcome now marks the business Sent and schedules the configured first follow-up; the explicit structure repair normalizes any legacy Priority `Medium` value to `Normal` in one batched column write; and bulk campaign exclusion touches only selected recipients’ Status and Result Detail cells.

- Core staff reads are cache-first: the Outreach slim dashboard, Orders work queue, and Inventory store list use a 15-minute, chunked CacheService payload keyed by a write-bumped version counter. A manual `installHubReadCacheWarmer()` function installs the 10-minute daytime (7am–9pm) warmer and spreadsheet-change invalidation triggers. The browser stores the most recent per-staff, per-release payload for Outreach, Campaigns, Orders, stores, and selected inventory lines, renders it immediately, and refreshes it in the background without replacing good cached data with an error.

- Campaign review now supports client-side search across business, city, ZIP, email, contact, and segment; status/area chips; sorting; and a one-lock, batched exclusion action for selected review-ready recipients. The selected campaign view is retained when that same campaign reloads.

- Email Engagement structure repair now adds Account ID, Target, and Stage. Link clicks write the directory identity, target label, stage, source, confidence, and app version; a new administrator-only backfill completes legacy blank identities. Repeated clicks inside five seconds are ignored, and a click within 60 seconds of a sent email is marked Possible link scanner.

- Outreach cards and Business details can log in-person, phone, external-email, event, or other contact. Contact logs write to the Activity Log and append dated Notes; an external email advances an Initial prospect to Follow-up 1 without inventing a Zoho message ID. Business timelines include app mail, contacts/outcomes, and tracked link clicks.

- Directory Priority is now explicitly High, Normal, or Low in Add business and Business details. Imports map legacy Medium to Normal; unsupported priority values are rejected before a sheet write.

- Campaign preview now filters recipient addresses already used by a non-test Initial send or another directory row with Last Emailed. Campaign freeze repeats full eligibility after rendering records, memoizes the one Pilot Review read, and reports any preview-to-freeze duplicate removal. Send time repeats the address check with targeted lookups.

- Campaign exclusions now use an in-card reason form with quick picks, and the API refuses to change any recipient already marked Sent or Sent - needs recording. Preview uses only directory fields and defers rendered email construction until a campaign is frozen. County and Segment criteria are populated from directory values; City remains free text.

- Campaign dialog validation and errors now render in its local status area rather than behind the modal. Its acknowledgement remains checked through a same-campaign Review refresh, and resets only for a different campaign or when the campaign no longer has Review status.

- Campaign review now places the unsegmented-recipient confirmation immediately before Approve, requires it before approval, and keeps the campaign status directly above the bottom actions.

- Campaign review now fills an empty legacy recipient City from the directory by Account ID or source row with one directory data read per campaign load. Legacy rows without frozen campaign distance omit the mileage label; Send remaining identifies the business and city currently being sent.

- Campaign delivery is optimized for one recipient at a time: it reads only that directory row, performs a targeted idempotency lookup, and uses frozen campaign HTML. The browser reconciles a timeout/unknown outcome for that exact recipient and continues only when it is confirmed Sent; it never retries a send.

- New campaign creation is preview-first: choose the distillery, any ZIP, or an exact ZIP-Centroids city as the center; set radius and minimum fit; optionally filter City, County, Segment, and Wave; optionally cap recipients; then explicitly confirm before a snapshot is created. New criteria are stored as JSON in `Outreach Campaigns`; the Audience text is display-only. Campaign send-time checks use the stored JSON and distinguish distance, fit, and other criteria changes. Pre-criteria campaigns remain ungated by this new rule.

- Netlify web release `2026.09.24.18-WEB` is deployed. It removes proxy retries for POST/write requests, uses a 9-second upstream timeout, applies known Outreach changes locally after a successful save, and reloads the list only in the background.
- Campaigns can freeze every currently eligible initial prospect into a persistent, reviewable recipient/message snapshot; creation and approval never send mail.
- Approved campaigns expose every rendered email, require explicit acknowledgement for unsegmented prospects, and deliver only a manually confirmed batch of up to 10—stopping at the first blocked record and retaining per-recipient receipts.
- Prospect cards show the actual email and phone, or explicit `No email` and `No phone` warnings.
- The email-review window warns when an account has no email and disables real sending while leaving Karl-only testing available.
- Karl-only test sends may use a saved draft even when the prospect email is missing or unverified.
- The browser requires a verified Zoho message ID before showing send success.
- Orders & Accounts and Outreach reads were shortened to reduce Google Sheets timeouts.
- Campaign creation and review use one 24-second proxy attempt rather than short retries, so a delayed create cannot make duplicate recipient lists; a timeout instructs the user to refresh Campaigns before retrying.
- Campaign review now supports a saved per-recipient subject/body edit before approval; the sendable HTML is regenerated with the standard footer and every edit is audited.
- Campaign review now supports per-recipient campaign-only exclusion/restoration with a required reason. Excluded recipients remain excluded through approval and are never passed to a delivery batch; this does not set a global Do Not Email flag.

## Direct links

### Application

- Staff app: https://distribution-hub.netlify.app/
- Customer signup: https://distribution-hub.netlify.app/customer-signup.html
- Customer order request: https://distribution-hub.netlify.app/order.html
- Netlify project: https://app.netlify.com/projects/distribution-hub/overview
- GitHub review branch: https://github.com/sturgeonspirits/self-distribution/tree/codex/work

### Apps Script projects

- Inventory API editor: https://script.google.com/u/0/home/projects/1mUm3iOIJYpXkd36PsTqvi7uBGlPL7NokZwJLgdtZ3oSJTdCAuN3l9p-b/edit
- Distribution Outreach editor: https://script.google.com/u/0/home/projects/1T7vAcnmNjZsI8Ym9udfbsi4DDuoDB82SNeoQmjtKTiR0PHer6g_XuFan/edit

### Staging spreadsheets

- Distribution Directory and Leads: https://docs.google.com/spreadsheets/d/1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo/edit
- Inventory Backend rollback source: https://docs.google.com/spreadsheets/d/1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8/edit
- Badger Invoice Tracker: https://docs.google.com/spreadsheets/d/10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ/edit

## Authoritative source files

| Area | File |
| --- | --- |
| Staff web app | `index.html` |
| Customer signup | `customer-signup.html` |
| Customer order request | `order.html` |
| Staff Netlify proxy | `netlify/functions/inventory.js` |
| Public Netlify proxy | `netlify/functions/customer.js` |
| Inventory API Apps Script | `apps-script/Code.gs` |
| Distribution Outreach Apps Script | `docs/reference/distribution-outreach/Code.gs` |
| Regression tests | `tests/security-workflow.test.mjs` |
| Netlify routes | `netlify.toml` |

Do not use `index-old.html` as current source. Do not modify or delete `_karl-edit/` or other untracked owner files unless the owner explicitly requests it.

`README.md` and the version comment in `netlify.toml` contain older version labels. Use this file and the version constants inside the deployable source files as the current version authority until those older labels are reconciled.

## System boundaries

```text
Browser
  -> Netlify /api/inventory
  -> Inventory API Apps Script
  -> staging Google Sheets
  -> Distribution Outreach Apps Script for email only
  -> Zoho Mail API
```

- Netlify owns the browser UI, Zoho staff-login boundary, request timeouts, and proxy behavior.
- Inventory API owns spreadsheet reads/writes, saved drafts, eligibility, activity, accounts, orders, inventory, and audit records.
- Distribution Outreach owns Zoho credentials, final email validation, Karl-only test delivery, real delivery, idempotency receipts, and Activity Log send results.
- `Pilot Review` is a read-only legacy archive and duplicate-send source. Do not restore sending from that tab.
- The deployed system still sends one recipient at a time. The un-deployed campaign source adds a review-first batch controller that invokes the mailer sequentially, caps each run at 10, and stops at the first anomaly.
- Never report an email as sent unless Zoho returned a nonblank message ID and the Activity Log/Zoho state supports the result.

## Configuration names

Record names only—never record their values here.

### Netlify environment variables

- `APPS_SCRIPT_URL`
- `API_KEY`
- `ZOHO_OIDC_CLIENT_ID`
- `ZOHO_OIDC_CLIENT_SECRET`
- `ZOHO_OIDC_REDIRECT_URI`
- `ZOHO_OIDC_ISSUER` (use `https://accounts.zoho.com` unless the organization uses another Zoho data center)
- `APP_SESSION_SECRET` (a new random secret, at least 32 characters)
- `STAFF_ROSTER_SHEET_ID` (the Hub spreadsheet ID; Hub shared Viewer with the relay service account; Google Sheets API enabled in its Cloud project)
- `TRACKING_LINK_SECRET`
- `SELL_SHEET_URL`

### Inventory API Script Properties

- `API_KEY`
- `OUTREACH_MAILER_URL`
- `OUTREACH_MAILER_SHARED_SECRET`
- `TRACKING_LINK_SECRET`

### Distribution Outreach Script Properties

- `OUTREACH_MAILER_SHARED_SECRET`
- `OUTREACH_APP_SENDS_ENABLED`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`
- `TRACKING_LINK_SECRET`

The shared outreach secret must match in the two Apps Script projects. Zoho mail properties belong only in Distribution Outreach. Zoho OIDC client credentials and the staff-role map belong only in Netlify; they are not the API key or outreach secret.

### Tracked outreach-link setup

1. Add `TRACKING_LINK_SECRET` to Netlify and to both Apps Script projects. Use the same secret in all three places; do not record its value here.
2. Add `SELL_SHEET_URL` to Netlify.
3. Deploy the Netlify and Apps Script source changes, while leaving Campaign Settings `Tracking base URL` blank.
4. Add Campaign Settings `Tracking base URL` last (for example, the Netlify `/go` path). This is the switch that enables tracked links in newly rendered outreach emails; existing campaign snapshots keep the links captured when they were created.

Add the required Netlify environment variables before the Netlify deployment; adding them afterward would leave the new `/go` route unable to sign or route tracked links correctly.

## Review branch and batched deployment policy

- Work only on `codex/work`, created from `codex/distribution-system-foundation`. Never push directly to `codex/distribution-system-foundation`; Karl merges reviewed work.
- Netlify builds are stopped for commits that touch only project status, README, docs, Apps Script, or tests. Netlify deploys must be batched.
- Performance work Phase 1 (web safeguards) is committed on `codex/work` and awaiting review. Do not deploy it alone.
- Performance work Phase 2 (Inventory API load and write reductions) is committed on `codex/work` and awaiting review. Deploy it before the batched Phase 1 and 3 Netlify release.
- Performance work Phase 3 (slim Outreach directory plus record-on-demand dialogs) is committed on `codex/work` and awaiting review. Do not deploy it separately from Phase 1.
- Deployment order: deploy Apps Script Phase 2 first, then deploy Netlify Phases 1 and 3 together as one release.

## Deployment procedures

Production deploys are Netlify Git builds from `codex/distribution-system-foundation`, triggered by Karl. Never deploy with the Netlify CLI.

### Netlify web-only change

1. Change `index.html` and, only when relevant, files in `netlify/functions/`.
2. Increment the `-WEB` version in every changed deployable web file.
3. Run `node --test tests/security-workflow.test.mjs`.
4. Syntax-check the inline script in `index.html`.
5. Commit and push `codex/distribution-system-foundation`.
6. Wait for Netlify and verify that https://distribution-hub.netlify.app/ reports the new version.
7. No Apps Script deployment is required unless an Apps Script source file also changed.

### Zoho staff login rollout

1. In Zoho API Console, create a server-based OIDC client with callback URL `https://distribution-hub.netlify.app/api/auth?action=callback`.
2. Add the Zoho/session Netlify variables listed above. Example role-map shape: `{ "inventory@sturgeonspirits.com": { "role": "staff", "areas": ["inventory"] }, "outreach@sturgeonspirits.com": { "role": "staff", "areas": ["outreach"] }, "orders@sturgeonspirits.com": { "role": "staff", "areas": ["orders"] }, "owner@sturgeonspirits.com": "admin" }`.
3. Deploy the Netlify web app, then sign in with one approved `admin` account and one `staff` account.
4. Deploy the Inventory API source version `2026.09.22.4` so spreadsheet “updated by” fields use the Zoho-verified actor.
5. Confirm a removed email is rejected immediately, each staff user sees only their assigned workspace, and an admin can manage products/system tools.

### Inventory API Apps Script change

1. Replace the complete Inventory API `Code.gs` with `apps-script/Code.gs`; never append a snippet.
2. Save the project.
3. Deploy a new web-app version while preserving the existing deployment URL.
4. Verify the root JSON reports the new `APP_VERSION`.
5. Netlify needs redeployment only if its `APPS_SCRIPT_URL` must change.

### Distribution Outreach Apps Script change

1. Replace the complete Distribution Outreach `Code.gs` with `docs/reference/distribution-outreach/Code.gs`; never append a snippet.
2. Save the project.
3. Deploy a new web-app version while preserving the existing deployment URL.
4. Verify **App sending configuration** reports the new `OUTREACH_VERSION`.
5. Confirm Karl-only testing before relying on real delivery.

## Required verification

### Web release-version rule

Treat the `-WEB` version as one app-wide release identifier, not a per-file label. Before every Netlify deployment, make the version identical in the `index.html` header comment, `app-version` meta tag, footer, `APP_VERSION` constant, and the staff-proxy and tracking-function version comment/constants. Do not deploy while any of those values differ.

Run the repository regression suite after every code change:

```bash
node --test tests/security-workflow.test.mjs
```

For email work, verify all applicable evidence:

1. The browser reports a verified message ID.
2. `Activity Log` records `APP TEST SENT` or `APP SENT` with that message ID.
3. Zoho shows the message in Sent.
4. A real send updates the directory row and follow-up state; a test send does not mark the prospect sent.

If a send times out or returns an unreadable response, do not retry blindly. Check the Activity Log and Zoho first because the delivery outcome may be unknown.

## Known issues and deferred work

- Confirm deployment of Inventory API `2026.09.22.3` and Distribution Outreach `2026.09.22.9-APP` before retesting a prospect with no email.
- Google Sheets can still respond slowly. The app now avoids several duplicate reads and shows timeout errors, but additional profiling may be needed if Orders & Accounts repeatedly fails.
- Zoho OIDC login and Karl's `admin` role are deployed and verified. A second, non-admin staff-account verification remains outstanding.
- Toast stock integration is not planned. Toast Standard API access requires a Restaurant Management Suite subscription the owner has declined (2026-09-25). The order page keeps staff-confirmed availability.
- Newsletter records exist, but newsletter sending remains disabled.
- Campaigns verified live: Karl sent a 111-recipient campaign on 2026-09-25 without problems.
- Production cutover is pending. See `docs/production-cutover-runbook-2026-09-25.md`. The Hub still reads the staging Inventory Backend copy (from 2026-09-15; missing the 2026-09-17 count) and the staging Badger Tracker.
- Staff access tab (`.12-WEB`): complete the Staff Access tab, service-account share, Google Sheets API enablement, and `STAFF_ROSTER_SHEET_ID` before promotion; verify an admin and a non-admin sign-in in staging before promoting. If a promotion blocks sign-in, return foundation to `.8-WEB` commit `be8752c` as documented in `docs/staff-access-setup.md`.

## Low-token workflow for future Codex tasks

Start a new task for each completed milestone. Use this prompt pattern:

> Read `PROJECT_STATUS.md`. Scope: [Netlify web only / Inventory API only / Distribution Outreach only]. Make this change: [single complete request]. Do not inspect other systems unless a failing test proves it is necessary. Run the existing tests, commit, deploy when authorized, verify the live version, update `PROJECT_STATUS.md`, and give me the direct app link. Keep updates and the final response brief.

Batch all related acceptance criteria into one request. For routine UI changes, use a lower-cost model and light reasoning. Reserve deeper reasoning for failures that cross Netlify, Apps Script, Sheets, and Zoho.
