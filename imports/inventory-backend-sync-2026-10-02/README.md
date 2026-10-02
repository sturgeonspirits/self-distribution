# Inventory backend update import — 2026-10-02

These files update the existing attached Inventory API spreadsheet without changing its ID or any Apps Script properties.

Source: `Inventory-distribution-Main` (`1XVe0ffTLWQ4QJ3ersJ4RTh_XFTXiGjd7vyv5UnQ0sOY`).
Target: the currently attached `Distribution Hub - Inventory Backend` workbook (`1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8`). Its ID must remain unchanged.

## Import in this order

1. Make a dated Drive copy of the target workbook.
2. In its `Inventory` tab, select `A1`, then import `inventory-replace.csv` with **Replace data at selected cell** and comma separator. This is the complete 69-row Inventory table, including its header.
3. In its `Counts` tab, import `counts-append.csv` with **Append to current sheet** and comma separator. This file has no header and adds exactly 192 missing history rows.
4. Verify `FEST-OSHK / STUR-VOD-CHRY-750` is 12 units with a last-count date of 8/20/2026, and the Counts tab ends with 9/16/2026 entries.

Do not import `counts-append.csv` into the Inventory tab. Do not replace the Counts tab: its first 321 rows already match the source.
