# Sturgeon Distribution Hub — Project Status

Last updated: 2026-11-24

Read this file before inspecting the repository or changing the application. Never put secret values in this file.

**Keep this file short** (Karl, 2026-10-17: it is read at the start of every session). Record current state, open items and one line per recent change. Detailed change write-ups older than about a week go to `docs/history/`; never delete history, move it.

History, kept word for word:
- `docs/history/PROJECT_STATUS-through-2026-10-17.md`: this file as it stood before the 2026-10-17 trim (every detailed change entry since September).
- `docs/history/inventory-api-changes.md`: earlier Inventory API `Code.gs` version notes.
- `docs/history/distribution-outreach-changes.md`: earlier distribution outreach `Code.gs` version notes.
- `docs/history/PROJECT_STATUS-2026-10-12-to-2026-11-12.md`: recent-change lines from 2026-10-12 to 2026-11-12, moved 2026-11-21.

## Current state

| Component | Source version | Deployment state |
| --- | --- | --- |
| Netlify web app and staff proxy | `2026.11.20.92-WEB` (page, staff proxy, tracking) / `2026.11.19.81-WEB` (signup page) | **Live `.92`** (production branch is at `codex/work` bb924e8; live page checked 2026-11-21). Sign-up `.81`; order and sell sheet `.58`. |
| Inventory API Apps Script | `2026.11.20.107-APP` | **Live `.107`** (Karl deployed with clasp; recorded 2026-11-21). The weekly Directory quality check runs on it for real, Mondays about 6:20 AM Central; first live run 2026-11-23. |
| Distribution Outreach Apps Script | `2026.11.19.37-APP` in `docs/reference/distribution-outreach/Code.gs` | **Live `.37`** (Karl; recorded 2026-11-21; project **distribution outreach**, attached to **Distribution Hub**). |
| Public customer Netlify proxy | `2026.10.08.5-WEB` | Deployed 2026-10-08. |
| Badger invoice parser | `2026.11.20.3` in `docs/reference/badger-parser/Code.gs` | **Live version not recorded.** The duplicate-number fix (`2026.11.17.1`) is live: Parser State shows SS171 and SS0171 both imported on 2026-11-18. Karl to confirm whether `2026.11.20.3` (read-only Badger customer pull) is deployed. |

**Record every deploy here in the same session.** On 2026-11-21, `.107`, outreach `.37` and page `.92` were live but still listed as pending, which misled two reviews.

Branches: develop on `codex/work`; Netlify production builds `codex/distribution-system-foundation`. Promote reviewed work with `git push origin codex/work:codex/distribution-system-foundation` (fast-forward only); never commit directly to the production branch. Remote: `https://github.com/sturgeonspirits/self-distribution.git`. Karl's Mac checkout is `~/self-distribution-app` (aligned with `codex/work` on 2026-10-17; chat's old commit `0c3cea3` kept on branch `backup/chat-sellsheet-2026-10-15`).

Standing facts:
- Badger tracker safety (Karl, 2026-09-30): the importer never writes `Paid to Me` or `Submitted`, so direct, audited P/Q writes to the live tracker are safe.
- `payment_reminders_enabled` (Hub Configuration) defaults off when absent; do not enable it before review. Never create a test invoice in Badger.
- Every deploy handoff names the Apps Script project **and** the spreadsheet it is attached to (see "Apps Script projects" under Direct links, and `AGENTS.md`).

## Open items

### Needs Karl's decision

- **Sequences (Part B of `claude/chat-request-campaign-sequences-2026-11-05.md`):** Phases 2-4 live (Phase 3 since 2026-11-17). `runSequenceStepCheck()` drafted 5 step campaigns for Karl to review: Oshkosh FU1 (more) 12, Oshkosh FU2 84, Sep 23 FU1 21, Sep 23 FU2 4, Fond Du Lac FU1 44. Chat's Phase 3 review findings are fixed (`.62`); layout polish of the cards is open for chat.
- Older campaigns: "second email campaign -- Oshkosh 2" (89, Follow-up 1) includes 3 businesses not from its source (Gardina's Restaurant, Jerry's Tavern LLC, Oshkosh Arena); "Initial prospect campaign — Oct 17, 2026" (31) is entirely inside it and can be deleted. Appleton is due for Follow-up 2 (since 2026-10-13); its Follow-up 1 went out in a campaign named "Initial prospect campaign — Oct 6, 2026" (can be renamed).
- Bitters: Badger invoices used 187mL (unit 7) but SKUs list 50ml (unit 19); which should the Hub invoice? (Canned-cocktail units are live since `.50`.)
- Bulk outreach through Zoho Mail: Zoho's usage policy disallows bulk/marketing mail at any pace; `.50`/`.34`/`.59` pace sends and stop on Outbox holds. Moving campaigns to a dedicated sender is open. Note: ZeptoMail is transactional-only, and most marketing senders require opt-in lists, which DOR-sourced prospects are not; check a provider's policy on cold B2B outreach first.
- Production cutover runbook (`docs/production-cutover-runbook-2026-09-25.md`) is out of date (see Known issues); Karl to confirm it can be retired.

