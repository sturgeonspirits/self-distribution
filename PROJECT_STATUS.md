# Sturgeon Distribution Hub — Project Status

Last updated: 2026-09-25

Read this file before inspecting the repository or changing the application. Update it whenever a deployment, version, service URL, known issue, or required setup step changes. Never put secret values in this file.

## Current state

| Component | Source version | Deployment state |
| --- | --- | --- |
| Netlify web app and staff proxy | `2026.09.24.44-WEB` on `codex/distribution-system-foundation` / `2026.09.24.43-WEB` live | `2026.09.24.43-WEB` was deployed 2026-09-25. The review correction in `.44-WEB` is committed only; do not deploy until reviewed. |
| Inventory API Apps Script | `2026.09.24.42` on `codex/distribution-system-foundation` / `2026.09.24.41` live | `2026.09.24.41` was deployed 2026-09-25. The review correction in `.42` is committed only; do not deploy until reviewed. |
| Distribution Outreach Apps Script | `2026.09.24.13-APP` on `codex/work` | Signed-link rendering is committed; owner has not yet confirmed this exact version is deployed. |
| Public customer Netlify proxy | `2026.09.18.3-WEB` | Deployed with Netlify; unchanged by the latest staff-app UI work |

Current Git branch: `codex/distribution-system-foundation`

Current remote: `https://github.com/sturgeonspirits/self-distribution.git`

Latest completed changes:

- Review corrections pending deployment: a Badger invoice explicitly marked Ignored can no longer be re-added to an account through an order reference. Loose customer-name aliases and conflicting Badger `Location_Directory` mappings now stay in matching review rather than selecting whichever duplicate row was last read. CSV part failures now distinguish a confirmed server error from an unconfirmed connection timeout. The production-inventory cutover runbook is blocked because an ACTIVE Hub ignores `LEGACY_INVENTORY_SPREADSHEET_ID`; a reviewed backend-routing change is required before changing production IDs.

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
- `STAFF_ROLES_JSON` (approved Zoho emails mapped to a role and permitted work areas)
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
- Toast remains disconnected until read-only API access and SKU mapping are verified.
- Newsletter records exist, but newsletter sending remains disabled.
- Campaigns verified live: Karl sent a 111-recipient campaign on 2026-09-25 without problems.
- Production cutover is pending. See `docs/production-cutover-runbook-2026-09-25.md`. The Hub still reads the staging Inventory Backend copy (from 2026-09-15; missing the 2026-09-17 count) and the staging Badger Tracker.
- Replace `STAFF_ROLES_JSON` with a dedicated, sheet-managed staff access roster. It should support immediate add/remove/change of role and permitted work areas without a Netlify environment-variable edit or redeploy, while preserving server-side authorization and audit attribution.

## Low-token workflow for future Codex tasks

Start a new task for each completed milestone. Use this prompt pattern:

> Read `PROJECT_STATUS.md`. Scope: [Netlify web only / Inventory API only / Distribution Outreach only]. Make this change: [single complete request]. Do not inspect other systems unless a failing test proves it is necessary. Run the existing tests, commit, deploy when authorized, verify the live version, update `PROJECT_STATUS.md`, and give me the direct app link. Keep updates and the final response brief.

Batch all related acceptance criteria into one request. For routine UI changes, use a lower-cost model and light reasoning. Reserve deeper reasoning for failures that cross Netlify, Apps Script, Sheets, and Zoho.
