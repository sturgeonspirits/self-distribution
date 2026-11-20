# Directory fill Parts C–F — 2026-11-20

## Parts C–F

- C: Log contact accepts an optional Email and uses the shared fill helper. Differing existing details are kept unless Karl explicitly selects replacement. Matched paper applications fill Directory blanks the same way.
- D: The Badger parser has a read-only monthly/customer-now pull into **Badger Customers**. The Inventory API matches it by Badger customer ID or explicit alias and fills blank Directory email, phone and address details, refusing known bad Badger ZIP/address values.
- E: The Inventory API reads Wisconsin DOR's public endpoint separately for Class A and Class B liquor licenses, merges by RN, filters out non-liquor records, writes **License Leads**, and fills matched blank agent/contact/address details.
- F: `runDirectoryQualityCheck()` and its weekly guard run ZIP repair, Badger and DOR processing, hard-bounce cleanup, then refresh the quality report. `previewDirectoryQualityCheck()` remains non-writing for its own Directory changes; it should be used before the first live source run.

## Limits to review before deployment

- DOR unmatched records are presently logged as `Would add`; no new Directory prospect is created automatically yet. Claude/Karl should inspect the first preview and decide whether to enable automatic creation.
- The DOR endpoint is live-only and was not called from this work session.

## Deploy/run order

1. Claude reviews all commits on `codex/work`.
2. Karl fast-forwards his checkout and runs `~/self-distribution-app/apps-script/deploy.sh` for **Inventory API**, attached to **Distribution Hub - Inventory Backend**.
3. Karl updates **Invoice Parser.gs** in the **Badger Invoice Tracker** with `docs/reference/badger-parser/Code.gs`.
4. Run `repairHubStructure()`, then `previewDirectoryQualityCheck()`.
5. After checking counts and matching, run the real Directory quality check; promote the web page only after API deployment.
