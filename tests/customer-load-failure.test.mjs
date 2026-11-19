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
  assert.match(load, /async function loadCustomerWorkQueue\(forceRefresh = false, clearAccountIndex = false, retried = false, allowStale = false\)/);
  assert.match(load, /if \(!retried && !error\?\.staffAuth\) \{[\s\S]*setTimeout\(resolve, CUSTOMER_LOAD_RETRY_MS\)[\s\S]*return loadCustomerWorkQueue\(forceRefresh, false, true, allowStale\);/);
  assert.match(load, /if \(!customerLoaded\) \{ customerLoadError = error\?\.message \|\| String\(error\); renderCustomerWorkflow\(\); \}/);
  assert.match(index, /customerLoaded = true;\s*customerLoadError = "";/);
  assert.ok(index.indexOf('let customerLoadError = "";') < index.indexOf("function renderCustomerWorkflow(){"), "declared before any render can run");
});

test("until something loads, counts show a dash and the list says it didn't load, not 'No matching'", () => {
  assert.match(render, /const count = value => customerLoaded \? Number\(value \|\| 0\) : "–";/);
  assert.match(render, /\$\("newApplicationsCount"\)\.textContent = count\(summary\.new_applications\);/);
  assert.match(render, /const emptyState = !customerLoaded\s*\? [\s\S]*Orders &amp; Accounts didn't load[\s\S]*: !records\.length \?/);
  assert.match(index, /<strong id="newApplicationsCount">–<\/strong>/);
});

// Karl, 2026-11-19: "once an application is approved, it shouldn't be on the application page any more. they become
// an active customer"
test("Applications starts on open applications; finished ones stay one pick away", () => {
  assert.match(index, /const APPLICATION_FINISHED_STATUSES = \["Approved", "Account active", "Declined"\];/);
  const options = index.slice(index.indexOf("function customerStatusOptions(){"), index.indexOf("function updateCustomerStatusOptions(){"));
  assert.match(options, /if \(customerView === "applications"\) \{\s*return \[\{ value:"all", label:"Open applications" \}, \{ value:"everything", label:"All applications, including finished" \}\]\s*\.concat\(APPLICATION_STATUSES/);
  const view = index.slice(index.indexOf("function customerRecordsForView(){"), index.indexOf("function customerStatusBadge("));
  const statusMatch = new Function("APPLICATION_FINISHED_STATUSES", "customerStatusFilter", "record",
    `return ${view.match(/const statusMatch = (customerView === "applications"\s*\? \([^\n]+\))/)[1].replace('customerView === "applications"', "true")} : null;`);
  const finished = ["Approved", "Account active", "Declined"];
  assert.equal(statusMatch(finished, "all", { workflow_status:"Approved" }), false);
  assert.equal(statusMatch(finished, "all", { workflow_status:"New" }), true);
  assert.equal(statusMatch(finished, "everything", { workflow_status:"Account active" }), true);
  assert.equal(statusMatch(finished, "Approved", { workflow_status:"Approved" }), true);
});
