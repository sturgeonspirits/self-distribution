# Sturgeon Distribution Hub — Project Status

Last updated: 2026-10-29

Read this file before inspecting the repository or changing the application. Never put secret values in this file.

**Keep this file short** (Karl, 2026-10-17: it is read at the start of every session). Record current state, open items and one line per recent change. Detailed change write-ups older than about a week go to `docs/history/`; never delete history, move it.

History, kept word for word:
- `docs/history/PROJECT_STATUS-through-2026-10-17.md`: this file as it stood before the 2026-10-17 trim (every detailed change entry since September).
- `docs/history/inventory-api-changes.md`: earlier Inventory API `Code.gs` version notes.
- `docs/history/distribution-outreach-changes.md`: earlier distribution outreach `Code.gs` version notes.

## Current state

| Component | Source version | Deployment state |
| --- | --- | --- |
| Netlify web app and staff proxy | `2026.10.17.56-WEB` on `codex/work` | **Production 2026-10-17.** Hub reports `.56` (promoted 19:15 CDT); staff proxy `.54`; sign-up `.55`; order and sell sheet `.58` (2026-10-28). |
| Inventory API Apps Script | `2026.10.29.49-APP` on `codex/work` | **Ready to deploy** (project **Inventory API**, attached to **Distribution Hub - Inventory Backend**): weekly task manager sync (`.49`), plus Badger units 330 mL (6) and 187 mL (7) so canned-cocktail orders can be invoiced (`.48`). After deploying, run `installTaskManagerSync()` once. Production: `2026.10.17.47-APP` (deployed 2026-10-17). |
| Distribution Outreach Apps Script | `2026.10.12.33-APP` in `docs/reference/distribution-outreach/Code.gs` | **Deployed 2026-10-12** (project **distribution outreach**, attached to **Distribution Hub**). |
| Public customer Netlify proxy | `2026.10.08.5-WEB` | Deployed 2026-10-08. |
| Badger invoice parser | `2026.10.08.3` in `docs/reference/badger-parser/Code.gs` | Live in the Badger Invoice Tracker since 2026-10-08; daily 5:45 am import reads Badger directly (no PDFs). Watch: a new Badger product spelling may need a row in the Sales Data product table (N–O). |

Branches: develop on `codex/work`; Netlify production builds `codex/distribution-system-foundation`. Promote reviewed work with `git push origin codex/work:codex/distribution-system-foundation` (fast-forward only); never commit directly to the production branch. Remote: `https://github.com/sturgeonspirits/self-distribution.git`. Karl's Mac checkout is `~/self-distribution-app` (aligned with `codex/work` on 2026-10-17; chat's old commit `0c3cea3` kept on branch `backup/chat-sellsheet-2026-10-15`).

Standing facts:
- Badger tracker safety (Karl, 2026-09-30): the importer never writes `Paid to Me` or `Submitted`, so direct, audited P/Q writes to the live tracker are safe.
- `payment_reminders_enabled` (Hub Configuration) defaults off when absent; do not enable it before review. Never create a test invoice in Badger.
- Every deploy handoff names the Apps Script project **and** the spreadsheet it is attached to (see "Apps Script projects" under Direct links, and `AGENTS.md`).

## Open items

