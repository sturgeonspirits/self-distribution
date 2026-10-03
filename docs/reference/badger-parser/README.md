# Badger Invoice Parser

Current complete version: `2026.10.03.1` (2026-10-03)

`Code.gs` in this directory is the complete, paste-ready parser. The same file
runs in both trackers; it decides what to do from the spreadsheet it is in:

| Spreadsheet | Reads | Writes |
| --- | --- | --- |
| Distribution Hub - Badger Invoice Tracker (`1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk`) | Badger `Invoices` folder (`1ccOfQpk69SLyMYskD2srlNqHCGm1VBJ5`), top level only | `Invoices`, `Invoice Lines`, `Import Errors`, `Parser State`, `Monthly Summary`, `Previous Month` |
| STAGING - Badger Invoice Tracker (`10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ`) | Private fixture folder (`1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq`) | `TEST - ...` tabs only |
| Anything else | Nothing | Nothing — stops with a safety message |

- Test it in staging first: `TEST-SETUP.md`.
- Switch the live tracker over: `INSTALL-PRODUCTION.md`.
- Automated checks: `node tests/badger-parser.test.cjs` (17 tests with fake Google services).

## Daily automatic import (production only)

**Sturgeon Invoice Parser → Turn On Daily Automatic Import** adds one time-driven trigger
that runs `scheduledInvoiceImport()` once a day at about 5:45 am Central (Google runs it
within ±15 minutes), before the Hub's 6:10 am Badger status sync. It does exactly what
the menu import does. Results go to `Parser State` and `Import Errors`; if a run fails,
Google emails the script owner its standard trigger-failure notice. **Turn Off Automatic
Import** removes it. **Parser Status** shows whether it is on. The menu import still
works any time.

## How it decides what to read

A PDF is skipped when its file ID is already in the `Invoices` tab (column B) or its
latest `Parser State` row is `IMPORTED`, `DUPLICATE`, `REVIEW`, `IGNORED` or
`LEGACY_PROCESSED`. To make the parser read a file again, change that file's latest
`Status` cell in `Parser State` to `RETRY`.

A PDF with no `SS####` invoice number is marked `REVIEW` once and never re-read, so
non-Badger documents no longer add an Import Errors row on every run. Keep anything
that is not a Badger invoice out of the folder anyway.

## Delivery Standard

- Every revision increments the version in the header and in `BADGER_PARSER_VERSION`,
  and lists its changes at the top of `Code.gs`.
- Deliveries are always a complete, paste-ready `Code.gs`; never a snippet to merge.
- No credentials in the code. The parser needs none (Supabase was removed in
  `2026.10.02.1`).
- No pop-up dialogs: every function is safe to run from the menu or the editor.

Previous versions: `2026.10.02.1` (no schedule), `2026.09.15.5-TEST` (staging-only test build), in git history.
