// PROJECT_STATUS.md "Web release-version rule": the -WEB version is one app-wide release identifier. Before a Netlify
// deploy it must be identical in the index.html header comment, app-version meta tag, footer and APP_VERSION constant,
// and in the staff proxy (inventory.js) and tracking function (go.js) header comments and constants.
// (2026-11-21: go.js's header comment had stayed at .45 while its constant was .92.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const one = (text, pattern, label) => {
  const match = text.match(pattern);
  assert.ok(match, `${label}: version not found`);
  return match[1];
};

test("the -WEB release version matches everywhere the release rule names", async () => {
  const page = await read("index.html");
  const proxy = await read("netlify/functions/inventory.js");
  const tracking = await read("netlify/functions/go.js");
  const found = {
    "index.html header comment": one(page, /<!-- App version: (\S+-WEB) -->/, "index.html header comment"),
    "index.html app-version meta": one(page, /<meta name="app-version" content="([^"]+)"/, "index.html meta"),
    "index.html footer": one(page, /id="appVersionFooter">[^<]*Version (\S+-WEB)/, "index.html footer"),
    "index.html APP_VERSION": one(page, /const APP_VERSION = "([^"]+)"/, "index.html APP_VERSION"),
    "inventory.js header comment": one(proxy, /^\/\/ App version: (\S+)/, "inventory.js header"),
    "inventory.js APP_VERSION": one(proxy, /const APP_VERSION = "([^"]+)"/, "inventory.js APP_VERSION"),
    "go.js header comment": one(tracking, /^\/\/ App version: (\S+)/, "go.js header"),
    "go.js APP_VERSION": one(tracking, /const APP_VERSION = "([^"]+)"/, "go.js APP_VERSION"),
  };
  const release = found["index.html APP_VERSION"];
  assert.match(release, /^\d{4}\.\d{2}\.\d{2}\.\d+-WEB$/);
  const different = Object.entries(found).filter(([, value]) => value !== release).map(([where, value]) => `${where} = ${value}`);
  assert.deepEqual(different, [], `every place must say ${release}`);
});
