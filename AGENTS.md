# Release documentation rule

For every `apps-script/Code.gs` change, update both parts of its leading header before handing off the file or deploying it:

1. Set `App version` to the same version as `APP_VERSION`.
2. Add a concise, accurate entry under `CHANGES IN THIS VERSION` describing the change.

Verify the header version, `APP_VERSION`, and the deployment version agree before saying the change is ready.

# Deploy handoff rule

Whenever you ask Karl to paste and deploy a `Code.gs`, name the Apps Script project exactly as it appears in Apps Script **and** the spreadsheet it is attached to. See the "Apps Script projects" table in `PROJECT_STATUS.md`:

- `apps-script/Code.gs` → project **Inventory API**, attached to **Distribution Hub - Inventory Backend**
- `docs/reference/distribution-outreach/Code.gs` → project **distribution outreach**, attached to **Distribution Hub**
- `docs/reference/badger-parser/Code.gs` → the script in the **Badger Invoice Tracker** (file `Invoice Parser.gs`)
