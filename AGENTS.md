# Release documentation rule

For every `apps-script/Code.gs` change, update both parts of its leading header before handing off the file or deploying it:

1. Set `App version` to the same version as `APP_VERSION`.
2. Add a concise, accurate entry under `CHANGES IN THIS VERSION` describing the change.
3. When the version number changes, move the previous `CHANGES IN THIS VERSION` notes (relabelled `CHANGES IN <old version>`) to the top of `docs/history/inventory-api-changes.md` (or `docs/history/distribution-outreach-changes.md` for the outreach mailer). The header keeps only the current version, so the file stays short.

Verify the header version, `APP_VERSION`, and the deployment version agree before saying the change is ready.

# Deploy handoff rule

Whenever you ask Karl to paste and deploy a `Code.gs`, name the Apps Script project exactly as it appears in Apps Script **and** the spreadsheet it is attached to. See the "Apps Script projects" table in `PROJECT_STATUS.md`:

- `apps-script/Code.gs` → project **Inventory API**, attached to **Distribution Hub - Inventory Backend**
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
