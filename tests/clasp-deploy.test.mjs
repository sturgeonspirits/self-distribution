// Karl, 2026-11-19: deploy the Inventory API with clasp instead of pasting Code.gs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const dir = new URL("../apps-script/", import.meta.url);
const read = name => readFile(new URL(name, dir), "utf8");

test("apps-script/ holds every file of the Inventory API project, so a push never deletes one", async () => {
  const files = (await readdir(dir)).filter(name => /\.(gs|js|html)$/.test(name) || name === "appsscript.json").sort();
  assert.deepEqual(files, ["Code.gs", "Index.html", "appsscript.json", "campaignrunner.gs", "profiler.gs"]);
  const manifest = JSON.parse(await read("appsscript.json"));
  assert.deepEqual(manifest.webapp, { executeAs:"USER_DEPLOYING", access:"ANYONE_ANONYMOUS" }, "keeps the web app's access");
  assert.equal(manifest.timeZone, "America/Chicago");
  assert.equal(JSON.parse(await read(".clasp.json")).scriptId, "1mUm3iOIJYpXkd36PsTqvi7uBGlPL7NokZwJLgdtZ3oSJTdCAuN3l9p-b");
});

test("deploy.sh checks the version, pushes and moves the existing deployment", async () => {
  const script = await read("deploy.sh");
  assert.match(script, /DEPLOYMENT_ID="AKfycbx81PgDh7ZdlNbqXvi9ieL3YkD3kKBFdA-bhY6bxZYdL2TUcTT93U4NtsrmSahTbb2E9A"/);
  assert.match(script, /\[ "\$VERSION" != "\$HEADER" \]/);
  assert.match(script, /clasp push --force\n/);
  assert.match(script, /clasp update-deployment "\$DEPLOYMENT_ID" --description "\$VERSION"/);
});