- Weekly task manager sync (`.49`, not yet deployed): after the Inventory API deploy, run `installTaskManagerSync()` once from the editor (hourly trigger plus a first run). It writes to the Tasks tab of "Karl weekly task manager" (`1NQKvTSWvpTZ3uRsYWMUPAdOa_bHvsp_VMpc7EX1c_tI`). The 13 matching Follow-Up Board tasks (`fub-…`) were given "Hub key:" lines on 2026-10-29 so the first run adopts them; a dry run against that day's data created 5 new tasks (Oshkosh 2 Follow-up 2 (15), Oshkosh Oct 6 Follow-up 1 (13), Reactivation (31), Sep 23 Follow-up 2 (1), pre-campaign Follow-up 1 (3)). Last run summary: script property `TASK_MANAGER_SYNC_LAST_RUN`.
- Canned cocktails: Badger unit IDs read from Sturgeon's Badger invoices 2026-10-28 (330mL = 6, cans SS0079/SS0167; 187mL = 7, bitters SS0079/SS0093). Inventory API `.48` adds them; until Karl deploys it, can lines block at invoice preview. Proof 10 set on all five can SKUs (proof map; recipes at 4 cups alcohol in 80 = 5%). Bitters: Badger invoices used 187mL (unit 7) but SKUs list 50ml (unit 19); Karl to decide which the Hub should invoice.
- Chat round 2 of `claude/chat-review-campaign-tools-2026-10-17.md` (unique-match P2 fix `67aa20c`; re-applied sell-sheet change and narrow-phone header fix `bf89d1d`) was not confirmed before the 2026-10-17 promotion.
- Scheduled campaign "second email campaign -- Oshkosh 2" (89, Follow-up 1, 2026-10-20 10:33 CDT) includes 3 businesses not from its source (Gardina's Restaurant, Jerry's Tavern LLC, Oshkosh Arena); "Initial prospect campaign — Oct 17, 2026" (31) is entirely inside it (duplicates are blocked at send). Karl to decide; the 31 can now be deleted.
- Appleton group is due for Follow-up 2 (since 2026-10-13); its Follow-up 1 went out 2026-10-06 in a campaign named "Initial prospect campaign — Oct 6, 2026" (can now be renamed).
- Outreach drawing glitch on Karl's Android Chrome: page content verified correct (desktop Chrome, Firefox on the phone draws it fine); parked.

Setup steps recorded in the history whose completion was **not re-verified** on 2026-10-17 (check before relying on them):
- `repairHubStructure()` after releases that append columns or Email Editor blocks (sell sheet section, Cocktail list template, CUSTOMER ORDER INVITE EMAIL, Badger Invoice Links tab).
- Triggers: `installOutreachCampaignScheduler()`, `installToastStockImport()`, `installInboundReplyChecker()`, `installHubReadCacheWarmer()`.
- Canonical public site: set Hub Configuration `Public site URL` to `https://distribution.sturgeonspirits.com`, then run `rewritePublicSiteUrls()` once.
- Email Editor B13 (and the Campaign Settings row-24 formula): point the sell sheet link at `https://distribution.sturgeonspirits.com/sell-sheet.html` instead of the Drive PDF.
- Delete the unused `Current Prices` tab in the Badger Invoice Tracker.
- Welcome email: chat's staging checks on first real use (approve → review → send → reopen → Send again → a later save keeps Ordering Invite Date).

## Future-push backlog

- Outreach Campaigns UI: give **Create campaign** a visually distinct draft/primary color from the adjacent **Review campaign** buttons, so starting a new campaign cannot be mistaken for opening an existing one.
- Possible: split the Inventory API `Code.gs` into subject files (constants, core, inventory, orders and accounts, outreach, campaigns, Badger). Only after deploys use `clasp`; as its own release (analysis 2026-10-17).

## Recent changes (one line each; details in `docs/history/` and git)

