// App version: 2026.11.19.84-APP / 2026.11.19.85-WEB
// Karl, 2026-11-19: speed fixes 1-3. Each change clears only the screens it affects, an out-of-date copy is shown at
// once while a rebuild runs, and the refresh button no longer re-reads the Badger tracker or rebuilds twice.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readBackend } from "./helpers/backend-source.mjs";

const backend = await readBackend();
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const proxy = await readFile(new URL("../netlify/functions/inventory.js", import.meta.url), "utf8");

const constants = backend.slice(backend.indexOf('const READ_CACHE_VERSION_KEY'), backend.indexOf('const READ_ACTIONS'));
const actionGroups = backend.slice(backend.indexOf("const READ_CACHE_ACTION_GROUPS"), backend.indexOf("let __OPERATIONAL_SS"));
const helpers = backend.slice(backend.indexOf("function readCacheGroupKey_("), backend.indexOf("const READ_CACHE_BUILDERS"));
const warmer = backend.slice(backend.indexOf("function warmHubReadCaches()"), backend.indexOf("function onHubReadCacheSpreadsheetChange"));

function harness(){
  const props = new Map();
  const store = new Map();
  let now = Date.UTC(2026, 10, 19, 21, 0, 0);
  let uuid = 0;
  const env = {
    PropertiesService:{ getScriptProperties:() => ({
      getProperty:key => props.has(key) ? props.get(key) : null,
      setProperties:values => Object.entries(values).forEach(([key, value]) => props.set(key, value)),
    }) },
    CacheService:{ getScriptCache:() => ({
      get:key => store.has(key) ? store.get(key) : null,
      getAll:keys => Object.fromEntries(keys.filter(key => store.has(key)).map(key => [key, store.get(key)])),
      put:(key, value) => store.set(key, value),
      putAll:values => Object.entries(values).forEach(([key, value]) => store.set(key, value)),
      remove:key => store.delete(key),
      removeAll:keys => keys.forEach(key => store.delete(key)),
    }) },
    Utilities:{ getUuid:() => `uuid-${++uuid}-0000`, formatDate:() => "12" },
    Session:{ getScriptTimeZone:() => "America/Chicago" },
  };
  const builds = { outreach_slim:0, customer_work_queue:0, inventory_stores:0 };
  const realNow = Date.now;
  const lib = new Function(...Object.keys(env), "builds", `
    ${constants}
    ${actionGroups}
    ${helpers}
    const READ_CACHE_BUILDERS = {
      outreach_slim:() => ({ ok:true, n:++builds.outreach_slim }),
      customer_work_queue:() => ({ ok:true, n:++builds.customer_work_queue }),
      inventory_stores:() => ({ ok:true, n:++builds.inventory_stores }),
    };
    ${warmer}
    return { bumpReadCacheVersion_, cachedReadPayload_, warmHubReadCaches, READ_CACHE_ACTION_GROUPS, READ_CACHE_BUILDERS };
  `)(...Object.values(env), builds);
  return {
    lib, builds, store,
    at:(fn) => { Date.now = () => now; try { return fn(); } finally { Date.now = realNow; } },
    advance:minutes => { now += minutes * 60000; },
  };
}

const read = (h, scope, bypass, mode) => h.at(() => h.lib.cachedReadPayload_(scope, h.lib.READ_CACHE_BUILDERS[scope], bypass, mode));

test("a change clears only the screens it affects", () => {
  const h = harness();
  assert.equal(read(h, "outreach_slim").n, 1);
  assert.equal(read(h, "customer_work_queue").n, 1);
  h.at(() => h.lib.bumpReadCacheVersion_(h.lib.READ_CACHE_ACTION_GROUPS.updateOutreachOutcome));
  const orders = read(h, "customer_work_queue");
  assert.equal(orders.n, 1);
  assert.equal(orders.cache_stale, false, "recording an outcome leaves Orders & Accounts current");
  const outreach = read(h, "outreach_slim");
  assert.equal(outreach.n, 1, "Outreach comes back at once from the saved copy...");
  assert.equal(outreach.cache_stale, true, "...marked out of date");
  assert.deepEqual(h.lib.READ_CACHE_ACTION_GROUPS.markBadgerInvoicePayment, ["customers"]);
  assert.deepEqual(h.lib.READ_CACHE_ACTION_GROUPS.previewBadgerInvoice, [], "previews change nothing");
  h.at(() => h.lib.bumpReadCacheVersion_([]));
  assert.equal(read(h, "customer_work_queue").cache_stale, false, "an empty list clears nothing");
  h.at(() => h.lib.bumpReadCacheVersion_());
  assert.equal(read(h, "customer_work_queue").cache_stale, true, "no list clears everything");
});

