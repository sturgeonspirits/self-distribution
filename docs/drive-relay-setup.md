# Drive Response Relay — One-Time Setup

Why: Google's Apps Script web-app response handoff to Netlify stalls or returns an HTML 404, even when the script finished in 1–8 seconds (confirmed 2026-09-25 from Apps Script Executions and Netlify logs). With the relay, every Inventory API response is also written to a Drive "slot" file. The Netlify staff proxy reads that file directly and uses whichever copy arrives first. Each request still runs exactly once in Apps Script.

The relay stays off until all three Netlify variables in part C are set. Until then the app behaves exactly as before.

## A. Apps Script (about 2 minutes)
1. Paste `apps-script/Code.gs` (`2026.09.24.48` or later) into the Inventory API project and save.
2. Select `setupDriveRelay` and click **Run**. Approve the new Google Drive permission when asked.
3. Copy two values from the Execution log: `folder_url` and `RELAY_MANIFEST_FILE_ID`.
4. Deploy → Manage deployments → pencil → **New version** → Deploy. This makes the web app use the new Drive permission.

## B. Google Cloud service account (about 8 minutes)
1. Go to https://console.cloud.google.com/ and sign in as sturgeonspirits@gmail.com.
2. Create a project, for example `distribution-hub-relay` (top bar → project picker → **New project**).
3. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
4. **IAM & Admin → Service Accounts → Create service account.** Name it `hub-relay`, click **Done**, and grant no roles.
5. Open the new account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
6. Open the relay folder from `folder_url` in Drive → **Share** → paste the service account's email (it ends in `iam.gserviceaccount.com`) → **Viewer** → uncheck **Notify** → **Share**.

## C. Netlify (about 2 minutes)
Site → **Site configuration → Environment variables → Add a variable**, for functions:

| Key | Value |
| --- | --- |
| `GOOGLE_SA_CLIENT_EMAIL` | `client_email` from the JSON key file |
| `GOOGLE_SA_PRIVATE_KEY` | `private_key` from the JSON key file, pasted exactly (the `\n` sequences may stay as they are) |
| `RELAY_MANIFEST_FILE_ID` | the value from part A |

Netlify limits the total size of function environment variables to about 4 KB. The private key uses about 1.7 KB. If the deploy reports that the environment is too large, send the error message.

Then push the patch, or trigger a deploy, so the functions pick up the variables. Keep the JSON key file private and never commit it. Delete it once the variables are saved.

## Checking it works
- Normal use: screens load and Approve and Send answer even when the old route stalls.
- Netlify function logs show `Inventory API relay request failed` only if both routes failed.
- If `setupDriveRelay` reports a permission or scope error, stop and send the error message. Do not change the manifest by hand.
