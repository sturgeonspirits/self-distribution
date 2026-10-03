# Switching the live tracker to parser 2026.10.02.1

Do this after `TEST-SETUP.md` passes, at a time nobody is importing invoices.
About 10 minutes.

## Before you start

1. In Drive, make a copy of **Distribution Hub - Badger Invoice Tracker** and name it
   `Badger Invoice Tracker backup YYYY-MM-DD`.
2. Open the live tracker, then **Extensions > Apps Script**. Open the parser file,
   select all, copy, and paste it into a new text file on your computer named
   `Invoice Parser backup YYYY-MM-DD.gs`. That is the rollback.

## Install

3. Replace the whole parser file with `Code.gs`. Save.
4. Delete `supakeys.gs` (left-hand file list, ⋮ menu, Delete). The project should
   now hold only the parser file and `appsscript.json`. If any other `.gs` file is
   there, stop and tell Claude its name.
5. Reload the tracker. The menu is now **Sturgeon Invoice Parser**.
6. **Parser Status** — the toast should say `2026.10.02.1 · PRODUCTION` and show how many
   old `processed_pdf_`/`ocr_count_` settings are left.
7. **One-time: Move Old Parser Settings**. The toast says how many old markers moved
   into the new `Parser State` tab and how many old settings (including
   `SUPABASE_URL`/`SUPABASE_KEY`) were removed. Other settings are kept.
8. **Parser Status** again — old settings left: 0.

## First import

9. **1. Import New Invoice PDFs**. Expected toast: `Imported 0 … N already done.`, where
   N is the number of invoice PDFs in the folder (or `Imported 1`, `2`… if new PDFs were
   waiting). Nothing already in `Invoices` is read
   again.
10. Open the Distribution Hub, Orders & Accounts, and check that a recent invoice still
    shows with its paid/submitted state.

## Rollback

Paste the backup from step 2 back over the parser file and save. The new `Parser State`
tab can stay; the old parser ignores it. If step 7 already ran, the old parser has lost
its `processed_pdf_` markers. It will re-read old PDFs once but skip them as
duplicate invoice numbers.
