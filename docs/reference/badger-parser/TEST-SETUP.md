# Badger Parser Test Setup (staging)

Package version: `2026.10.02.1`

Run the new parser against the four private fixtures in the staging tracker before it
goes into the live tracker. It cannot touch production from here: in the staging
spreadsheet it reads only the fixture folder and writes only `TEST - ...` tabs.

## Test resources

- [Staging Badger Invoice Tracker](https://docs.google.com/spreadsheets/d/10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ/edit)
- [Private parser fixture folder](https://drive.google.com/drive/folders/1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq) (see `FIXTURES.md`)
- Complete parser: `Code.gs` in this directory

## Steps (about 5 minutes)

1. Open the staging tracker, then **Extensions > Apps Script**.
2. Open the parser file (`Invoice Parser.gs`), select everything, and replace it with
   the whole of `Code.gs`. Save. If the project has other `.gs` files, tell Claude
   which ones before going further.
3. Reload the spreadsheet. The menu is now **Sturgeon TEST Invoice Parser**.
4. **Parser Status** — the toast should say `2026.10.02.1 · STAGING`.
5. **RESET TEST OUTPUT (run twice)** — run it, then run it again within 2 minutes.
   The first run only arms it.
6. **1. Import New Invoice PDFs**. Approve permissions if asked.

## Expected result

| Check | Expected |
| --- | --- |
| Toast | `Imported 2. 1 need review … 1 duplicate invoice number(s) skipped.` |
| `TEST - Invoices` | `SS0157` and `SS0159` |
| `TEST - Invoice Lines` | the line items for those two invoices |
| `TEST - Parser State` | 2 `IMPORTED`, 1 `REVIEW` (Parm), 1 `DUPLICATE` (ZZ duplicate 0157) |
| Run **1. Import** again | `Imported 0 … 4 already done.` and no new rows anywhere |

If anything differs, copy the toast text and the new rows to Claude before going on.
