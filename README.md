# Inventory Netlify App

Version: `2026.08.04.1`

This repo contains:

- `index.html` — Netlify-hosted staff + manager UI
- `netlify/functions/inventory.js` — proxy to Apps Script
- `apps-script/Code.gs` — JSON API backend for Google Apps Script
- `netlify.toml` — Netlify configuration

## Versioning

All deployable files are stamped with the same app version. When updating Apps Script, confirm the `APP_VERSION` value in `apps-script/Code.gs` matches the version shown in this README and the Netlify-hosted app footer.

## Deploy flow

1. Create a new Apps Script project or update your existing backend.
2. Paste `apps-script/Code.gs` into Apps Script.
3. Deploy Apps Script as a Web App.
4. Copy the `/exec` URL.
5. Create a GitHub repo from this folder.
6. Connect the repo to Netlify.
7. Add environment variable:
   - `APPS_SCRIPT_URL` = your Apps Script `/exec` URL
8. Redeploy Netlify.

## Optional auth

If you want API key protection:

- In `apps-script/Code.gs`, set `REQUIRE_API_KEY = true`
- Add Script Property `API_KEY` in Apps Script
- Add Netlify env var `API_KEY`

## Notes

- The manager grid requires `apiGetManagerGrid_()` in the Apps Script backend.
- The frontend uses `/api/inventory`, which is redirected to the Netlify function via `netlify.toml`.
