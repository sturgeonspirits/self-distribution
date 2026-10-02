# Staff Access Sheet — Setup and Daily Use

Who can sign in to the Hub, and which workspaces they see, comes from the Google Sheet **Hub Staff Access** (`1BT_lEW3aDC9xphKURWFvC3HGsHDteUaEvUWxKICKgEY`, owned by sturgeonspirits@gmail.com). Changes take effect within about 2 minutes, with no Netlify edit or deploy.

## Columns (first tab only)

| Column | What to enter |
| --- | --- |
| Email | The person's Zoho sign-in email |
| Name | For your reference (audit names still come from Zoho) |
| Role | `admin` or `staff` |
| Inventory / Outreach / Orders | Tick (or TRUE / yes / x) for each workspace a staff member may use. Admins get all three automatically. |
| Active | Untick to switch someone off without deleting the row |
| Notes | Anything; ignored by the Hub |

Instead of the three tick columns you can use one **Areas** column (for example `inventory, orders`), and `Staff ID` / `Display Name` columns are accepted too. Column order doesn't matter and extra columns are ignored. Keep the roster on the **first tab**: the Hub reads only that tab.

- **Add someone:** add a row, set the Role, tick their areas, tick Active.
- **Remove someone:** untick Active or delete the row. Their open sessions stop working within about 2 minutes.
- **Change access:** change the ticks or Role.

Tip: select the Inventory, Outreach, Orders and Active columns and use **Insert → Checkbox**.

## Safety rules

- If the sheet has no Email or Role column, or no active admin, the Hub ignores it rather than locking everyone out, and logs a warning in the Netlify function log.
- If Google can't be reached, the Hub keeps using the last copy it read. If it has never read the sheet since starting, people already signed in keep the access they had at sign-in (up to 8 hours), and new sign-ins use the optional `STAFF_ROLES_JSON` Netlify variable. Keep only your own admin entry there as a backup.
- Rows with a bad email, an unknown role, or no areas ticked are skipped and noted in the function log.

## One-time setup (about 5 minutes)

1. Open the sheet and fill in everyone currently in `STAFF_ROLES_JSON`, including yourself as `admin`.
2. **Share** the sheet with the relay service account (the `GOOGLE_SA_CLIENT_EMAIL` value, ending in `iam.gserviceaccount.com`) as **Viewer**, with Notify unticked.
3. Netlify → Site configuration → Environment variables → add `STAFF_ROSTER_SHEET_ID` = `1BT_lEW3aDC9xphKURWFvC3HGsHDteUaEvUWxKICKgEY`.
4. Deploy `2026.10.01.9-WEB` or later.
5. Check: sign in, then sign in with a non-admin account and confirm it sees only its ticked workspaces.
6. Once that works, cut `STAFF_ROLES_JSON` down to just your own admin entry.

Until `STAFF_ROSTER_SHEET_ID` is set, sign-in works exactly as before, from `STAFF_ROLES_JSON`.
