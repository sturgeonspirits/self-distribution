// Karl, 2026-11-19: deploy the Inventory API with clasp instead of pasting Code.gs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const dir = new URL("../apps-script/", import.meta.url);
const read = name => readFile(new URL(name, dir), "utf8");

test("apps-script/ holds every file of the Inventory API project, so a push never deletes one", async () => {
  const files = (await readdir(dir)).filter(name => /\.(gs|js|html)$/.test(name) || name === "appsscript.json").sort();
  const parts = JSON.parse(await read(".clasp.json")).filePushOrder;
  assert.equal(parts.length, 12);
  assert.deepEqual(files, [...parts, "Index.html", "appsscript.json", "campaignrunner.gs", "profiler.gs"].sort());
  assert.ok(!files.includes("Code.gs"), "the old single file is gone, so nothing is declared twice");
  const manifest = JSON.parse(await read("appsscript.json"));
  assert.deepEqual(manifest.webapp, { executeAs:"USER_DEPLOYING", access:"ANYONE_ANONYMOUS" }, "keeps the web app's access");
  assert.equal(manifest.timeZone, "America/Chicago");
  assert.equal(JSON.parse(await read(".clasp.json")).scriptId, "1mUm3iOIJYpXkd36PsTqvi7uBGlPL7NokZwJLgdtZ3oSJTdCAuN3l9p-b");
});

test("deploy.sh checks the version, pushes and moves the existing deployment", async () => {
  const script = await read("deploy.sh");
  assert.match(script, /DEPLOYMENT_ID="AKfycbx81PgDh7ZdlNbqXvi9ieL3YkD3kKBFdA-bhY6bxZYdL2TUcTT93U4NtsrmSahTbb2E9A"/);
  assert.match(script, /\[ "\$VERSION" != "\$HEADER" \]/);
  assert.match(script, /01-core\.gs \| head -1\)"/);
  assert.match(script, /if \[ -e Code\.gs \]; then/);
  assert.match(script, /clasp push --force\n/);
  assert.match(script, /clasp update-deployment "\$DEPLOYMENT_ID" --description "\$VERSION"/);
});

// Karl, 2026-11-19: Code.gs split into 12 parts (2026.11.19.86-APP).
test("each part parses on its own, the parts load in their old order, and each top-level name is declared once", async () => {
  const parts = JSON.parse(await read(".clasp.json")).filePushOrder;
  assert.deepEqual(parts, [...parts].sort(), "numbered names sort into load order, even without filePushOrder");
  const seen = new Map();
  for (const name of parts) {
    const text = await read(name);
    assert.doesNotThrow(() => new Function(text), `${name} must be valid JavaScript by itself`);
    for (const match of text.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)|^(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
      const id = match[1] || match[2];
      assert.ok(!seen.has(id), `${id} is declared in both ${seen.get(id)} and ${name}`);
      seen.set(id, name);
    }
  }
  assert.ok(seen.size > 500, `only ${seen.size} top-level names found`);
  const core = await read("01-core.gs");
  assert.match(core, /const APP_VERSION = "([^"]+)";/);
  assert.equal(core.match(/ \* App version: (\S+)/)[1], core.match(/const APP_VERSION = "([^"]+)";/)[1]);
});
