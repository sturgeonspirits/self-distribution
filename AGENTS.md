# Release documentation rule

The Inventory API lives in `apps-script/01-core.gs` to `apps-script/12-task-manager.gs` (split from the old Code.gs on 2026-11-19; parts load in the `filePushOrder` of `apps-script/.clasp.json`). Put new code in the part for its area, keep each part valid JavaScript on its own, and add a new part to `filePushOrder` and to the header's PARTS list. The version header lives in `01-core.gs`.

For every Inventory API change (any part), update both parts of the header in `apps-script/01-core.gs` before handing off or deploying:

1. Set `App version` to the same version as `APP_VERSION`.
2. Add a concise, accurate entry under `CHANGES IN THIS VERSION` describing the change.
3. When the version number changes, move the previous `CHANGES IN THIS VERSION` notes (relabelled `CHANGES IN <old version>`) to the top of `docs/history/inventory-api-changes.md` (or `docs/history/distribution-outreach-changes.md` for the outreach mailer). The header keeps only the current version, so the file stays short.

Verify the header version, `APP_VERSION`, and the deployment version agree before saying the change is ready.

# Deploy handoff rule

**Inventory API deploys with clasp (2026-11-19).** After the change is pushed to `codex/work` and Karl's Mac checkout is fast-forwarded, Karl runs one command in Terminal: `~/self-distribution-app/apps-script/deploy.sh`. It uploads every file in `apps-script/` (the numbered parts, profiler.gs, campaignrunner.gs, Index.html, appsscript.json) to the project **Inventory API** and moves the live web app deployment to the new version (same URL). The upload replaces the project's files, so any file added in the Apps Script editor must also be added to `apps-script/`. Pasting is no longer practical for the Inventory API (12 files); use deploy.sh.

Whenever you ask Karl to paste and deploy a `Code.gs`, name the Apps Script project exactly as it appears in Apps Script **and** the spreadsheet it is attached to. See the "Apps Script projects" table in `PROJECT_STATUS.md`:

- `apps-script/` (deploy.sh) → project **Inventory API**, attached to **Distribution Hub - Inventory Backend**
- `docs/reference/distribution-outreach/Code.gs` → project **distribution outreach**, attached to **Distribution Hub**
- `docs/reference/badger-parser/Code.gs` → the script in the **Badger Invoice Tracker** (file `Invoice Parser.gs`)

# Status file rule

Keep `PROJECT_STATUS.md` short: current state, open items and one line per recent change. Move detailed write-ups older than about a week to `docs/history/`; never delete history.

# Pushing to GitHub and production

Pushes from this checkout worked until **2026-10-07** (last successful push recorded in `.git/logs`) and have failed since, most likely because the GitHub sign-in saved on the Mac expired. Nothing in the repository's git config changed. Until Karl signs the Mac into GitHub again, a push can fail with an authentication error such as `could not read Username for 'https://github.com'`. Do not try to fix that by changing the remote, creating tokens, or asking Karl for a password.

1. Before committing: `git fetch origin`, make sure you are on `codex/work` and that `origin/codex/work` is an ancestor of your commit (`git merge-base --is-ancestor origin/codex/work HEAD`). If it is not, rebase onto `origin/codex/work` **before** committing your final version. Never reuse a version number already on `origin/codex/work`.
2. One commit per change, including `PROJECT_STATUS.md` in the same commit. Run `node --test tests/*.mjs tests/*.cjs`; all must pass. Leave no uncommitted changes.
3. Try the push once: `GIT_TERMINAL_PROMPT=0 git push origin codex/work`. Push to production only when Karl asks: `GIT_TERMINAL_PROMPT=0 git push origin codex/work:codex/distribution-system-foundation` (fast-forward only).
4. If it fails for authentication: stop. Do not amend, rebase or squash the commit afterwards (Claude pushes the exact SHA). Give Karl this one line to paste to Claude:

   `Claude: push <full commit SHA> from ~/self-distribution-app to codex/work` (add `and production` if Karl wants it live)

5. Claude then checks the commit sits on top of `origin/codex/work`, runs the tests, carries the exact commit to GitHub (same SHA), promotes it if asked, confirms the live version, and fast-forwards this checkout.

Once Karl signs this Mac into GitHub again (for example `gh auth login` followed by `gh auth setup-git`, or GitHub Desktop), step 3 works directly and step 4 is only a fallback.
