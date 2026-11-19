#!/bin/bash
# Deploys this folder to the Apps Script project "Inventory API" (attached to Distribution Hub - Inventory Backend)
# and moves the live web app deployment to the new version. The web app URL does not change.
#
# One-time setup on the Mac: sudo npm install -g @google/clasp, turn on the Apps Script API at
# script.google.com/home/usersettings, then clasp login (as the account that owns the project).
#
# Run from anywhere:  ~/self-distribution-app/apps-script/deploy.sh
# The push replaces every file in the Apps Script project with the files in this folder (Code.gs, profiler.gs,
# campaignrunner.gs, Index.html, appsscript.json). Add a file here, not only in the editor, or the next deploy removes it.
set -euo pipefail
cd "$(dirname "$0")"

DEPLOYMENT_ID="AKfycbx81PgDh7ZdlNbqXvi9ieL3YkD3kKBFdA-bhY6bxZYdL2TUcTT93U4NtsrmSahTbb2E9A"

VERSION="$(sed -n 's/^const APP_VERSION = "\(.*\)";$/\1/p' Code.gs | head -1)"
HEADER="$(sed -n 's/^ \* App version: //p' Code.gs | head -1)"
if [ -z "$VERSION" ] || [ "$VERSION" != "$HEADER" ]; then
  echo "Stopped: Code.gs header says '$HEADER' but APP_VERSION is '$VERSION'. Fix the header first." >&2
  exit 1
fi

if ! command -v clasp >/dev/null 2>&1; then
  echo "Stopped: clasp isn't installed. Run: sudo npm install -g @google/clasp" >&2
  exit 1
fi

if [ -n "$(git status --porcelain -- . 2>/dev/null)" ]; then
  echo "Note: this folder has changes that aren't committed; they will be deployed as they are."
fi

echo "Uploading Inventory API $VERSION..."
clasp push --force
echo "Moving the live web app to the new version..."
clasp update-deployment "$DEPLOYMENT_ID" --description "$VERSION"
echo "Done: Inventory API $VERSION is live."