test("the page's follow-up rebuilds a stale copy once, and a second asker gets the copy while it runs", () => {
  const h = harness();
  read(h, "customer_work_queue");
  h.at(() => h.lib.bumpReadCacheVersion_(["customers"]));
  h.store.set("hub_read:customer_work_queue:rebuilding", "1");
  const waiting = read(h, "customer_work_queue", false, "rebuild");
  assert.equal(waiting.n, 1);
  assert.equal(waiting.cache_rebuilding, true);
  h.store.delete("hub_read:customer_work_queue:rebuilding");
  const rebuilt = read(h, "customer_work_queue", false, "rebuild");
  assert.equal(rebuilt.n, 2);
  assert.equal(rebuilt.cache_stale, false);
  assert.equal(read(h, "customer_work_queue").n, 2, "later reads get the rebuilt copy");
  assert.equal(h.store.has("hub_read:customer_work_queue:rebuilding"), false, "the guard is cleared after a rebuild");
  assert.equal([...h.store.keys()].filter(key => /^hub_read:customer_work_queue:uuid-/.test(key)).length, 1, "the replaced copy is removed");
});

test("a copy is current for 15 minutes; after that it is shown stale, and the warmer catches up changed screens", () => {
  const h = harness();
  read(h, "outreach_slim"); read(h, "customer_work_queue"); read(h, "inventory_stores");
  h.advance(16);
  assert.equal(read(h, "inventory_stores").cache_stale, true);
  assert.equal(h.at(() => h.lib.warmHubReadCaches()).message, "Hub read caches already current.", "unchanged copies wait until an hour old");
  h.at(() => h.lib.bumpReadCacheVersion_(["customers"]));
  assert.match(h.at(() => h.lib.warmHubReadCaches()).message, /customer_work_queue/);
  assert.equal(h.builds.customer_work_queue, 2);
});

test("the refresh button reuses Badger data and the proxy never retries a rebuild", () => {
  assert.match(backend, /_refresh_sources:String\(p\?\.sources \|\| ""\) === "1"/);
  assert.match(backend, /const ledger = buildCustomerAccounts_\(applications, orders, !!p\?\._refresh_sources\);/);
  assert.match(proxy, /attempts:rebuilds \? 1 : READ_UPSTREAM_ATTEMPTS/);
  assert.match(proxy, /const rebuilds = request\.params\.get\("refresh"\) === "1" \|\| request\.params\.get\("rebuild"\) === "1";/);
});

test("background jobs rebuild what they changed; staff presses don't wait for it", () => {
  assert.match(backend, /bumpReadCacheVersion_\(\["outreach"\]\);\s*rebuildReadCaches_\(\["outreach"\]\); \/\/ so the next Outreach load/);
  assert.match(backend, /if \(trigger === "Schedule"\) rebuildReadCaches_\(\["outreach"\]\);/);
  assert.match(backend, /bumpReadCacheVersion_\(\["inventory", "customers"\]\);\s*rebuildReadCaches_\(\["inventory"\]\);/);
});

test("the page shows a stale copy only when opening a section, then swaps in the rebuilt one", () => {
  assert.match(index, /async function followUpStaleRead\(params, isCurrent, apply\)/);
  assert.match(index, /loadCustomerWorkQueue\(false, false, false, true\)\.catch\(handleCustomerError\)/);
  assert.match(index, /loadOutreach\(false, true\)\.catch\(handleOutreachLoadError\)/);
  assert.match(index, /action:"customerWorkQueue", \.\.\.\(forceRefresh \? \{ refresh:1 \} : allowStale \? \{\} : \{ rebuild:1 \}\)/);
  assert.match(index, /if \(pendingOrderLink \|\| pendingApplicationLink\) allowStale = false;/);
  assert.match(index, /if \(customerDataStale && !\(customerData\.applications \|\| \[\]\)\.some/);
});
