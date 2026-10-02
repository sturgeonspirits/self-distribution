# Inventory backend update import — 2026-10-02

> **COMPLETED 2026-10-02 — do not import these files again.**
> Karl ran both imports on 2026-10-02. Importing `counts-append.csv` a second
> time would duplicate 192 Counts rows. These files are kept as a record only.

These files updated the existing attached Inventory API spreadsheet without changing its ID or any Apps Script properties.

Source: `Inventory-distribution-Main` (`1XVe0ffTLWQ4QJ3ersJ4RTh_XFTXiGjd7vyv5UnQ0sOY`).
Target: the currently attached `Distribution Hub - Inventory Backend` workbook (`1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8`). Its ID must remain unchanged.

## What was done (2026-10-02)

1. `inventory-replace.csv` was imported into the target's `Inventory` tab at `A1` with **Replace data at selected cell**. It is the complete 69-line Inventory table: header, 58 store/SKU rows and 10 blank separator rows, the same layout as the source.
2. `counts-append.csv` was imported into the target's `Counts` tab with **Append to current sheet**. It has no header and added 192 history rows (4/30/2026 through 9/16/2026) after the existing sheet row 321 (header plus 320 records).

## Verification (2026-10-02)

- Target `Counts` tab now spans `A1:H513` (321 + 192), the same as the source. A second append would have made it 705 rows.
- Target `Inventory` tab matches the source row for row; `FEST-OSHK / STUR-VOD-CHRY-750` is 12 units with a last-count date of 8/20/2026.
- `Hub Configuration` in the Distribution Hub is empty, so `inventory_migration_status` is not `ACTIVE` and the live Inventory API (`2026.10.01.5`) reads this target workbook.
- Staff app Inventory screen shows the 9/16/2026 counts.

No Apps Script code, API URL, Netlify variable or Script Property was changed.

## If the target ever needs to be rebuilt

Restore from the dated Drive copy taken before the import, or re-run both steps above on a target whose `Counts` tab ends at row 321. Check the last Counts row first: if it is a 9/16/2026 entry, the history is already present.
