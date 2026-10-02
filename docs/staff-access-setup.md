# Staff Access Tab — Setup and Daily Use

Who can sign in to the Hub, and which workspaces they see, comes from a tab named **Staff Access** inside the Hub spreadsheet (`1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo`). There is no separate sheet. Changes take effect within about 2 minutes, with no Netlify edit or deploy. Zoho is still the login.

## Columns

| Column | What to enter |
| --- | --- |
| Email | The person's Zoho sign-in email |
| Name | For your reference (audit names still come from Zoho) |
| Role | `admin` or `staff` |
| Inventory / Outreach / Orders | Tick (or TRUE / yes / x) for each workspace a staff member may use. Admins get all three automatically. |
| Active | Untick to switch someone off without deleting the row |
| Notes | Anything; ignored by the Hub |

Instead of the three tick columns you can use one **Areas** column (for example `inventory, orders`), and `Staff ID` / `Display Name` columns are accepted too. Column order doesn't matter and extra columns are ignored. The tab name must stay exactly `Staff Access`; its position among the tabs doesn't matter.

- **Add someone:** add a row, set the Role, tick their areas, tick Active.
- **Remove someone:** untick Active or delete the row. Their open sessions stop working within about 2 minutes.
- **Change access:** change the ticks or Role.

Tip: select the Inventory, Outreach, Orders and Active columns and use **Insert → Checkbox**. Anyone who can edit the Hub can edit this tab; to stop that, right-click the tab → **Protect sheet** → restrict editing to yourself.

## Safety rules

- If the tab is missing, has no Email, Role, or Active column, or has no active admin, the Hub denies staff access and logs a warning in the Netlify function log.
- If Google can't be reached after the two-minute cache expires, the Hub denies access until it can refresh the tab. It never falls back to a role stored in a Netlify environment variable.
- Rows with a bad email, a blank or unknown role, or no areas ticked are skipped and noted in the function log.

## One-time setup (about 10 minutes)

1. In the Hub spreadsheet, add a tab named `Staff Access` with this header row: `Email, Name, Role, Inventory, Outreach, Orders, Active, Notes`. Add every approved Zoho user, including yourself as `admin`.
2. **Share** the Hub spreadsheet with the relay service account (the `GOOGLE_SA_CLIENT_EMAIL` value in Netlify, ending in `iam.gserviceaccount.com`) as **Viewer**, with Notify unticked.
3. Turn on the Google Sheets API for that service account: go to https://console.cloud.google.com/apis/library/sheets.googleapis.com, make sure the project picker at the top shows the relay project (for example `distribution-hub-relay`), and click **Enable**.
4. Netlify → Site configuration → Environment variables → add `STAFF_ROSTER_SHEET_ID` = `1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo`.
5. Deploy `2026.10.01.11-WEB` or later.
6. Check: sign in, then sign in with a non-admin account and confirm it sees only its ticked workspaces.
7. Remove `STAFF_ROLES_JSON` from Netlify. It is not read by this release.
