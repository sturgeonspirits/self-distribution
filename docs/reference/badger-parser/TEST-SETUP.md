# Badger Parser Test Setup

Package version: `2026.09.15.5-TEST`

This package uses the existing staging spreadsheet. Do not create another
spreadsheet or manually create output tabs. The five core `TEST - ...` tabs are
already present; the script verifies their headers and can recreate them if a
test tab is missing.

## Test Resources

- [Staging Badger Invoice Tracker](https://docs.google.com/spreadsheets/d/10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ/edit)
- [Private parser fixture folder](https://drive.google.com/drive/folders/1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq)
- Complete paste-ready parser: `Code.gs` in this directory
- Complete manifest reference: `appsscript.json` in this directory

## Install The Complete Test Parser

1. Open the staging Badger Invoice Tracker linked above.
2. Choose **Extensions > Apps Script**.
3. Open the existing file named `Invoice Parser.gs`.
4. Select all of that file's contents and replace them with the complete
   `Code.gs` file. Do not append code.
5. Save the Apps Script project.
6. Leave `supakeys.gs` and `appsscript.json` unchanged.
7. Return to the spreadsheet and reload it.
8. Open **Sturgeon TEST Operations > Verify Test Configuration**.
9. Run **Sturgeon TEST Operations > 1. Import Test PDF Batch** and approve the
   requested Google permissions when prompted.

The parser uses `TEST - Invoices`, `TEST - Invoice Lines`, `TEST - Import
Errors`, `TEST - Parser State`, and test summary tabs. It does not append to the
copied production-like tabs.

## Safety Controls

- The script stops if it is not running in the staging spreadsheet ID.
- The configured PDF source is the private fixture folder, not production.
- Every output sheet name starts with `TEST -`.
- Supabase and retail-map writes are disabled.
- No automatic trigger is included in this test revision.
- Test reset requires confirmation and clears only test output.

Do not install this test build in the production Badger Invoice Tracker.
