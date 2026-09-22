# Sturgeon Distribution Hub — Project Status

Last updated: 2026-09-22

Read this file before inspecting the repository or changing the application. Update it whenever a deployment, version, service URL, known issue, or required setup step changes. Never put secret values in this file.

## Current state

| Component | Source version | Deployment state |
| --- | --- | --- |
| Netlify web app and staff proxy | `2026.09.22.5-WEB` | Verified live on 2026-09-22 |
| Inventory API Apps Script | `2026.09.22.3` | Source is committed; owner has not yet confirmed this exact version is deployed |
| Distribution Outreach Apps Script | `2026.09.22.9-APP` | Source is committed; owner has not yet confirmed this exact version is deployed |
| Public customer Netlify proxy | `2026.09.18.3-WEB` | Deployed with Netlify; unchanged by the latest staff-app UI work |

Current Git branch: `codex/distribution-system-foundation`

Current remote: `https://github.com/sturgeonspirits/self-distribution.git`

Latest completed changes:

- Prospect cards show the actual email and phone, or explicit `No email` and `No phone` warnings.
- The email-review window warns when an account has no email and disables real sending while leaving Karl-only testing available.
- Karl-only test sends may use a saved draft even when the prospect email is missing or unverified.
- The browser requires a verified Zoho message ID before showing send success.
- Orders & Accounts and Outreach reads were shortened to reduce Google Sheets timeouts.

## Direct links

### Application

- Staff app: https://distribution-hub.netlify.app/
- Customer signup: https://distribution-hub.netlify.app/customer-signup.html
- Customer order request: https://distribution-hub.netlify.app/order.html
- Netlify project: https://app.netlify.com/projects/distribution-hub/overview
- GitHub branch: https://github.com/sturgeonspirits/self-distribution/tree/codex/distribution-system-foundation

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

- Netlify owns the browser UI, staff-code boundary, request timeouts, and proxy behavior.
- Inventory API owns spreadsheet reads/writes, saved drafts, eligibility, activity, accounts, orders, inventory, and audit records.
- Distribution Outreach owns Zoho credentials, final email validation, Karl-only test delivery, real delivery, idempotency receipts, and Activity Log send results.
- `Pilot Review` is a read-only legacy archive and duplicate-send source. Do not restore sending from that tab.
- Sending is one recipient at a time. Queued and bulk sending remain disabled.
- Never report an email as sent unless Zoho returned a nonblank message ID and the Activity Log/Zoho state supports the result.

## Configuration names

Record names only—never record their values here.

### Netlify environment variables

- `APPS_SCRIPT_URL`
- `API_KEY`
- `STAFF_ACCESS_CODE`

### Inventory API Script Properties

- `API_KEY`
- `OUTREACH_MAILER_URL`
- `OUTREACH_MAILER_SHARED_SECRET`

### Distribution Outreach Script Properties

- `OUTREACH_MAILER_SHARED_SECRET`
- `OUTREACH_APP_SENDS_ENABLED`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`

The shared outreach secret must match in the two Apps Script projects. Zoho properties belong only in Distribution Outreach. The staff access code belongs only in Netlify and is not the API key or outreach secret.

## Deployment procedures

### Netlify web-only change

1. Change `index.html` and, only when relevant, files in `netlify/functions/`.
2. Increment the `-WEB` version in every changed deployable web file.
3. Run `node --test tests/security-workflow.test.mjs`.
4. Syntax-check the inline script in `index.html`.
5. Commit and push `codex/distribution-system-foundation`.
6. Wait for Netlify and verify that https://distribution-hub.netlify.app/ reports the new version.
7. No Apps Script deployment is required unless an Apps Script source file also changed.

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
- Individual staff accounts, signatures, attribution, and role-based permissions are deferred until the pilot workflows are stable. The shared staff access code remains temporary.
- Toast remains disconnected until read-only API access and SKU mapping are verified.
- Newsletter records exist, but newsletter sending remains disabled.

## Low-token workflow for future Codex tasks

Start a new task for each completed milestone. Use this prompt pattern:

> Read `PROJECT_STATUS.md`. Scope: [Netlify web only / Inventory API only / Distribution Outreach only]. Make this change: [single complete request]. Do not inspect other systems unless a failing test proves it is necessary. Run the existing tests, commit, deploy when authorized, verify the live version, update `PROJECT_STATUS.md`, and give me the direct app link. Keep updates and the final response brief.

Batch all related acceptance criteria into one request. For routine UI changes, use a lower-cost model and light reasoning. Reserve deeper reasoning for failures that cross Netlify, Apps Script, Sheets, and Zoho.