### Follow-ups

- Sell sheet print/PDF should not show the "Place an order" buttons; hide them in print (Karl, 2026-11-24).
- **Toast stock is stale:** every SKUs `toast_stock_date` is still 2026-10-04 and the **Toast 86 Reports** Drive folder (`1kwjhWWg4KONWlcl-FmQ8oXeR9De6e5d_`) showed no CSV on 2026-11-21. The weekly step (2026-10-04 plan, `claude/wholesale-catalog-and-pricing-2026-10-04.md`): after the weekly Toast count, export Toast Reports > Menus > 86 Report (threshold 9999) as CSV and save it in that folder; the hourly `importLatestToastStockReport` updates `toast_stock` / `toast_stock_date` on the SKUs tab (Inventory Backend) and logs unmatched items to the Hub Audit Log. The order page shows only In stock / Out of stock.
- **Directory quality check, first live run Monday 2026-11-23:** expect about 929 DOR licensees within 30 miles added to the Directory (11-20 preview) and the License Leads tab filled; check both afterward.
- Order emails (2026-11-17, live; chat review pending, `claude/chat-request-order-notification-clarity-2026-11-17.md`): first live order ORD-20261117-C50E96EA (Acorn Ridge / Tim's Hardware Store) asked for Dill Vodka and Orange Vodka; Karl set both `active` = TRUE on 2026-11-17.
- Chat round 2 of `claude/chat-review-campaign-tools-2026-10-17.md` (unique-match P2 fix `67aa20c`; sell-sheet change and narrow-phone header fix `bf89d1d`) was not confirmed before the 2026-10-17 promotion.
- Deploy 1 leftover, one-time, only when no campaign is Scheduled or Sending (a batch writes whole rows sized to the column count): delete the empty duplicate column **U** "Schedule Detail" on **Outreach Campaigns** and the empty duplicate column **Y** "Message Stage" on **Outreach Campaign Recipients** (checked read-only 2026-11-05: V and Z hold the data).
- Setup steps whose completion was **not re-verified** since 2026-10-17 (check before relying on them):
  - `repairHubStructure()` after releases that append columns or Email Editor blocks (last run 2026-11-20 with `.102`).
  - Triggers: `installOutreachCampaignScheduler()`, `installToastStockImport()` (installed 2026-10-04 with `.20`), `installInboundReplyChecker()`, `installHubReadCacheWarmer()`. Confirmed: `installBadgerStatusSyncTrigger()` (2026-11-17), `installDirectoryQualityCheck()` (2026-11-20).
  - Canonical public site: Hub Configuration `Public site URL` = `https://distribution.sturgeonspirits.com`, then `rewritePublicSiteUrls()` once. (Hub Configuration held only `outreach_hourly_send_limit` on 2026-11-21, so this key is not set there.)
  - Email Editor B13 (and the Campaign Settings row-24 formula): sell sheet link to `https://distribution.sturgeonspirits.com/sell-sheet.html` instead of the Drive PDF.
  - Delete the unused `Current Prices` tab in the Badger Invoice Tracker.
  - Welcome email: chat's staging checks on first real use (approve → review → send → reopen → Send again → a later save keeps Ordering Invite Date).
- Second, non-admin staff sign-in still unverified (Karl's admin sign-in is verified).

### Parked

- Outreach drawing glitch on Karl's Android Chrome: page content verified correct (desktop Chrome, Firefox on the phone draws it fine).

## Future-push backlog

- Outreach Campaigns UI: give **Create campaign** a visually distinct draft/primary color from the adjacent **Review campaign** buttons, so starting a new campaign cannot be mistaken for opening an existing one.

## Recent changes (one line each; details in `docs/history/` and git)

- 2026-11-24 `.93-WEB` (Claude): fixed broken sign-in. Commit 493dca3 left stale `closed`/`shown` lines in the Outreach count label, so the page script failed to parse and no button worked. Removed them.
- 2026-11-21 (Claude, docs and tests only): recorded the live `.107`, outreach `.37` and page `.92`; corrected stale staging/cutover, sending, Toast and staff-access notes; open items grouped by decision / follow-up / parked; entries before 2026-11-13 moved to `docs/history/PROJECT_STATUS-2026-10-12-to-2026-11-12.md`; added `tests/web-version-parity.test.mjs` (go.js header comment corrected to `.92`).
- 2026-11-20 `.107-APP` (Claude): the licensee count differed on every preview. Live tests: DOR's default sort=0 reorders ties per request, so pages overlap and skip (Class A: 3,835 of 3,849 distinct); sort=1 returned the identical complete list on repeated parallel pulls; DOR stores 2 Class A records twice. Pulls now use sort=1 and are checked (page start rows, cross-page repeats) with a one-at-a-time refetch. Tests: `tests/directory-quality.test.mjs`.
- 2026-11-20 `.106-APP` (Claude): second preview: 3,123 would-adds within 60 mi (50 within 15, 929 within 30, 2,115 within 45), 159 fills, 29 real differences, Badger 1 fill and 2 differences, 19 bounces. Karl chose to add new businesses only within 30 miles (straight line): Campaign Settings "New business radius miles"; fills keep the 60-mile service area. Tests: `tests/directory-quality.test.mjs`.
- 2026-11-20 `.105-APP` (Claude): first full preview (`.104`, 12 s, 3,376 rows): 3,128 DOR would-adds within 60 mi, 163 would-fills, 46 differences, 19 bounces, 8 reply-note rows. Fixed: "NULL"/ALL CAPS/"Last, First" agent names; format-only contact, city, street and ZIP+4 differences; Street Address never filled (alias); preview adds counted in Directory totals; reply backfill writing notes-only rows. Preview now counts adds by distance band. Tests: `tests/directory-quality.test.mjs`.
- 2026-11-20 `.104-APP` (Claude): `.103` preview fetched DOR in 6 s, then timed out in processing. A full-scale simulation found ~23,000 service calls (Directory `getLastRow` per planned add, `formatDate`/`getScriptTimeZone`/`getUuid` per license) and an O(n²) street+ZIP scan that never matched (wrong column names). Now ~20 calls and an index on Street Address / Zip Code. Tests: `tests/directory-quality.test.mjs`.
- 2026-11-20 `.103-APP` (Claude): Karl deployed `.102`; `repairHubStructure()` and `installDirectoryQualityCheck()` ran, `previewDirectoryQualityCheck()` exceeded the 6-minute limit. DOR pages are now fetched in parallel batches (`UrlFetchApp.fetchAll`) after each pull's first page, with timing logs. Tests: `tests/directory-quality.test.mjs`.
- 2026-11-20 `.102-APP` (Claude): `previewDirectoryQualityCheck()` also previews the reply-note backfill and writes every planned change, uncapped, to a "Directory Preview" tab in the Distribution Hub spreadsheet so the first run can be checked in full. Tests: `tests/directory-quality.test.mjs`.
- 2026-11-20 `.101-APP` (Claude; chat out of tokens): DOR `rn` is only a row position within one search (checked live: both pulls number from 1, the same business has a different `rn` per search, and there is no license ID). Licenses are now keyed by legal name + trade name + street + ZIP + municipality for merging the two pulls, the License Leads checkpoint (column renamed "License Key") and possibly-closed, which now needs a complete pull. Live check: 14,939 liquor records → 14,907 keys (6 hold both classes; 24 are same-place re-reports, newer kept). Tests: `tests/directory-quality.test.mjs`.
- 2026-11-20 `.100-APP` (Codex; E/F hardening, pending Claude review): Directory quality fetches sources before its lock, batches only changed cells/new DOR rows, resumes before runtime exhaustion, previews actual fills/adds/differences, flags possibly closed licensees, and puts Badger differences in Karl's decision task. Tests: `tests/directory-quality.test.mjs`, `tests/task-manager-sync.test.mjs`.
- 2026-11-20 `.99-APP` (Codex; F review fixes): Directory quality no longer runs in the hourly task sync; its installer creates a Monday Central trigger and previews run both sources without writes.
- 2026-11-20 `.98-APP` (Codex; E review fixes): live DOR `subject` pages, liquor-only de-duplication, incremental/batched License Leads, and in-area prospect creation. Tests: `tests/directory-quality.test.mjs`.
- 2026-11-20 Badger parser `2026.11.20.3` (Codex; D1 fix): confirmed live customer-detail mapping uses addressLine1/addressLine2 and exact response-shape validation. Tests: `tests/badger-parser.test.cjs`.
- 2026-11-20 `.97-APP` / Badger parser (Codex; D review fixes): daily post-invoice customer pull, shape diagnostics, and dry-run would-fill/difference reporting.
- 2026-11-20 `.96-APP` (Codex; Directory cleanup F): weekly quality run processes Badger and DOR sources before refreshed reporting.
- 2026-11-20 `.95-APP` (Codex; Directory cleanup E): DOR Class A/Class B liquor pulls merge by RN, write License Leads and fill matched blank contact/address fields. Tests: `tests/directory-fill.test.mjs`.
- 2026-11-20 `.94-APP` / Badger parser `2026.11.20.2` (Codex; Directory cleanup D): a monthly read-only Badger Customers pull and alias/ID-matched safe Directory fills; known Badger address typos are refused. Tests: `tests/badger-parser.test.cjs`, `tests/directory-fill.test.mjs`.
- 2026-11-20 `.93-APP` / `.92-WEB` (Codex; Directory cleanup C): Log contact and matched paper applications reuse the shared fill helper; contact-log differences stay by default unless Karl explicitly checks replace. Tests: `tests/directory-fill.test.mjs`, `tests/paper-application.test.mjs`.
- 2026-11-20 `.92-APP` (Codex; Directory cleanup B review fixes, pending review): customer-history relationships stay in quality work; reply-sourced fills become Replied and clear follow-ups; unsafe/business-like sender names are refused. Tests: `tests/directory-fill.test.mjs`, `tests/directory-quality.test.mjs`.
- 2026-11-19 `.91-APP` (Codex; Directory cleanup B, pending review): trusted person replies fill blank/bounced email and blank/placeholder contact details; preview-first Alt-email Notes backfill reuses the same safe helper. Tests: `tests/directory-fill.test.mjs`.
- 2026-11-19 `.90-APP` (Codex; Directory quality review fixes, pending review): service-area-scoped work list, weekly ZIP Miles fill (manual values kept), decision-only normal task, locked/rechecked bounce writes, and smaller Outreach payload. Tests: `tests/directory-quality.test.mjs`, `tests/task-manager-sync.test.mjs`.
- 2026-11-19 `.89-APP` / page `.91-WEB` / outreach `.37-APP` (Codex; Directory cleanup A, pending review): Campaign Settings gets Service area miles (60) through repair; Not a buyer is a strict Do not contact outcome in the Hub and mailer. Tests: `tests/directory-quality.test.mjs`.
- 2026-11-19 `.88-APP` / page `.90-WEB` / outreach `.36-APP` (Codex; pending review): weekly Directory quality report and self-closing task flag missing/bounced email, missing/placeholder contact, duplicates and missing prospect distance; hard bounces move to dated Notes and remain reply-matchable but cannot be re-entered/sent. Tests: `tests/directory-quality.test.mjs`. Includes Claude's page `.89` closed-businesses view (The Plaza contact correction; 2fer's row 11 marked Closed as duplicate of row 610).
- 2026-11-19 `.87-APP` / page `.88-WEB` (Claude): Karl asked whether the Today tab's businesses were outside campaigns; 12 of its 30 were in an open campaign (most in "First prospects, Sep 23 — Follow-up 1", sending Fri). Today and the due count now leave out businesses whose next email is scheduled, and every Outreach card names the campaign still holding an email for it. Tests: `tests/today-campaigns.test.mjs`. Also: Karl deployed the 12-part split (`.86`) with clasp.
- 2026-11-19 `.86-APP` (Claude): Inventory API Code.gs (12,458 lines) split into 12 parts by area, each a continuous piece of the old file in its old order (joined, they equal the old file byte for byte apart from the part banners and header), so load order and behavior are unchanged. Tests read the parts joined (`tests/helpers/backend-source.mjs`); `tests/clasp-deploy.test.mjs` checks each part parses alone and no name is declared twice.
- 2026-11-19 (Claude): Inventory API deploys with clasp. `apps-script/` now holds every file of the Apps Script project (added profiler.gs, campaignrunner.gs, Index.html and appsscript.json from a `clasp clone`; deployed Code.gs matched the repo), `.clasp.json` (script ID) and `deploy.sh` (push + update the live deployment). Page `.85` and Inventory API `.84` are live (promoted `17f202a`).
- 2026-11-19 `.84-APP` / web `.85-WEB` (Claude): speed fixes 1-3. Measured: Orders & Accounts rebuild 18 s (account build 12 s), Outreach 6 s, ~4 s fixed per request; every save and several 5-15-minute jobs cleared all three screen caches. Now per-group caches, stale-while-rebuilding, job rebuilds, refresh without the Badger re-read, single-attempt rebuild reads. Tests: `tests/read-cache.test.mjs`. Not done yet: steps 4-5 (faster account build, fixed per-request cost) and the Code.gs split.
- 2026-11-19: Karl deployed Inventory API `.83`; Claude promoted `22838d6` (page `.82`). 1890 Pub duplicate Directory row (ACC-ECE16…) removed; its application now points at ACC-B6F78….
- 2026-11-19 `.83-APP` + page `.82` (Claude): Karl approved the 1890 Pub application (APP-20261119-ADCA711C); the Hub made a new Directory row ACC-ECE16CD8… instead of using ACC-B6F78FF7… "THE 1890 PUB & BISTRO" (same email; names differed). Matching fixed (tests `tests/account-matching.test.mjs`); the existing duplicate still needs cleaning up. Karl: approved applications are customers, so the Applications list hides finished ones by default.
- 2026-11-19 page `.82-WEB` (Claude): Karl couldn't see the 1890 Pub application (APP-20261119-ADCA711C, received 2:43 PM): his Orders & Accounts load had timed out, but the screen showed 0 new applications and "No matching applications". A failed first load now retries once after 3 s; if nothing has loaded, counts show "–" and the list says it didn't load and to press refresh. Tests: `tests/customer-load-failure.test.mjs`.
- 2026-11-19: Karl deployed Inventory API `.80` and promoted `3436879` (web `.81`) to production.
- 2026-11-19 `.80-APP` / web `.81-WEB` (Claude; not deployed): Karl wanted to enter paper customer forms without signing the affirmation with his own name, and the new-application email's "Review" link to open the Hub, not the staging sheet. Signup page paper mode (`?paper=1`): signer name/title optional (default the primary contact), "The customer signed the paper form" checkbox, newsletter box starts unchecked; saves via staff proxy action `submitPaperCustomerApplication` (orders area; not reachable from the public proxy), marked Paper form / Entered By, no notification email. Email link `hubApplicationUrl_` → `/?application=APP-…`, which the Hub opens like `?order=`. Tests: `tests/paper-application.test.mjs`.
- 2026-11-19 `.78-APP` / page `.79-WEB` (Claude; not deployed): Karl: Replies > Done showed the same bar two or three times (one row per email; Anjie's, Mr Brews, Corner Bar, 1890 Pub each had 2–3 emails in one conversation; Tim's had the 11-17 double copy). Done now groups by business (account ID, else sender): newest email's line, one Record result (server already records on all the business's answered replies), "N earlier emails" fold with their own Undo; the heading counts businesses. New outcomes **Visit scheduled** (date box becomes the visit date, saved as next follow-up; never auto-filled) and **Visited**; existing "Visit in person" kept, labelled "(to do)". Tests: `tests/reply-done-groups.test.mjs`.
- 2026-11-17 `.76-APP` / page `.77-WEB` (Claude; not deployed): Print invoice. Badger prints an invoice at `https://badgerstatecoop.com/BSWCSite/member/invoice/print/<Badger invoice ID>` (Karl; SS0171 is 72639). Orders get `badger_invoice_id` (Badger Invoice Creations for Hub-created invoices, else Badger Invoice Status by number); the order window shows **Print invoice** and each linked invoice in an account shows **Print**, opening Badger in a new tab.
- 2026-11-17 `.74-APP` / page `.75-WEB` / proxy `.73-WEB` (Claude; not deployed): the Hub created **SS0171** (Acorn Ridge, Badger ID 72639, $154) beside Fox and Crow's **SS171**: invoices ran SS0163-SS0170, then SS171-SS173 were entered without the zero, and `badgerNextInvoiceNumber_` read only `SS\d{4}`. Now counts by value, writes unpadded (SS174), and refuses a used value. Create timed out at the proxy (24 s) though Badger created it; the timeout said "Zoho". Messages are now per action and the page rechecks the order after a timed-out Create. Badger can't renumber invoices (Karl), so SS0171 stays Acorn Ridge's invoice. The parser padded SS171 to SS0171 and would hold both out as DUPLICATE_NUMBER; parser `2026.11.17.1` pads only numbers up to 170.
- 2026-11-17 `.72-APP` (Claude; deployed same day): Create Badger invoice on the Acorn Ridge order timed out ("Google Sheets took too long to answer after 1 attempt"): `badgerInvoiceDraft_` rebuilt the whole work queue (`currentBadgerPaymentAccount_`, ~18 s) before four Badger calls. It now uses the cached queue (`badgerInvoiceAccount_`), rebuilding only if the account is missing.
- 2026-11-17 page `.71-WEB` (Claude; promoted same day): Karl couldn't link the Acorn Ridge order: the Account ID box took only the raw `ACC-...` ID (Chrome autofill showed old IDs). Orders and applications now use the business-and-city picker from Badger invoice linking, show the linked business by name, and suggest the account whose email or name matches ("Use this account"). Claude linked ORD-20261117-C50E96EA to Tim's Hardware Store (ACC-B013655A…) by hand first.
- 2026-11-17 Badger: the Hub's daily Badger status sync trigger had never been installed (Badger Sync Log only had manual syncs: Oct 1, Oct 12, Nov 17). Karl ran `installBadgerStatusSyncTrigger()` 2026-11-17; first scheduled run expected ~6:10 AM 11/18.
- 2026-11-17 page `.70-WEB` (Claude; promoted same day): Karl: answered replies still showed (Replies 8 = 1 to answer, 1 address problem, 6 "Results to record"). Replies the checker saw answered (`needs_outcome`) now go to Done with a **Record result** button instead of their own group and tile, and the Replies tab count is only cards still needing something (status New). Server unchanged.
- 2026-11-17 `.69-APP` (Claude; not deployed): Mark Wilton's order email reached the Inbox twice with two Zoho message IDs, so it showed as two cards and "Email sent" on one left the other (Karl: "nothing changed"). The checker now skips a message matching a stored reply's sender, subject and text within 2 minutes. Claude closed the leftover copy with Email sent. Tests: `tests/reply-email-sent.test.mjs`.
- 2026-11-17 page `.68-WEB` (Claude; promoted same day): reply cards waiting on an answer get **Email sent** (Karl answers from his own mailbox, which the reply checker can't see). It closes the card as Handled with "Email sent directly" (existing `resolveInboundReply`; Undo reopens). No Apps Script change. Tests: `tests/reply-email-sent.test.mjs`.
- 2026-11-17 Deploy 2 done: Karl deployed Inventory API `.65`; Claude promoted `4d3a3f4` (page `.66`, proxy `.67`) to production.

- 2026-11-17 `.65-APP` / page `.66-WEB` / proxy `.67-WEB` (Claude; chat out of tokens; not deployed): Karl couldn't see the bottles from the new-order email (its link opened the Online Order Requests row; products are on Online Order Lines). The email now carries a priced product table, total, customer notes in a highlighted box, delivery details, and an "Open this order in the Hub" link (`/?order=ORD-...`, opened from fresh data); the sheet row is a footer link. The order window leads with Products (price, line totals, total, notes, next-step hint) and can add or remove products before invoicing (`updateOnlineOrderLines`; active SKUs only; audited). Tests: `tests/order-notification.test.mjs`.

Older entries: `docs/history/`.

## Direct links

### Application

- Canonical public site: https://distribution.sturgeonspirits.com/
- Customer signup: https://distribution.sturgeonspirits.com/customer-signup.html
- Customer order request: https://distribution.sturgeonspirits.com/order.html
- Legacy host (redirects to the canonical site): https://distribution-hub.netlify.app/
- Netlify project: https://app.netlify.com/projects/distribution-hub/overview
- GitHub review branch: https://github.com/sturgeonspirits/self-distribution/tree/codex/work

### Apps Script projects

Every deploy handoff must name the Apps Script project as it appears in Apps Script **and** the spreadsheet it is attached to (Karl, 2026-10-17). Containers checked in Apps Script > Overview on 2026-10-17.

| Repo source | Apps Script project | Attached to (container) | Editor |
| --- | --- | --- | --- |
| `apps-script/` (01-core.gs to 12-task-manager.gs, profiler.gs, campaignrunner.gs, Index.html, appsscript.json; deploy with `apps-script/deploy.sh`) | **Inventory API** | **Distribution Hub - Inventory Backend** | https://script.google.com/u/0/home/projects/1mUm3iOIJYpXkd36PsTqvi7uBGlPL7NokZwJLgdtZ3oSJTdCAuN3l9p-b/edit |
| `docs/reference/distribution-outreach/Code.gs` | **distribution outreach** | **Distribution Hub** | https://script.google.com/u/0/home/projects/1T7vAcnmNjZsI8Ym9udfbsi4DDuoDB82SNeoQmjtKTiR0PHer6g_XuFan/edit |
| `docs/reference/badger-parser/Code.gs` | tracker's script (file `Invoice Parser.gs`) | **Badger Invoice Tracker** | Extensions > Apps Script in the tracker |

### Spreadsheets (live)

The Hub runs on these sheets; the "staging" names in older notes and in `01-core.gs` comments predate live use.

- Distribution Hub (Directory, campaigns, Hub tabs; script **distribution outreach**): https://docs.google.com/spreadsheets/d/1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo/edit
- Distribution Hub - Inventory Backend (SKUs, Price Tiers, inventory; script **Inventory API**; `inventory_migration_status` is not ACTIVE, so inventory reads stay here): https://docs.google.com/spreadsheets/d/1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8/edit
- Badger Invoice Tracker (live): https://docs.google.com/spreadsheets/d/1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk/edit
- STAGING - Badger Invoice Tracker (parser test copy only): https://docs.google.com/spreadsheets/d/10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ/edit

## Authoritative source files

| Area | File |
| --- | --- |
| Staff web app | `index.html` |
| Customer signup | `customer-signup.html` |
| Customer order request | `order.html` |
| Staff Netlify proxy | `netlify/functions/inventory.js` |
| Public Netlify proxy | `netlify/functions/customer.js` |
| Inventory API Apps Script (project **Inventory API**) | `apps-script/01-core.gs` to `12-task-manager.gs` (version header in 01-core.gs) |
| Distribution Outreach Apps Script (project **distribution outreach**) | `docs/reference/distribution-outreach/Code.gs` |
| Badger invoice parser (Badger Invoice Tracker) | `docs/reference/badger-parser/Code.gs` |
| Regression tests | `tests/security-workflow.test.mjs` |
| Netlify routes | `netlify.toml` |

Do not use `index-old.html` as current source. Do not modify or delete `_karl-edit/` or other untracked owner files unless the owner explicitly requests it.

Use this file and the version constants inside the deployable source files as the version authority; `README.md` and `netlify.toml` point here instead of carrying version labels. `tests/web-version-parity.test.mjs` fails when the -WEB versions differ.

## System boundaries

```text
Browser
  -> Netlify /api/inventory
  -> Inventory API Apps Script
  -> Google Sheets (Distribution Hub, Inventory Backend, Badger Invoice Tracker)
  -> Distribution Outreach Apps Script for email only
  -> Zoho Mail API
```

- Netlify owns the browser UI, Zoho staff-login boundary, request timeouts, and proxy behavior.
- Inventory API owns spreadsheet reads/writes, saved drafts, eligibility, activity, accounts, orders, inventory, and audit records.
- Distribution Outreach owns Zoho credentials, final email validation, Karl-only test delivery, real delivery, idempotency receipts, and Activity Log send results.
- `Pilot Review` is a read-only legacy archive and duplicate-send source. Do not restore sending from that tab.
- Campaigns and sequence steps send through the scheduler: the mailer is called one email at a time, paced by Hub Configuration `outreach_hourly_send_limit` (30) and 2 per 5 minutes, inside `outreach_send_window` (default 10:00-14:00 Mon-Fri); a Zoho Outbox hold makes the campaign wait and continue on its own.
- Never report an email as sent unless Zoho returned a nonblank message ID and the Activity Log/Zoho state supports the result.

## Configuration names

Record names only—never record their values here.

### Netlify environment variables

- `APPS_SCRIPT_URL`
- `API_KEY`
- `ZOHO_OIDC_CLIENT_ID`
- `ZOHO_OIDC_CLIENT_SECRET`
- `ZOHO_OIDC_REDIRECT_URI`
- `PUBLIC_SITE_URL`
- `ZOHO_OIDC_ISSUER` (use `https://accounts.zoho.com` unless the organization uses another Zoho data center)
- `APP_SESSION_SECRET` (a new random secret, at least 32 characters)
- `STAFF_ROSTER_SHEET_ID` (the Hub spreadsheet ID; Hub shared Viewer with the relay service account; Google Sheets API enabled in its Cloud project)
- `TRACKING_LINK_SECRET`
- `SELL_SHEET_ACCESS_SECRET`

### Inventory API Script Properties

- `API_KEY`
- `OUTREACH_MAILER_URL`
- `OUTREACH_MAILER_SHARED_SECRET`
- `TRACKING_LINK_SECRET`
- `INBOUND_REPLY_SINCE_MS`, `INBOUND_REPLY_LAST_RUN` (written by the reply checker; delete `INBOUND_REPLY_SINCE_MS` to re-read the last 14 days)

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
2. Add `SELL_SHEET_ACCESS_SECRET` to Netlify. It signs the 90-day price-access tokens; it may temporarily fall back to `TRACKING_LINK_SECRET` during the rollout, but use a distinct secret for normal operation.
3. Deploy the Netlify and Apps Script source changes, while leaving Campaign Settings `Tracking base URL` blank.
4. Add Campaign Settings `Tracking base URL` last (for example, the Netlify `/go` path). This is the switch that enables tracked links in newly rendered outreach emails; existing campaign snapshots keep the links captured when they were created.

Add the required Netlify environment variables before the Netlify deployment; adding them afterward would leave the new `/go` route unable to sign or route tracked links correctly.

## Deployment procedures

Production web deploys are Netlify Git builds from `codex/distribution-system-foundation` (promote by fast-forward from `codex/work`). Never deploy with the Netlify CLI. Batch Netlify deploys; the build is skipped for commits that touch only project status, README, docs, Apps Script or tests.

### Netlify web change

1. Change the web files and increment the `-WEB` version in every changed deployable web file.
2. Run `node --test tests/*.mjs tests/*.cjs`.
3. Promote `codex/work` to `codex/distribution-system-foundation` (fast-forward).
4. Verify https://distribution.sturgeonspirits.com/ (and any changed page) reports the new version.
5. No Apps Script deployment is required unless an Apps Script source file also changed.

### Inventory API Apps Script change (project **Inventory API**, attached to **Distribution Hub - Inventory Backend**)

1. Push to `codex/work` and fast-forward Karl's Mac checkout (`~/self-distribution-app`).
2. Karl runs `~/self-distribution-app/apps-script/deploy.sh` (clasp, set up 2026-11-19; signed in as sturgeonspirits@gmail.com). It checks the 01-core.gs header matches `APP_VERSION` and that every part is present, uploads every file in `apps-script/` (the upload replaces the project's files), creates a version and moves web app deployment `AKfycbx81…` to it (same URL). (Pasting is no longer practical: 12 files.)
3. Verify the live API reports the new `APP_VERSION` (Hub > Orders & Accounts > System status, or `hubSystemStatus`).
4. If a web release depends on it, deploy the Apps Script first, then promote Netlify.

### Distribution Outreach Apps Script change (project **distribution outreach**, attached to **Distribution Hub**)

1. Replace the complete `Code.gs` with `docs/reference/distribution-outreach/Code.gs`; never append a snippet.
2. Save, then Deploy > Manage deployments > edit the existing deployment > New version (keeps the URL).
3. Verify **App sending configuration** reports the new `OUTREACH_VERSION`.
4. Confirm Karl-only testing before relying on real delivery.

## Required verification

### Web release-version rule

Treat the `-WEB` version as one app-wide release identifier, not a per-file label. Before every Netlify deployment, make the version identical in the `index.html` header comment, `app-version` meta tag, footer, `APP_VERSION` constant, and the staff-proxy and tracking-function version comment/constants. Do not deploy while any of those values differ.

Run the repository regression suite after every code change:

```bash
node --test tests/*.mjs tests/*.cjs
```

For email work, verify all applicable evidence:

1. The browser reports a verified message ID.
2. `Activity Log` records `APP TEST SENT` or `APP SENT` with that message ID.
3. Zoho shows the message in Sent.
4. A real send updates the directory row and follow-up state; a test send does not mark the prospect sent.

If a send times out or returns an unreadable response, do not retry blindly. Check the Activity Log and Zoho first because the delivery outcome may be unknown.

## Known issues and deferred work

- Google Sheets can still respond slowly. The app now avoids several duplicate reads and shows timeout errors, but additional profiling may be needed if Orders & Accounts repeatedly fails.
- Zoho OIDC login and Karl's `admin` role are deployed and verified. A second, non-admin staff-account verification remains outstanding.
- Toast API integration is not planned: Toast Standard API access requires a Restaurant Management Suite subscription the owner has declined (2026-09-25). Stock comes from the weekly Toast 86 Report CSV import instead (see Open items); SKUs without a Toast match show staff-confirmed availability.
- Newsletter records exist, but newsletter sending remains disabled.
- Campaigns verified live: Karl sent a 111-recipient campaign on 2026-09-25 without problems.
- No separate production cutover has happened or is pending in code: the Hub takes live orders, creates live Badger invoices and sends live campaigns on the sheets under Direct links. `docs/production-cutover-runbook-2026-09-25.md` describes a move that never ran and is out of date.
- Staff access (roster via `STAFF_ROSTER_SHEET_ID`, `netlify/lib/staff-roster.js`) is live; the old `.12-WEB` rollback to `.8-WEB` no longer applies.


## Low-token workflow for future Codex tasks

Start a new task for each completed milestone. Use this prompt pattern:

> Read `PROJECT_STATUS.md`. Scope: [Netlify web only / Inventory API only / Distribution Outreach only]. Make this change: [single complete request]. Do not inspect other systems unless a failing test proves it is necessary. Run the existing tests, commit, deploy when authorized, verify the live version, update `PROJECT_STATUS.md`, and give me the direct app link. Keep updates and the final response brief.

Batch all related acceptance criteria into one request. For routine UI changes, use a lower-cost model and light reasoning. Reserve deeper reasoning for failures that cross Netlify, Apps Script, Sheets, and Zoho.
