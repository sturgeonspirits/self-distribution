# Badger Parser Code Delivery

Current complete version: `2026.09.15.5-TEST`

Paste target: the full contents of the Apps Script file named
`Invoice Parser.gs` in the staging Badger Invoice Tracker only.

## Delivery Standard

- Every revision increments the version in the release header and in
  `BADGER_PARSER_VERSION`.
- The beginning of `Code.gs` lists the changes included in that version.
- Deliveries always provide a complete, paste-ready `Code.gs` file.
- The owner is never asked to merge or add code snippets manually.
- Credentials remain in Apps Script Properties and are never included in the
  paste-ready source.
- `supakeys.gs` is excluded from repository copies and code deliveries.

## Current File

Use `Code.gs` in this directory as the complete replacement source. It is bound
to the staging spreadsheet and private fixture folder, writes only to
`TEST - ...` tabs, and blocks external map/Supabase writes. The file is syntax
checked before delivery. Follow `TEST-SETUP.md`; do not install this build in
the production tracker.
