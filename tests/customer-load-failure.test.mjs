// App version: 2026.11.19.82-WEB
// Karl, 2026-11-19: "why can't i see the 1890 application in the app?" The Orders & Accounts load had timed out, but
// the screen still showed every count as 0 and "No matching applications", so the new application looked missing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const load = index.slice(index.indexOf("async function loadCustomerWorkQueue("), index.indexOf("// Opens the order named in ?order="));
const render = index.slice(index.indexOf("function renderCustomerWorkflow(){"), index.indexOf("function renderCustomerWorkflow(){") + 12000);

test("a failed first load tries once more on its own, then says it didn't load", () => {
  assert.match(load, /async function loadCustomerWorkQueue\(forceRefresh = false, clearAccountIndex = false, retried = false\)/);
  assert.match(load, /if \(!retried && !error\?\.staffAuth\) \{[\s\S]*setTimeout\(resolve, CUSTOMER_LOAD_RETRY_MS\)[\s\S]*return loadCustomerWorkQueue\(forceRefresh, false, true\);/);
  assert.match(load, /if \(!customerLoaded\) \{ customerLoadError = error\?\.message \|\| String\(error\); renderCustomerWorkflow\(\); \}/);
  assert.match(load, /customerLoaded = true;\s*customerLoadError = "";/);
  assert.ok(index.indexOf('let customerLoadError = "";') < index.indexOf("function renderCustomerWorkflow(){"), "declared before any render can run");
});

test("until something loads, counts show a dash and the list says it didn't load, not 'No matching'", () => {
  assert.match(render, /const count = value => customerLoaded \? Number\(value \|\| 0\) : "–";/);
  assert.match(render, /\$\("newApplicationsCount"\)\.textContent = count\(summary\.new_applications\);/);
  assert.match(render, /const emptyState = !customerLoaded\s*\? [\s\S]*Orders &amp; Accounts didn't load[\s\S]*: !records\.length \?/);
  assert.match(index, /<strong id="newApplicationsCount">–<\/strong>/);
});
