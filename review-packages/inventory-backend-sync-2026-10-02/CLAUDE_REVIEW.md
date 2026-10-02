# Claude review — Inventory Backend data sync

## Review scope

Review only. Do not deploy Apps Script, change Netlify, change Script Properties, or write to a Google Sheet.

The existing Inventory API remains attached to spreadsheet ID `1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8`, now named **Distribution Hub - Inventory Backend**. The proposed approach intentionally keeps that ID and updates its data through CSV import.

## Why this package exists

The comparison workbook, `Inventory-distribution-Main` (`1XVe0ffTLWQ4QJ3ersJ4RTh_XFTXiGjd7vyv5UnQ0sOY`), has the same Stores, SKUs, and Reorders data as the attached backend. Its Inventory table has 41 different current rows, and its Counts table has the same first 321 records plus 192 later records through 2026-09-16.

An earlier proposal to point Apps Script at that other workbook was explicitly reverted. The net code diff from base commit `2c0170b` is only this import package.

## Package contents

- `imports/inventory-backend-sync-2026-10-02/inventory-replace.csv`
  - Complete 69-row `Inventory` table, header included.
  - Intended import: target workbook `Inventory` tab, cell `A1`, **Replace data at selected cell**.
- `imports/inventory-backend-sync-2026-10-02/counts-append.csv`
  - 192 missing `Counts` records, deliberately **no header**.
  - Intended import: target workbook `Counts` tab, **Append to current sheet**.
- `imports/inventory-backend-sync-2026-10-02/README.md`
  - Operator instructions and sample post-import checks.

## Required review checks

1. Confirm the Inventory CSV has exactly seven columns in the source table order: `store_id`, `sku_id`, `on_hand_units`, `par_level_units`, `reorder_point_units`, `last_count_date`, `last_count_units`.
2. Confirm the Counts CSV has exactly eight columns in the source table order and no header row: `timestamp`, `store_id`, `rep`, `sku_id`, `system_on_hand_units`, `counted_units`, `delta_units`, `notes`.
3. Confirm `counts-append.csv` begins after existing target row 321 and contains 192 records, so it neither duplicates current history nor replaces it.
4. Confirm `inventory-replace.csv` carries the source current values; for example, `FEST-OSHK / STUR-VOD-CHRY-750` is 12 units with `8/20/2026` as its last-count date.
5. Confirm the import process requires no Apps Script code, API URL, Netlify variable, or Script Property change.

## Current named connections

- `Distribution Hub`
- `Distribution Hub - Inventory Backend`
- `Distribution Hub - Badger Invoice Tracker`