- 2026-10-29 `.49-APP` (Inventory API only, no web change): hourly sync of open Hub work into the weekly task manager's Tasks tab (`syncTaskManager_`; keys `hub-reply-`, `hub-fu-`, `hub-cmp-`, `hub-cmprun-`, `hub-app-`, `hub-order-`); tasks close themselves when the Hub item clears. Tests: `tests/task-manager-sync.test.mjs`.
- 2026-10-28 `.58-WEB` (sell sheet, order page) plus sheet data: canned cocktails restored. The Oct 5 setup step was never done, so the SKUs tab had no cans. Added Price Tiers **Canned cocktail** $3 (per can; $72 per case of 24) and five active SKUs (Grape Popsicle, Cherry Limeade, Mango Collins, Fat Golfer, Fresh-kosh; size `12 oz can`, `invoice_volume` `330ml`, 24 per case, section Canned cocktails). Sell sheet prices the group as **$72/case of 24**; order page help mentions cans and mixing flavors. Print catalog shrink now starts above 70 lines; checked 2 pages public and priced with cans.
- 2026-10-21 `.57-WEB` (sell sheet only): print was spilling onto a third page (Bitters and contact block) after New and Best seller joined the page-two catalog. Print catalog type 12pt/1.24 → 11pt/1.14 and scales down automatically (to 80% at most) when the catalog has more than 74 lines. Checked with live catalog data, public and priced, in headless Chromium letter print: 2 pages; still 2 with 24 extra test products.
- 2026-10-17 `.56-WEB` (production, chat's `6655194`, pushed by Claude because the Mac has no GitHub sign-in): Log outcome is non-editable while its live record loads or its save is pending, so loading cannot erase entered text and a save records exactly the outcome, date and note shown when Save was pressed.
- 2026-10-17 `.47-APP`/`.54`/`.55-WEB` (production): delete unsent campaigns; rename campaigns; follow-ups from an earlier campaign match its businesses by account ID → email → name (unique matches only) with a default "Same businesses" mode and no distance/fit/area filters; previews list who was left out and why, including dates not reached; order page "View sell sheet" link and sell-sheet page-two catalog (chat's `0c3cea3`, re-applied) with a narrow-phone header fix. Chat review: no P1; P2 fixed.
- 2026-10-17: `PROJECT_STATUS.md` and both `Code.gs` headers trimmed; history moved to `docs/history/` (code unchanged).
- 2026-10-14 `.50`–`.53-WEB` (production): campaign load race guard (chat P2); section menu always visible in phone count mode; Outreach lists draw 50 at a time; icons converted once; Campaigns shows newest 10.
- 2026-10-14 `.49-WEB` (production): Zoho sign-in callback recovers instead of showing raw JSON; phone count button label.
- 2026-10-14 order page `2026.10.14.2-WEB` (production): no empty product box while products load.
- 2026-10-12 (deployed): Added to Badger checkbox; welcome email on approval with recording fix; every list filter starts on All; customer form fixes.

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
| `apps-script/Code.gs` | **Inventory API** | **Distribution Hub - Inventory Backend** | https://script.google.com/u/0/home/projects/1mUm3iOIJYpXkd36PsTqvi7uBGlPL7NokZwJLgdtZ3oSJTdCAuN3l9p-b/edit |
| `docs/reference/distribution-outreach/Code.gs` | **distribution outreach** | **Distribution Hub** | https://script.google.com/u/0/home/projects/1T7vAcnmNjZsI8Ym9udfbsi4DDuoDB82SNeoQmjtKTiR0PHer6g_XuFan/edit |
| `docs/reference/badger-parser/Code.gs` | tracker's script (file `Invoice Parser.gs`) | **Badger Invoice Tracker** | Extensions > Apps Script in the tracker |

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
| Inventory API Apps Script (project **Inventory API**) | `apps-script/Code.gs` |
| Distribution Outreach Apps Script (project **distribution outreach**) | `docs/reference/distribution-outreach/Code.gs` |
| Badger invoice parser (Badger Invoice Tracker) | `docs/reference/badger-parser/Code.gs` |
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

1. Replace the complete `Code.gs` with `apps-script/Code.gs`; never append a snippet.
2. Save, then Deploy > Manage deployments > edit the existing deployment > New version (keeps the URL).
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
- Toast stock integration is not planned. Toast Standard API access requires a Restaurant Management Suite subscription the owner has declined (2026-09-25). The order page keeps staff-confirmed availability.
- Newsletter records exist, but newsletter sending remains disabled.
- Campaigns verified live: Karl sent a 111-recipient campaign on 2026-09-25 without problems.
- Production cutover is pending. See `docs/production-cutover-runbook-2026-09-25.md`. The Hub still reads the staging Inventory Backend copy (from 2026-09-15; missing the 2026-09-17 count) and the staging Badger Tracker.
- Staff access tab (`.12-WEB`): complete the Staff Access tab, service-account share, Google Sheets API enablement, and `STAFF_ROSTER_SHEET_ID` before promotion; verify an admin and a non-admin sign-in in staging before promoting. If a promotion blocks sign-in, return foundation to `.8-WEB` commit `be8752c` as documented in `docs/staff-access-setup.md`.


## Low-token workflow for future Codex tasks

Start a new task for each completed milestone. Use this prompt pattern:

> Read `PROJECT_STATUS.md`. Scope: [Netlify web only / Inventory API only / Distribution Outreach only]. Make this change: [single complete request]. Do not inspect other systems unless a failing test proves it is necessary. Run the existing tests, commit, deploy when authorized, verify the live version, update `PROJECT_STATUS.md`, and give me the direct app link. Keep updates and the final response brief.

Batch all related acceptance criteria into one request. For routine UI changes, use a lower-cost model and light reasoning. Reserve deeper reasoning for failures that cross Netlify, Apps Script, Sheets, and Zoho.
