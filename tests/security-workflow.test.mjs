// App version: 2026.09.23.5-WEB
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHmac } from "node:crypto";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

async function renderSellSheet(data, bottleMap = { by_sku:{}, by_name:{} }) {
  const page = await readFile(new URL("sell-sheet.html", root), "utf8");
  const script = page.match(/<script>\n([\s\S]*?)\n<\/script>/)?.[1];
  if (!script) throw new Error("sell-sheet inline script missing");
  const prior = { document:globalThis.document, fetch:globalThis.fetch, location:globalThis.location, print:globalThis.print };
  const sheet = { className:"", innerHTML:"" };
  const printButton = { addEventListener() {} };
  let calls = 0;
  globalThis.document = { getElementById:id => id === "sellSheet" ? sheet : id === "printButton" ? printButton : null };
  globalThis.location = { protocol:"https:", search:"" };
  globalThis.print = () => {};
  globalThis.fetch = async () => ({ ok:true, json:async () => ++calls === 1 ? bottleMap : data });
  try {
    new Function(script)();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { html:sheet.innerHTML, className:sheet.className };
  } finally {
    globalThis.document = prior.document;
    globalThis.fetch = prior.fetch;
    globalThis.location = prior.location;
    globalThis.print = prior.print;
  }
}

async function loadFunction(path, suffix = Math.random(), { useRealRoster = false } = {}) {
  let source = await readFile(new URL(path, root), "utf8");
  const dataUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}#${suffix}`;
  const relay = await readFile(new URL("netlify/lib/drive-relay.js", root), "utf8");
  const relayUrl = dataUrl(relay);
  const roster = (await readFile(new URL("netlify/lib/staff-roster.js", root), "utf8")).replace('from "./drive-relay.js";', `from "${relayUrl}";`);
  const rosterUrl = dataUrl(roster);
  const authSource = () => readFile(new URL("netlify/functions/auth.js", root), "utf8").then(text => {
    const testRoster = `async function loadStaffRoster() {
  try {
    const raw = JSON.parse(process.env.TEST_STAFF_ROSTER_JSON || process.env.STAFF_ROLES_JSON || "{}");
    const entries = Object.entries(raw || {}).reduce((result, [email, value]) => {
      const role = typeof value === "string" ? value : value?.role;
      const areas = role === "admin" ? ["inventory", "outreach", "orders"] : (value?.areas || ["inventory", "outreach", "orders"]);
      if (["staff", "admin"].includes(role) && Array.isArray(areas) && areas.length) result[String(email).trim().toLowerCase()] = { role, areas };
      return result;
    }, {});
    return { source:"sheet", entries };
  } catch (_) { return { source:"unavailable" }; }
}`;
    return useRealRoster
      ? text.replace('from "../lib/staff-roster.js";', `from "${rosterUrl}";`)
      : text.replace('import { loadStaffRoster } from "../lib/staff-roster.js";', testRoster);
  });
  if (path === "netlify/lib/staff-roster.js") source = roster;
  if (path === "netlify/functions/auth.js") source = await authSource();
  if (path === "netlify/functions/inventory.js") {
    source = source.replace('from "./auth.js";', `from "${dataUrl(await authSource())}";`);
    source = source.replace('from "../lib/drive-relay.js";', `from "${relayUrl}";`);
  }
  if (path === "netlify/functions/sell-sheet.js") source = source.replace('from "./auth.js";', `from "${dataUrl(await authSource())}";`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${suffix}`);
}

function staffSession({ email = "staff@sturgeonspirits.com", name = "Staff Member", sub = "zoho-user-1", exp = Math.floor(Date.now() / 1000) + 3600, role, areas } = {}) {
  const encoded = Buffer.from(JSON.stringify({ email, name, sub, exp, ...(role ? { role, areas } : {}) })).toString("base64url");
  const signature = createHmac("sha256", process.env.APP_SESSION_SECRET).update(encoded).digest("base64url");
  return `distribution_staff_session=${encodeURIComponent(`${encoded}.${signature}`)}`;
}

function event(action, options = {}) {
  const method = options.method || "POST";
  return {
    httpMethod:method,
    headers:{
      ...(options.session ? { cookie:options.session } : {}),
      "x-nf-client-connection-ip":options.ip || "192.0.2.10",
    },
    queryStringParameters:method === "GET" ? { action } : {},
    rawQuery:method === "GET" ? `action=${encodeURIComponent(action)}` : "",
    body:method === "POST" ? JSON.stringify({ action, ...(options.body || {}) }) : "",
  };
}

test("every inventory action rejects a missing Zoho session before proxying", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "unauthenticated-actions");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"staff"}';
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error("should not proxy"); };
  const actions = ["initData", "listSkus", "addSkuToStore", "upsertProduct", "submitCounts", "createReorder", "managerGrid", "salesSinceCount", "updateStoreContacts", "outreachSendStatus", "outreachNewsletterContacts", "updateOutreachCampaignRecipient", "setOutreachCampaignRecipientExclusion"];
  for (const action of actions) {
    const response = await handler(event(action, { method:["managerGrid", "outreachSendStatus", "outreachNewsletterContacts"].includes(action) ? "GET" : "POST", ip:`192.0.2.${actions.indexOf(action) + 10}` }));
    assert.equal(response.statusCode, 401, action);
    assert.equal(JSON.parse(response.body).code, "STAFF_AUTH_REQUIRED", action);
  }
  assert.equal(fetches, 0);
});

test("duplicate and unknown inventory actions are rejected before authentication or proxying", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "invalid-actions");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error("should not proxy"); };
  const duplicate = event("managerGrid", { method:"GET" });
  duplicate.rawQuery = "action=managerGrid&action=initData";
  const duplicateResponse = await handler(duplicate);
  assert.equal(duplicateResponse.statusCode, 400);
  assert.equal(JSON.parse(duplicateResponse.body).code, "INVALID_ACTION");
  const unknownResponse = await handler(event("notAnInventoryAction", { method:"GET" }));
  assert.equal(unknownResponse.statusCode, 400);
  assert.equal(JSON.parse(unknownResponse.body).code, "UNKNOWN_ACTION");
  assert.equal(fetches, 0);
});

// 2026.10.02.13-WEB: the staging migration action must not be reachable from the live app.
test("the Hub migration action is not proxied and has no button", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "no-hub-migration");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error("should not proxy"); };
  const refused = await handler(event("initializeHardenedHub", { method:"POST", body:{ confirmation:"STAGING ONLY", staff_name:"Admin" } }));
  assert.equal(refused.statusCode, 400);
  assert.equal(JSON.parse(refused.body).code, "UNKNOWN_ACTION");
  assert.equal(fetches, 0);
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.doesNotMatch(html, /id="initializeHubBtn"/);
  assert.doesNotMatch(html, /action:"initializeHardenedHub"/);
});

test("inventory staff can see the read-only product and location summary", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const proxy = await readFile(new URL("netlify/functions/inventory.js", root), "utf8");
  assert.match(html, /id="inventorySummaryViewBtn"/);
  assert.match(html, /id="inventorySummaryView"/);
  assert.match(html, /function inventorySummaryRows\(\)/);
  assert.match(html, /inventorySummaryRows\(\)\.filter\(row => row\.onHand > 0\)/);
  assert.match(html, /Available inventory/);
  assert.match(html, /inventoryItems\.length/);
  assert.match(proxy, /\["managerGrid", "inventory"\]/);
  assert.doesNotMatch(proxy.match(/const ADMIN_ACTIONS = new Set\(\[([\s\S]*?)\]\);/)[1], /managerGrid/);
});

test("authenticated inventory GET and POST preserve action payload, API key, and Zoho actor", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "authenticated-regression");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"staff"}';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    return new Response(JSON.stringify({ ok:true, version:"2026.09.18.3-WEB" }), { status:200 });
  };
  const session = staffSession();
  const getResponse = await handler(event("managerGrid", { method:"GET", session, ip:"198.51.100.1" }));
  const postResponse = await handler(event("submitCounts", { session, ip:"198.51.100.1", body:{ store_id:"S1", rep:"Untrusted", items:[{ sku_id:"SKU", counted:1 }] } }));
  assert.equal(getResponse.statusCode, 200);
  assert.match(calls[0].url, /action=managerGrid/);
  assert.match(calls[0].url, /api_key=backend-key/);
  assert.match(calls[1].url, /api_key=backend-key/);
  const forwarded = JSON.parse(calls[1].options.body);
  assert.equal(forwarded.action, "submitCounts");
  assert.equal(forwarded.api_key, "backend-key");
  assert.equal(forwarded.staff_name, "Staff Member");
  assert.equal(forwarded.rep, "Staff Member");
  assert.equal(JSON.parse(postResponse.body).ok, true);
});

test("inventory proxy lets fetch follow Apps Script redirects and classifies HTML", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "redirect-regression");
  process.env.APPS_SCRIPT_URL = "https://script.google.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"staff"}';
  let calls = 0;
  let redirectMode = "";
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    redirectMode = options.redirect;
    return new Response(JSON.stringify({ ok:true, version:"2026.09.18.3-WEB" }), { status:200 });
  };
  const redirected = await handler(event("managerGrid", { method:"GET", session:staffSession() }));
  assert.equal(redirected.statusCode, 200);
  assert.equal(JSON.parse(redirected.body).version, "2026.09.18.3-WEB");
  assert.equal(calls, 1);
  assert.equal(redirectMode, "follow");

  globalThis.fetch = async () => new Response("<!doctype html><title>Page Not Found</title>", { status:200, headers:{ "content-type":"text/html" } });
  const invalid = await handler(event("managerGrid", { method:"GET", session:staffSession() }));
  assert.equal(invalid.statusCode, 502);
  assert.equal(JSON.parse(invalid.body).code, "UPSTREAM_NON_JSON");
  assert.match(JSON.parse(invalid.body).error, /text\/html instead of JSON/);

  globalThis.fetch = async () => new Response("<!doctype html><title>Sign in to continue</title>", { status:200, headers:{ "content-type":"text/html" } });
  const signIn = await handler(event("managerGrid", { method:"GET", session:staffSession() }));
  assert.match(JSON.parse(signIn.body).error, /sign-in page/i);
});

test("email sends use one non-retrying upstream attempt", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "send-no-retry");
  process.env.APPS_SCRIPT_URL = "https://script.google.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"staff"}';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("connection ended");
  };
  const result = await handler(event("sendOutreachEmail", {
    session:staffSession(),
    body:{ business:"Cellars Wines & Spirits", idempotency_token:"12345678901234567890" },
  }));
  assert.equal(calls, 1);
  assert.equal(result.statusCode, 500);
  assert.match(JSON.parse(result.body).error, /send connection failed before Zoho confirmation/i);
});

test("campaign snapshots use one controlled upstream attempt", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "campaign-snapshot-no-retry");
  process.env.APPS_SCRIPT_URL = "https://script.google.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"staff"}';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("connection ended");
  };
  const result = await handler(event("createOutreachCampaign", {
    session:staffSession(),
    body:{ campaign_name:"Initial prospect campaign" },
  }));
  assert.equal(calls, 1);
  assert.equal(result.statusCode, 500);
  assert.match(JSON.parse(result.body).error, /campaign creation connection failed/i);
});

test("Drive relay slot hashing matches between Apps Script and Netlify", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const gsSource = script.slice(script.indexOf("function relaySlotIndex_"), script.indexOf("function relaySlotIds_"));
  const gsIndex = new Function("RELAY_SLOT_COUNT", `${gsSource}; return relaySlotIndex_;`)(32);
  const relay = await readFile(new URL("netlify/lib/drive-relay.js", root), "utf8");
  const { relaySlotIndex } = await import(`data:text/javascript;base64,${Buffer.from(relay).toString("base64")}`);
  for (let index = 0; index < 200; index += 1) {
    const id = randomUUID();
    assert.equal(gsIndex(id), relaySlotIndex(id));
  }
});

async function relayHandler(suffix, directBehavior) {
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength:2048 });
  process.env.APPS_SCRIPT_URL = "https://script.google.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"staff"}';
  process.env.GOOGLE_SA_CLIENT_EMAIL = "relay@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SA_PRIVATE_KEY = privateKey.export({ type:"pkcs8", format:"pem" }).replace(/\n/g, "\\n");
  process.env.RELAY_MANIFEST_FILE_ID = "manifest-id";
  const slots = Array.from({ length:32 }, (_, index) => `slot-${index}`);
  const calls = { apps:0, relayId:"" };
  const relayed = { ok:true, source:"relay", records:[1, 2, 3] };
  globalThis.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token:"token", expires_in:3600 }), { status:200 });
    if (text.includes("/drive/v3/files/manifest-id")) return new Response(JSON.stringify({ slots }), { status:200 });
    if (text.includes("/drive/v3/files/slot-")) {
      return new Response(JSON.stringify(calls.relayId ? { relay_id:calls.relayId, body:JSON.stringify(relayed) } : {}), { status:200 });
    }
    calls.apps += 1;
    calls.relayId = new URL(text).searchParams.get("relay_id") || "";
    return directBehavior(options);
  };
  const { handler } = await loadFunction("netlify/functions/inventory.js", suffix);
  return { handler, calls, relayed };
}

function clearRelayEnv() {
  delete process.env.GOOGLE_SA_CLIENT_EMAIL;
  delete process.env.GOOGLE_SA_PRIVATE_KEY;
  delete process.env.RELAY_MANIFEST_FILE_ID;
}

test("Drive relay answers when Google's direct response stalls or returns an HTML 404", async () => {
  try {
    const stalled = await relayHandler("relay-stall", options => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name:"AbortError" })))));
    const result = await stalled.handler(event("outreachDashboard", { method:"GET", session:staffSession() }));
    assert.equal(stalled.calls.apps, 1);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(JSON.parse(result.body), stalled.relayed);

    const htmlError = await relayHandler("relay-404", async () => new Response("<html><title>Page Not Found</title></html>", { status:404, headers:{ "content-type":"text/html" } }));
    const post = await htmlError.handler(event("approveOutreachCampaign", { method:"POST", session:staffSession(), body:{ campaign_id:"CMP-1", audience_checksum:"x", recipient_count:1 } }));
    assert.equal(htmlError.calls.apps, 1, "a write is sent to Apps Script exactly once");
    assert.equal(post.statusCode, 200);
    assert.deepEqual(JSON.parse(post.body), htmlError.relayed);
  } finally {
    clearRelayEnv();
  }
});

test("Drive relay still uses a fast direct response", async () => {
  try {
    const fast = await relayHandler("relay-fast", async () => new Response(JSON.stringify({ ok:true, source:"direct" }), { status:200, headers:{ "content-type":"application/json" } }));
    const result = await fast.handler(event("outreachCampaigns", { method:"GET", session:staffSession() }));
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).source, "direct");
  } finally {
    clearRelayEnv();
  }
});

test("every staff request shows busy feedback", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /<div id="apiBusyBar" aria-hidden="true"><\/div>/);
  const get = page.slice(page.indexOf("async function staffApiGet"), page.indexOf("async function staffApiPost"));
  const post = page.slice(page.indexOf("async function staffApiPost"), page.indexOf("function refreshIcons"));
  assert.match(get, /return withApiBusy\(/);
  assert.match(post, /return withApiBusy\(/);
  assert.match(page, /button\.is-busy \{ opacity:\.6; cursor:progress; pointer-events:none; \}/);
});

test("first inventory load reports on the Inventory screen and retries once", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.doesNotMatch(page, /loadStartup\(\)\.catch\(handleCustomerError\)/);
  assert.match(page, /if \(staffAccessCode && !inventoryLoaded\) startInventory\(\);/);
  const start = page.slice(page.indexOf("function startInventory"), page.indexOf("async function loadStartup"));
  assert.match(start, /if \(inventoryStartupPromise\) return inventoryStartupPromise;/);
  assert.match(start, /setTimeout\(resolve, 1500\)\)\.then\(attempt\)/);
  assert.match(start, /\$\("inventoryAccessStatus"\)\.textContent = `Couldn't load inventory/);
  assert.match(page, /id="retryInventoryBtn"/);
  const startup = page.slice(page.indexOf("async function loadStartup"), page.indexOf("function resetCounts"));
  assert.ok(startup.indexOf("const storeRequest") < startup.indexOf('staffApiGet({ action:"initData", ...('), "remembered store loads alongside the store list");
});

test("staff proxy unpacks compressed read responses", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "compressed-read");
  const { gzipSync } = await import("node:zlib");
  process.env.APPS_SCRIPT_URL = "https://script.google.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"staff"}';
  const original = { ok:true, records:[{ business:"Acme Tap", city:"Neenah" }] };
  let requestedUrl = "";
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    const packed = gzipSync(Buffer.from(JSON.stringify(original))).toString("base64");
    return new Response(JSON.stringify({ ok:true, gzip_b64:packed }), { status:200, headers:{ "content-type":"application/json" } });
  };
  const result = await handler(event("outreachDashboard", { method:"GET", session:staffSession() }));
  assert.match(requestedUrl, /[?&]gz=1(&|$)/);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), original);
});

test("campaign review reads retry once within the proxy limit", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "campaign-review-no-retry");
  process.env.APPS_SCRIPT_URL = "https://script.google.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"staff"}';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("connection ended");
  };
  const result = await handler(event("outreachCampaigns", { method:"GET", session:staffSession() }));
  assert.equal(calls, 2);
  assert.equal(result.statusCode, 500);
  assert.match(JSON.parse(result.body).error, /campaign review connection failed/i);
});

test("roles and workspace areas are enforced server-side and revoked users lose access immediately", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "roles");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":{"role":"staff","areas":["inventory","outreach"]}}';
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response(JSON.stringify({ ok:true }), { status:200 }); };
  const session = staffSession();
  const blocked = await handler(event("upsertProduct", { session }));
  assert.equal(blocked.statusCode, 403);
  assert.equal(JSON.parse(blocked.body).code, "STAFF_ROLE_FORBIDDEN");
  const mileageAdminOnly = await handler(event("recalculateOutreachMiles", { session }));
  assert.equal(mileageAdminOnly.statusCode, 403);
  assert.equal(JSON.parse(mileageAdminOnly.body).code, "STAFF_ROLE_FORBIDDEN");
  const areaBlocked = await handler(event("customerWorkQueue", { method:"POST", session }));
  assert.equal(areaBlocked.statusCode, 403);
  assert.equal(JSON.parse(areaBlocked.body).code, "STAFF_AREA_FORBIDDEN");
  assert.equal(fetches, 0);
  process.env.STAFF_ROLES_JSON = "{}";
  const revoked = await handler(event("initData", { session }));
  assert.equal(revoked.statusCode, 401);
  assert.equal(fetches, 0);
});

test("campaign bulk exclusion and external contact logging remain staff-scoped", async () => {
  const source = await readFile(new URL("netlify/functions/inventory.js", root), "utf8");
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  assert.match(source, /"setOutreachCampaignRecipientExclusions"/);
  assert.match(source, /"logOutreachContact"/);
  assert.match(script, /function apiSetOutreachCampaignRecipientExclusions_/);
  assert.match(script, /function apiLogOutreachContact_/);
  assert.match(script, /Sent recipients cannot be excluded/);
});

test("Badger invoice links are staff-scoped and ledger matching stays account-based", async () => {
  const source = await readFile(new URL("netlify/functions/inventory.js", root), "utf8");
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(source, /"linkBadgerInvoice"/);
  assert.match(source, /\["linkBadgerInvoice", "orders"\]/);
  assert.doesNotMatch(source, /searchCustomerAccounts/);
  assert.match(source, /"customerAccountIndex"/);
  assert.match(source, /\["customerAccountIndex", "orders"\]/);
  assert.match(script, /const BADGER_INVOICE_LINKS_SHEET_NAME = "Badger Invoice Links"/);
  assert.match(script, /function apiLinkBadgerInvoice_\(p\)/);
  assert.doesNotMatch(script, /apiSearchCustomerAccounts_/);
  assert.match(script, /function apiGetCustomerAccountIndex_\(p\)/);
  assert.match(script, /cachedReadPayload_\("customer_account_index"/);
  assert.match(script, /event:"customer_account_index_cache_rebuild"/);
  const ledger = script.slice(script.indexOf("function buildCustomerAccounts_"), script.indexOf("function apiGetCustomerWorkQueue_"));
  assert.match(ledger, /const explicitInvoiceLinks = readBadgerInvoiceLinks_\(\)/);
  assert.match(ledger, /String\(explicit\?\.match_method \|\| ""\).*=== "ignored"/);
  assert.match(ledger, /Orders on more than one account reference this invoice\./);
  assert.match(ledger, /matchMethod = "Linked order"/);
  assert.match(ledger, /matchMethod = "Business name"/);
  assert.match(ledger, /learnedMethod = "Learned customer name"/);
  assert.match(ledger, /matchMethod = "Badger location name"/);
  assert.match(ledger, /const customerAliases = readBadgerCustomerAliases_\(\)/);
  assert.match(ledger, /cachedBadgerLocationNames_\(/);
  assert.match(ledger, /assignedInvoiceAccounts/);
  assert.match(ledger, /conflictingOrderInvoiceKeys\.has\(invoiceKey\)/);
  assert.match(ledger, /const ignoredInvoiceKeys = new Set\(\)/);
  assert.match(ledger, /ignoredInvoiceKeys\.has\(invoiceKey\)/);
  assert.match(ledger, /linkedInvoices\.length > 0/);
  assert.match(ledger, /unmatched_badger_invoices/);
  assert.match(ledger, /ignored_badger_invoices/);
  assert.doesNotMatch(ledger, /account_options/);
  assert.match(script, /cachedBadgerInvoices_\(false\)\.find/);
  assert.match(page, /Badger invoices needing an account/);
  const customerRender = page.slice(page.indexOf("function renderCustomerWorkflow"), page.indexOf("async function loadCustomerWorkQueue"));
  assert.doesNotMatch(customerRender, /if \(!records\.length\) \{[\s\S]{0,250}return;/);
  assert.ok(customerRender.indexOf("invoiceReview") < customerRender.indexOf("emptyState"));
  assert.match(page, /<datalist id="badgerAccountPicker"><\/datalist>/);
  assert.match(page, /function ensureCustomerAccountIndex\(\)/);
  assert.match(page, /action:"customerAccountIndex"/);
  assert.match(page, /function filterBadgerAccountPicker\(query\)/);
  const accountInputHandler = page.slice(page.indexOf('$("customerWorkflowList").addEventListener("input"'), page.indexOf('$("customerWorkflowList").addEventListener("focusin"'));
  assert.match(accountInputHandler, /filterBadgerAccountPicker\(picker\.value\)/);
  assert.doesNotMatch(accountInputHandler, /staffApi/);
  assert.match(page, /Ignore \/ not a Directory account/);
  assert.match(page, /Restore to matching/);
  assert.match(page, /<details class="workflowCard" data-badger-ignored="true">/);
  assert.doesNotMatch(page, /customerData\.accountOptions/);
});

test("staff invoice links teach customer-name matching, but ignores do not", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const link = script.slice(script.indexOf("function apiLinkBadgerInvoice_"), script.indexOf("function buildCustomerAccounts_"));
  assert.match(link, /const learned = !ignored && upsertBadgerCustomerAlias_\(/);
  assert.match(script, /const BADGER_CUSTOMER_ALIASES_SHEET_NAME = "Badger Customer Aliases"/);
  assert.match(script, /ensureSheet_\(hub, BADGER_CUSTOMER_ALIASES_SHEET_NAME/);
  const normalizer = script.slice(script.indexOf("function normalizeCustomerMatchKey_"), script.indexOf("const BADGER_LOCATION_NAMES_CACHE_KEY"));
  const normalize = new Function("BADGER_CUSTOMER_NAME_SUFFIXES", `${normalizer}; return normalizeCustomerMatchKey_;`)(new Set(["llc", "inc", "incorporated", "co", "corp", "corporation", "company", "ltd"]));
  assert.equal(normalize("Cujak's Wine andSpirits"), normalize("Cujaks Wine and Spirits"));
  assert.equal(normalize("Sunken PaddleCiderworks LLC"), normalize("Sunken Paddle Ciderworks"));
  assert.equal(normalize("The Crimson Still LLC"), normalize("Crimson Still"));
  assert.notEqual(normalize("Festival Foods -- Oshkosh #2708"), normalize("Festival Foods -- FDL"));
  const aliases = script.slice(script.indexOf("function readBadgerCustomerAliases_"), script.indexOf("function readBadgerInvoiceLinks_"));
  assert.match(aliases, /aliases\.by_name\.set\(canonicalName, \{ ambiguous:true \}\)/);
  assert.match(aliases, /aliases\.by_key\.get\(key\)\.add\(accountId\)/);
  const ledger = script.slice(script.indexOf("function buildCustomerAccounts_"), script.indexOf("function apiGetCustomerWorkQueue_"));
  assert.match(ledger, /locationPublicKeysByInvoiceKey/);
  assert.match(ledger, /locationKeys\.size !== 1/);
});

test("large read responses are compressed and reads retry within the proxy limit", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const proxy = await readFile(new URL("netlify/functions/inventory.js", root), "utf8");
  assert.match(script, /READ_ACTIONS\.has\(action\) && String\(e\?\.parameter\?\.gz \|\| ""\) === "1" \? compressedText_\(payload\)/);
  assert.match(script, /Utilities\.gzip\(/);
  assert.match(proxy, /import \{ gunzipSync \} from "node:zlib";/);
  assert.match(proxy, /url\.searchParams\.set\("gz", "1"\)/);
  assert.match(proxy, /const READ_UPSTREAM_ATTEMPTS = 2;/);
  assert.match(proxy, /const READ_UPSTREAM_TIMEOUT_MS = 11500;/);
  // Two read attempts must fit inside Netlify's ~26 s function limit.
  assert.ok(2 * 11500 < 25000);
  // Writes and sends stay single-attempt.
  assert.match(proxy, /attempts:UPSTREAM_WRITE_ATTEMPTS/);
  assert.match(proxy, /const SEND_UPSTREAM_ATTEMPTS = 1;/);
});

test("campaign freeze timeouts wait for the snapshot instead of re-creating it", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const page = await readFile(new URL("index.html", root), "utf8");
  const rows = script.slice(script.indexOf("function campaignRecipientRows_"), script.indexOf("function campaignRecipientSummaryRows_"));
  assert.doesNotMatch(rows, /matches\.map\(match => \(\{ row:match\.getRow\(\), values:sheet\.getRange/);
  assert.match(rows, /getRange\(first, 1, last - first \+ 1/);
  const warmer = script.slice(script.indexOf("function warmHubReadCaches"), script.indexOf("function onHubReadCacheSpreadsheetChange"));
  assert.match(warmer, /readCachePresent_\(scope\)/);
  const waiter = page.slice(page.indexOf("async function waitForFrozenCampaign"), page.indexOf("async function recalculateOutreachMiles"));
  assert.match(waiter, /action:"outreachCampaigns"/);
  assert.doesNotMatch(waiter, /createOutreachCampaign/);
});

test("SKUs Out of Stock checkbox blocks ordering without adding sheet columns", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const order = await readFile(new URL("order.html", root), "utf8");
  const catalog = script.slice(script.indexOf("function apiListSkus_"), script.indexOf("function apiAddSkuToStoreUnlocked_"));
  assert.match(catalog, /toBool_\(firstPresent_\(s, \["out_of_stock", "out_of_stock\?"\]\)\)/);
  assert.doesNotMatch(catalog, /ensureHeaderColumns_/);
  assert.match(order, /outOfStock \? " disabled" : ""/);
});

test("learned aliases prefer the exact customer name and always learn staff links", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  assert.match(script, /const aliases = \{ by_name:new Map\(\), by_key:new Map\(\) \}/);
  assert.match(script, /customerAliases\.by_name\.get\(canonicalBadgerAliasName_\(invoice\.customer_name\)\)/);
  assert.match(script, /looseAliasAccounts\.length === 1/);
  assert.doesNotMatch(script, /conflictingLooseAlias/);
  const runbook = await readFile(new URL("docs/production-cutover-runbook-2026-09-25.md", root), "utf8");
  assert.match(runbook, /Precondition: the Hub inventory migration must stay inactive/);
});

test("forced refreshes save their rebuild to the read cache", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  assert.match(script, /cachedReadPayload_\("customer_work_queue", \(\) => apiGetCustomerWorkQueue_\(\{ _cache_bypass:true, _refresh_sources:forceRefresh \}\), forceRefresh\)/);
  assert.match(script, /cachedReadPayload_\("outreach_slim", [^\n]+, forceRefresh\)/);
  assert.match(script, /cachedReadPayload_\("inventory_stores", \(\) => apiGetInitData_\("", true\), !!forceRefresh\)/);
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.equal((page.match(/Couldn't refresh \(\$\{error\?\.message/g) || []).length, 3);
});

test("browser sends CSV imports in small parts", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /const BUSINESS_IMPORT_CHUNK_SIZE = 20;/);
  const importer = page.slice(page.indexOf("async function runBusinessImport"), page.indexOf("async function loadHubSystemStatus"));
  assert.match(importer, /rows:parts\[index\]/);
  assert.doesNotMatch(importer, /rows:pendingBusinessImport/);
  assert.match(importer, /importPartServerResponded = true/);
  assert.match(importer, /The connection ended before the server confirmed this part\./);
});

test("business import writes directory and log rows in batches", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const importer = script.slice(script.indexOf("function apiImportOutreachBusinesses_"), script.indexOf("function apiRecalculateOutreachMiles_"));
  assert.match(importer, /directory\.getRange\(directoryStartRow, 1, pendingDirectoryRows\.length, directoryWidth\)\.setValues/);
  assert.match(importer, /importRows\.getRange\(importRows\.getLastRow\(\) \+ 1, 1, importLogRows\.length/);
  assert.doesNotMatch(importer, /importRows\.appendRow/);
  assert.match(importer, /retrying row by row/);
});

test("account ID repair writes only identity columns and isolates tab failures", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const backfill = script.slice(script.indexOf("function backfillAccountIdsInSheet_"), script.indexOf("function ensureAccountIdentityModel_"));
  assert.match(backfill, /sheet\.getRange\(2, h\.account_id \+ 1, rowCount, 1\)\.setValues\(accountIdValues\)/);
  assert.doesNotMatch(backfill, /setValues\(rows\)/);
  const model = script.slice(script.indexOf("function ensureAccountIdentityModel_"), script.indexOf("function setDirectoryField_"));
  assert.doesNotMatch(model, /setValues\(rows\)/);
  assert.match(model, /h\.record_created_at \+ 1, rowCount, 1\)\.setValues\(createdAtValues\)/);
  assert.match(model, /account_id_backfill_failed/);
  assert.match(script, /Account ID backfill failed on:/);
});

test("contact logging schedules external email follow-up and repair normalizes legacy priority", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  assert.match(script, /if \(!outcome\) \{\s+const settings = getOutreachCampaignSettings_\(\)/);
  assert.match(script, /set\(\["status"\], "Sent"\)/);
  assert.match(script, /set\(\["next_follow-up", "next_follow_up"\], automaticFollowUp\)/);
  assert.match(script, /trim\(\)\.toLowerCase\(\) === "medium"/);
  assert.match(script, /row\[0\] = "Normal"/);
  assert.match(script, /priorityRange\.setValues\(priorityValues\)/);
});

test("bulk exclusions only write selected status and detail cells", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const start = script.indexOf("function apiSetOutreachCampaignRecipientExclusions_");
  const end = script.indexOf("function apiUpdateOutreachCampaignRecipient_", start);
  const bulk = script.slice(start, end);
  assert.match(bulk, /getRange\(item\.row, statusColumn, 1, 2\)\.setValues/);
  assert.doesNotMatch(bulk, /getRange\(firstRow, 1,/);
  assert.doesNotMatch(bulk, /getLastColumn\(\)\);\s*const values = range\.getValues/);
});

test("engagement clicks retain identity and scanner protection", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  assert.match(script, /ensureHeaderColumns_\(engagement, \["Account ID", "Target", "Stage"\]\)/);
  assert.match(script, /permanentId_\("ENG"\)/);
  assert.match(script, /Possible link scanner/);
  assert.match(script, /< 5000/);
  assert.match(script, /function apiBackfillEngagementDetails_/);
});

test("core Hub read paths use versioned cache fallbacks and timing metadata", async () => {
  const script = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(script, /function cachedReadPayload_/);
  assert.match(script, /hub_read:.*scope.*version/);
  assert.match(script, /function warmHubReadCaches/);
  assert.match(script, /everyMinutes\(10\)/);
  assert.match(script, /const READ_CACHE_TTL_SECONDS = 900/);
  assert.match(script, /const READ_CACHE_CHUNK_SIZE = 45000/);
  assert.match(script, /function onHubReadCacheSpreadsheetChange/);
  assert.match(script, /\[getOutreachSs_\(\), SpreadsheetApp\.openById\(BADGER_TRACKER_SPREADSHEET_ID\), getSs_\(\)\]/);
  assert.match(script, /forSpreadsheet\(spreadsheet\)\.onChange\(\)\.create\(\)/);
  assert.match(script, /finally \{\s+if \(invalidateReadCache\)/);
  assert.match(script, /String\(p\?\.refresh \|\| ""\) === "1"/);
  assert.match(script, /function campaignRecipientSummaryRows_/);
  assert.match(page, /function readScreenCache/);
  assert.match(page, /Couldn't refresh; showing data from/);
  assert.match(page, /writeScreenCache\("outreach"/);
  assert.match(page, /loadOutreach\(true\)/);
  assert.match(page, /loadCustomerWorkQueue\(true\)/);
  assert.match(page, /loadStartup\(true, \$\("storeSelect"\)\.value\)/);
});

test("public customer proxy remains narrowly allowlisted", async () => {
  const { handler } = await loadFunction("netlify/functions/customer.js", "public-regression");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  globalThis.fetch = async () => new Response(JSON.stringify({ ok:true }), { status:200 });
  for (const action of ["listSkus", "submitCustomerApplication", "submitOnlineOrderRequest"]) {
    const response = await handler(event(action, { ip:`198.51.100.${action.length}` }));
    assert.equal(response.statusCode, 200, action);
  }
  const blocked = await handler(event("managerGrid"));
  assert.equal(blocked.statusCode, 403);
});

test("customer catalog retries one non-JSON or failed upstream response, while submits stay single-attempt", async () => {
  const { handler } = await loadFunction("netlify/functions/customer.js", "customer-catalog-retry");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = callback => { callback(); return 0; };
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response("<HTML><HEAD><TITLE>Google error</TITLE></HEAD></HTML>", { status:200, headers:{ "content-type":"text/html" } })
        : new Response(JSON.stringify({ ok:true, skus:[] }), { status:200, headers:{ "content-type":"application/json" } });
    };
    const recovered = await handler(event("listSkus"));
    assert.equal(calls, 2, "listSkus retries once after HTML");
    assert.equal(recovered.statusCode, 200);
    assert.equal(JSON.parse(recovered.body).ok, true);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("<HTML>temporary error</HTML>", { status:503, headers:{ "content-type":"text/html" } });
    };
    const unavailable = await handler(event("listSkus"));
    assert.equal(calls, 2, "listSkus stops after one retry");
    assert.equal(unavailable.statusCode, 502);
    assert.deepEqual(JSON.parse(unavailable.body), { ok:false, retryable:true, error:"The order catalog is temporarily unavailable." });

    for (const action of ["submitCustomerApplication", "submitOnlineOrderRequest"]) {
      calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response("<HTML>temporary error</HTML>", { status:200, headers:{ "content-type":"text/html" } });
      };
      const response = await handler(event(action));
      assert.equal(calls, 1, `${action} is never retried`);
      assert.equal(response.statusCode, 502);
    }
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

function goEvent(params, userAgent = "Mozilla/5.0") {
  return { httpMethod:"GET", rawQuery:new URLSearchParams(params).toString(), headers:{ "user-agent":userAgent } };
}

function trackingSignature(target, accountId, stage) {
  return createHmac("sha256", process.env.TRACKING_LINK_SECRET).update(`${target}\n${accountId}\n${stage}`).digest("base64url");
}

test("tracking redirect allowlists destinations and ignores invalid signatures", async () => {
  const { handler } = await loadFunction("netlify/functions/go.js", "tracking-redirect");
  process.env.TRACKING_LINK_SECRET = "tracking-test-secret";
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.PUBLIC_SITE_URL = "https://distribution.sturgeonspirits.com";
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response(JSON.stringify({ ok:true }), { status:200 }); };
  const unknown = await handler(goEvent({ t:"https://attacker.test", url:"https://attacker.test" }));
  assert.equal(unknown.statusCode, 404);
  const invalid = await handler(goEvent({ t:"sell_sheet", a:"ACC-1", s:"Initial", k:"bad", url:"https://attacker.test" }));
  assert.equal(invalid.statusCode, 302);
  assert.equal(invalid.headers.Location, "https://distribution.sturgeonspirits.com/sell-sheet.html");
  assert.equal(fetches, 0);
  const application = await handler(goEvent({ t:"application", a:"ACC-1", s:"Initial", k:"bad", business:"Example Bar", email:"orders@example.test", url:"https://attacker.test" }));
  assert.equal(application.statusCode, 302);
  assert.match(application.headers.Location, /^https:\/\/distribution\.sturgeonspirits\.com\/customer-signup\.html\?/);
  assert.equal(new URL(application.headers.Location).searchParams.get("business"), "Example Bar");
  assert.doesNotMatch(application.headers.Location, /attacker\.test/);

  process.env.PUBLIC_SITE_URL = "http://attacker.test";
  const fallback = await handler(goEvent({ t:"application", a:"ACC-1", s:"Initial", k:"bad" }));
  assert.match(fallback.headers.Location, /^https:\/\/distribution\.sturgeonspirits\.com\/customer-signup\.html\?/);
  process.env.PUBLIC_SITE_URL = "";
  const blankFallback = await handler(goEvent({ t:"application", a:"ACC-1", s:"Initial", k:"bad" }));
  assert.match(blankFallback.headers.Location, /^https:\/\/distribution\.sturgeonspirits\.com\/customer-signup\.html\?/);
});

test("the canonical-host redirect is first and public-site URL migration is safe and idempotent", async () => {
  const [toml, backend] = await Promise.all([
    readFile(new URL("netlify.toml", root), "utf8"),
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
  ]);
  const redirects = toml.slice(toml.indexOf("[[redirects]]"));
  assert.match(redirects, /\[\[redirects\]\]\n  from = "https:\/\/distribution-hub\.netlify\.app\/\*"\n  to = "https:\/\/distribution\.sturgeonspirits\.com\/:splat"\n  status = 301\n  force = true/);
  assert.ok(toml.indexOf("https://distribution-hub.netlify.app/*") < toml.indexOf('from = "/api/inventory"'), "host redirect precedes API rewrites");
  assert.doesNotMatch(toml.slice(toml.indexOf("https://distribution-hub.netlify.app/*"), toml.indexOf('from = "/api/inventory"')), /query\s*=/, "Netlify forwards 301 query strings without a query-match rule");

  const helperSource = backend.slice(backend.indexOf("function publicSiteUrl_"), backend.indexOf("function upsertActiveAccountProgram_"));
  const values = [
    ["https://distribution-hub.netlify.app/order.html?account_id=ACC-1&customer_id=C-1"],
    ["https://other.example/order.html?account_id=ACC-2"],
    [""],
  ];
  const writes = [];
  const sheet = {
    getLastRow:() => values.length + 1,
    getRange:(row, _column, rows) => rows
      ? { getValues:() => values.map(item => item.slice()) }
      : { setValue:value => { writes.push({ row, value }); values[row - 2][0] = value; } },
  };
  const migration = new Function("getOutreachCampaignSettings_", "getOutreachProgramSheet_", "getHeaderMap_", "PUBLIC_SITE_URL_SETTING_KEY", "PUBLIC_SITE_URL_FALLBACK", `${helperSource}\nreturn { publicSiteUrl_, rewritePublicSiteUrls_ : rewritePublicSiteUrls };`)(
    () => ({ "Public site URL":"https://distribution.sturgeonspirits.com" }),
    () => sheet,
    () => ({ ordering_portal_url:0 }),
    "Public site URL",
    "https://distribution-hub.netlify.app",
  );
  assert.equal(migration.publicSiteUrl_({}), "https://distribution-hub.netlify.app", "blank setting falls back");
  assert.equal(migration.publicSiteUrl_({ "Public site URL":"http://attacker.test" }), "https://distribution-hub.netlify.app", "non-HTTPS setting falls back");
  assert.deepEqual(migration.rewritePublicSiteUrls_(), { changed:1, unchanged:2 });
  assert.equal(writes[0].value, "https://distribution.sturgeonspirits.com/order.html?account_id=ACC-1&customer_id=C-1");
  assert.deepEqual(migration.rewritePublicSiteUrls_(), { changed:0, unchanged:3 }, "a second migration does not rewrite anything");
  assert.match(backend, /set\("ordering_portal_url", `\$\{publicSiteUrl_\(settings\)\}\/order\.html\?/);
  assert.match(backend, /public_site_added_settings/);
});

test("tracking logging failure or timeout never prevents a redirect", async () => {
  const { handler } = await loadFunction("netlify/functions/go.js", "tracking-log-failure");
  process.env.TRACKING_LINK_SECRET = "tracking-test-secret";
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  const signature = trackingSignature("sell_sheet", "ACC-1", "Initial");
  globalThis.fetch = async () => { throw Object.assign(new Error("timed out"), { name:"AbortError" }); };
  const response = await handler(goEvent({ t:"sell_sheet", a:"ACC-1", s:"Initial", k:signature }));
  assert.equal(response.statusCode, 302);
  assert.match(response.headers.Location, /^https:\/\/distribution\.sturgeonspirits\.com\/sell-sheet\.html\?access=/);
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("valid Karl-only test tracking links redirect without recording engagement", async () => {
  const { handler } = await loadFunction("netlify/functions/go.js", "tracking-test-link");
  process.env.TRACKING_LINK_SECRET = "tracking-test-secret";
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  const signature = trackingSignature("sell_sheet", "ACC-1", "Initial");
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response(JSON.stringify({ ok:true }), { status:200 }); };
  const response = await handler(goEvent({ t:"sell_sheet", a:"ACC-1", s:"Initial", k:signature, x:"test" }));
  assert.equal(response.statusCode, 302);
  assert.match(response.headers.Location, /^https:\/\/distribution\.sturgeonspirits\.com\/sell-sheet\.html\?access=/);
  assert.equal(fetches, 0);
});

function sellSheetEvent(params = {}, options = {}) {
  const method = options.method || "GET";
  return { httpMethod:method, rawQuery:new URLSearchParams(params).toString(), queryStringParameters:params, headers:options.session ? { cookie:options.session } : {}, body:method === "POST" ? JSON.stringify(options.body || {}) : "" };
}

function sellSheetToken(payload, secret = process.env.SELL_SHEET_ACCESS_SECRET) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

test("sell-sheet pricing is omitted without valid access and noindex is always returned", async () => {
  const { handler } = await loadFunction("netlify/functions/sell-sheet.js", "sell-sheet-public");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.SELL_SHEET_ACCESS_SECRET = "sell-sheet-test-secret";
  let sent;
  globalThis.fetch = async (_url, options = {}) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok:true, sections:[{ section:"Vodka", products:[{ sku_id:"V-1", price_cents:2200 }] }] }), { status:200 });
  };
  const response = await handler(sellSheetEvent());
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["X-Robots-Tag"], "noindex, nofollow, noarchive");
  assert.equal(sent.action, "sellSheet");
  assert.equal(sent.include_prices, false);
  assert.equal(body.access.prices, false);
  assert.equal("price_cents" in body.sections[0].products[0], false);
});

test("sell-sheet accepts only unexpired signed access tokens and sends the account to pricing", async () => {
  const { handler } = await loadFunction("netlify/functions/sell-sheet.js", "sell-sheet-access");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.SELL_SHEET_ACCESS_SECRET = "sell-sheet-test-secret";
  let sent;
  globalThis.fetch = async (_url, options = {}) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok:true, sections:[] }), { status:200 });
  };
  const valid = sellSheetToken({ purpose:"sell_sheet", account_id:"ACC-1", exp:Math.floor(Date.now() / 1000) + 90 });
  const response = await handler(sellSheetEvent({ access:valid }));
  const body = JSON.parse(response.body);
  assert.equal(body.access.prices, true);
  assert.equal(body.access.account_id, "ACC-1");
  assert.equal(sent.include_prices, true);
  assert.equal(sent.account_id, "ACC-1");
  const expired = sellSheetToken({ purpose:"sell_sheet", account_id:"ACC-1", exp:Math.floor(Date.now() / 1000) - 1 });
  await handler(sellSheetEvent({ access:expired }));
  assert.equal(sent.include_prices, false, "expired tokens fall back to the no-price view");
});

test("sell-sheet implementation keeps public catalog prices separate and installs editable structure", async () => {
  const [backend, page, functionSource, config] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"), readFile(new URL("sell-sheet.html", root), "utf8"),
    readFile(new URL("netlify/functions/sell-sheet.js", root), "utf8"), readFile(new URL("netlify.toml", root), "utf8"),
  ]);
  const listSkus = backend.slice(backend.indexOf("function apiListSkus_"), backend.indexOf("function sellSheetSectionForSku_"));
  const sellSheet = backend.slice(backend.indexOf("function apiSellSheet_"), backend.indexOf("function apiAddSkuToStoreUnlocked_"));
  assert.doesNotMatch(listSkus, /price_cents|wholesale_price/);
  assert.match(sellSheet, /include_prices === true/);
  assert.match(sellSheet, /skuWholesaleCents_/);
  assert.match(sellSheet, /sellSheetCustomerPriceMap_/);
  assert.match(sellSheet, /price_note = "Ask us for your price"/);
  assert.ok(backend.indexOf('if (/gift|box/.test(key))') < backend.indexOf('if (/canned|cocktail/.test(key))'), "gift boxes classify before canned cocktails");
  assert.match(backend, /\^stur-liq-/);
  assert.match(backend, /SELL_SHEET_SECTION_VALUES/);
  assert.match(backend, /identity\.sell_sheet = ensureSellSheetStructure_\(\)/);
  assert.match(page, /name="robots" content="noindex/);
  assert.match(page, /Print \/ Save as PDF/);
  assert.match(page, /assets\/sell-sheet\/bar-on-ice-strip\.jpg/);
  assert.match(page, /assets\/sell-sheet\/bar-on-ice\.jpg/);
  assert.match(page, /assets\/sell-sheet\/art\/glass-in-hand\.svg/);
  assert.match(page, /assets\/sell-sheet\/art\/hand-pouring\.svg/);
  assert.match(page, /assets\/sell-sheet\/art\/sturgeon-curled\.svg/);
  assert.match(page, /assets\/sell-sheet\/art\/sturgeon-side\.svg/);
  assert.match(page, /assets\/sell-sheet\/logo\/wordmark-craft-distillery\.png/);
  assert.match(page, /assets\/sell-sheet\/logo\/sturgeon-spirits-rust-logo\.png/);
  assert.match(page, /assets\/fonts\/SturgeonSpiritsDisplay\.woff2/);
  assert.match(page, /assets\/fonts\/Oswald\.woff2/);
  assert.match(page, /assets\/fonts\/Vollkorn-Regular\.woff2/);
  assert.doesNotMatch(page, /Impact|Georgia|Arial/);
  assert.match(page, /const s=photo\(p,m\);return s\?`<img/);
  assert.match(page, /common750=/);
  assert.match(page, /uniform=/);
  assert.match(page, /column-fill:balance/);
  assert.match(page, /grid-template-rows:repeat\(3,1\.28in\)/);
  assert.match(page, /\.flavor-group\{break-inside:auto/);
  assert.match(page, /break-after:avoid/);
  assert.doesNotMatch(page, /\.sheet\{[^}]*overflow:hidden/);
  assert.doesNotMatch(page, /\.page-two\{height:/);
  assert.doesNotMatch(page, /\.catalog-layout\{[^}]*height:/);
  assert.doesNotMatch(page, /\.flavor-lead h2\{[^}]*white-space:nowrap/);
  assert.match(page, /gallery=\[\.\.\.best,\.\.\.groups\.flatMap/);
  assert.match(page, /catalog-right\{justify-content:space-between/);
  assert.match(page, /flavor-lists\{font-size:11pt;line-height:1\.12/);
  assert.match(page, /if\(location\.protocol==="file:"\)/);
  assert.doesNotMatch(page, /\["127\.0\.0\.1","localhost"\]\.includes/);
  assert.doesNotMatch(page, /MutationObserver|atob\(/);
  assert.doesNotMatch(page, /What our accounts reorder most/);
  assert.match(page, /licensed retailers, bars, restaurants and venues/);
  assert.match(page, /account_id=\$\{encodeURIComponent\(account\)\}/);
  assert.doesNotMatch(page, /\$\d+(?:\.\d{2})?/);
  assert.match(functionSource, /ACCESS_SECONDS = 90 \* 24 \* 60 \* 60/);
  assert.match(functionSource, /account_id:token\?\.account_id \|\| ""/);
  assert.doesNotMatch(functionSource, /SELL_SHEET_URL/);
  assert.match(config, /X-Robots-Tag = "noindex, nofollow, noarchive"/);
  ["/docs/*", "/claude/*", "/review-packages/*", "/imports/*", "/apps-script/*", "/tests/*", "/PROJECT_STATUS.md", "/README.md"].forEach(path => {
    assert.ok(config.includes(`from = "${path}"\n  to = "/404"\n  status = 404\n  force = true`), `protected ${path}`);
  });
});

test("sell-sheet render keeps public output price-free and renders authorized prices per product", async () => {
  const copy = { headline:"Oshkosh's First Distillery Since 1919", price_line:"Where patience pays", contact:"2663 Oregon Street · sturgeonspirits.com" };
  const sections = [
    { section:"New", products:[{ sku_id:"BOURBON", name:"Straight Bourbon", size:"750 mL", price_cents:3000 }] },
    { section:"Best seller", products:[{ sku_id:"GIN", name:"Gin", size:"750 mL", price_cents:2200 }] },
    { section:"Vodka", products:[{ sku_id:"CUSTOM", name:"Custom Vodka", size:"750 mL", price_cents:1900 },{ sku_id:"VODKA", name:"River Run Vodka", size:"750 mL", price_cents:2200 }] },
    { section:"Liqueur", products:[{ sku_id:"LIQ750", name:"Coffee Liqueur", size:"750 mL", price_cents:2200 },{ sku_id:"LIQ375", name:"Maraschino Liqueur", size:"375 mL", price_cents:1200 },{ sku_id:"CONFLICT", name:"Special Liqueur", size:"750 mL", price_note:"Ask us for your price" }] },
    { section:"Other spirits", products:[{ sku_id:"UNMAPPED", name:"Aquavit", size:"750 mL", price_cents:2200 }] },
  ];
  const map = { by_sku:{ BOURBON:"straight-bourbon-whiskey", GIN:"classic-gin", VODKA:"river-run-vodka" }, by_name:{} };
  const publicView = await renderSellSheet({ ok:true, access:{ prices:false }, copy, sections }, map);
  assert.equal(publicView.className, "no-price");
  assert.doesNotMatch(publicView.html, /\$|Place an order|wholesale price|Ask us for your price/);
  assert.match(publicView.html, /More spirits/);
  assert.doesNotMatch(publicView.html, /alt="Aquavit"/);
  const pricedView = await renderSellSheet({ ok:true, access:{ prices:true, account_id:"ACC-1" }, copy, sections }, map);
  assert.match(pricedView.html, /href="\/order\.html\?account_id=ACC-1"/);
  assert.match(pricedView.html, /class="price-amount">\$22/);
  assert.match(pricedView.html, /class="price-copy">Most<br>Bottles/);
  assert.match(pricedView.html, /Custom <span class="item-price">\$19/);
  assert.match(pricedView.html, /Liqueurs <span class="group-price">\$22\/bottle/);
  assert.match(pricedView.html, /375 mL — \$12\/bottle/);
  assert.doesNotMatch(pricedView.html, /Coffee Liqueur <span class="item-price">/);
  assert.match(pricedView.html, /Maraschino Liqueur \(375 mL\)<\/li>/);
  assert.match(pricedView.html, /Special Liqueur[^<]*<span class="item-price">Ask us for your price/);
  assert.equal((pricedView.html.match(/alt="Gin"/g) || []).length, 2, "best sellers also populate the page-two grid");
  assert.equal((pricedView.html.match(/alt="Straight Bourbon"/g) || []).length, 1, "the Page 1 New bottle is not repeated in the grid");
  assert.equal((pricedView.html.match(/sturgeonspirits\.com/g) || []).length, 1);
  assert.ok(pricedView.html.indexOf('class="catalog-right"') < pricedView.html.indexOf('class="contact-wrap"'), "the print contact block stays in the catalog's right column");
});

test("Karl-only test rendering supplies non-empty HTML with an unsigned x=test marker", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const rendererSource = backend.slice(backend.indexOf("function outreachPlainTextToHtml_"), backend.indexOf("function outreachFieldLabel_"));
  const renderMessage = new Function(
    "Utilities", "PropertiesService", "outreachValue_", "outreachSegmentTemplateKey_", "outreachDisplayBusinessName_", "escapeOutreachHtml_", "outreachTemplateParts_", "renderOutreachTemplate_", "outreachMonthlyContentValues_", "outreachHasRecentBadgerInvoice_",
    `${rendererSource}\nreturn outreachMessage_;`
  )(
    {
      computeHmacSha256Signature:(payload, secret) => createHmac("sha256", secret).update(payload).digest(),
      base64EncodeWebSafe:bytes => Buffer.from(bytes).toString("base64url"),
    },
    { getScriptProperties:() => ({ getProperty:() => "tracking-test-secret" }) },
    (row, keys) => keys.map(key => row[key]).find(value => value !== undefined && value !== null && value !== ""),
    () => "A",
    value => String(value || ""),
    value => String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;"),
    template => ({ body:String(template || ""), footer:"{{Sell Sheet Link}}" }),
    (template, values) => String(template || "").replace(/{{([^}]+)}}/g, (_, key) => values[key.trim()] || ""),
    () => ({}),
    () => false
  );
  const message = renderMessage(
    { account_id:"ACC-1", next_email:"Initial", business:"Example Bar", email:"orders@example.test", contact:"Alex" },
    { "Tracking base URL":"https://distribution-hub.netlify.app/go", "Wholesale sell-sheet URL":"https://example.test/sell-sheet", "Segment A subject":"Hello", "Segment A HTML":"Hello" },
    { subject:"Saved subject", body_text:"Saved body" },
    true
  );
  assert.ok(message.html.length > 0);
  assert.match(message.html, /x=test/);
  const sendSource = backend.slice(backend.indexOf("function apiSendOutreachEmail_"), backend.indexOf("function apiUpdateOutreachOutcome_"));
  assert.match(sendSource, /testMode \? outreachMessage_\(current, settings, testDraft, true\)\.html : record\.preview_html/);
  assert.match(sendSource, /html:html/);
});

test("monthly outreach content escapes merge fields and gates the tasting offer per recipient", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const monthlySource = backend.slice(backend.indexOf("function outreachMonthlyContentValues_"), backend.indexOf("function outreachRecentBadgerInvoiceAccountIds_"));
  const rendererSource = backend.slice(backend.indexOf("function escapeOutreachHtml_"), backend.indexOf("function outreachTemplateParts_"));
  const monthlyValues = new Function("outreachValue_", `${monthlySource}\nreturn outreachMonthlyContentValues_;`)(
    (row, keys) => keys.map(key => row[key]).find(value => value !== undefined && value !== null && value !== "")
  );
  const render = new Function(`${rendererSource}\nreturn renderOutreachTemplate_;`)();
  const settings = {
    "Monthly content month":"<October>",
    "Monthly content featured cocktail":"Featured <Old Fashioned>",
    "Monthly content second cocktail":"Second Espresso Martini",
    "Monthly content tasting offer":"Book a <tasting>",
    "Monthly content cocktail-list offer":"Get cocktail ideas",
  };
  const prospect = monthlyValues({ next_email:"Initial", relationship:"Prospect" }, settings, false);
  assert.equal(render("{{Month}} / {{Featured Cocktail}} / {{Tasting Offer}}", prospect, true), "&lt;October&gt; / Featured &lt;Old Fashioned&gt; / Book a &lt;tasting&gt;");
  assert.equal(render("{{Second Cocktail}}", monthlyValues({ next_email:"Follow-up 1", relationship:"Prospect" }, settings, false), true), "Second Espresso Martini");
  assert.equal(monthlyValues({ next_email:"Initial", relationship:"Customer" }, settings, false)["Tasting Offer"], "");
  assert.equal(monthlyValues({ next_email:"Initial", relationship:"Prospect" }, settings, true)["Tasting Offer"], "");
  assert.equal(monthlyValues({ next_email:"Reactivation", relationship:"Prospect" }, settings, false)["Tasting Offer"], "");
  assert.equal(render("Before {{Month}}{{Featured Cocktail}}{{Second Cocktail}}{{Tasting Offer}}{{Cocktail List Offer}} after", monthlyValues({ next_email:"Initial", relationship:"Prospect" }, {}, false), true), "Before  after");
  const repairSource = backend.slice(backend.indexOf("function ensureOutreachMonthlyContent_"), backend.indexOf("function apiRepairHubStructure_"));
  assert.match(repairSource, /OUTREACH_MONTHLY_CONTENT_SECTION/);
  assert.match(backend, /Monthly content featured cocktail/);
  assert.match(repairSource, /='Email Editor'!B\$\{rowsByLabel\.get\(item\.label\)\}/);
  assert.match(repairSource, /identity\.monthly_content = ensureOutreachMonthlyContent_\(\)/);
});

test("monthly tasting lookup matches recent Badger invoices conservatively and fails closed", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const lookupSource = backend.slice(backend.indexOf("function outreachRecentBadgerInvoiceAccountIds_"), backend.indexOf("function outreachRowsMatchingCell_"));
  const monthsAgo = count => {
    const date = new Date();
    date.setMonth(date.getMonth() - count);
    return date.toISOString();
  };
  const lookup = ({ directory, orders = [], invoices = [], links = new Map(), aliases = { by_name:new Map(), by_key:new Map() }, locations = [], throwReader = false } = {}) => {
    const directorySheet = { kind:"directory" };
    const ordersSheet = { kind:"orders", getLastRow:() => orders.length + 1 };
    let warnings = 0;
    const result = new Function(
      "getAllRowsAsObjects_", "getOutreachSheet_", "OUTREACH_SHEET_NAME", "normalizeCustomerMatchKey_", "outreachValue_", "getOutreachSs_", "ONLINE_ORDER_REQUESTS_SHEET_NAME", "normalizeBadgerInvoiceNumber_", "readBadgerCustomerAliases_", "cachedBadgerLocationNames_", "readBadgerInvoiceLinks_", "cachedBadgerInvoices_", "outreachDate_", "canonicalBadgerAliasName_", "console",
      `let __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS = null; let __OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED = false; ${lookupSource}\nreturn { recent:outreachRecentBadgerInvoiceAccountIds_, has:outreachHasRecentBadgerInvoice_, failed:() => __OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED };`
    )(
      sheet => sheet === directorySheet ? directory : orders,
      () => directorySheet,
      "Directory",
      value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
      (row, keys) => keys.map(key => row[key]).find(value => value !== undefined && value !== null && value !== ""),
      () => ({ getSheetByName:name => name === "Orders" ? ordersSheet : null }),
      "Orders",
      value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
      () => { if (throwReader) throw new Error("aliases unavailable"); return aliases; },
      () => locations,
      () => links,
      () => invoices,
      value => value ? new Date(value) : "",
      value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, " ").trim(),
      { warn:() => { warnings += 1; } }
    );
    return { result, warnings:() => warnings };
  };
  const directory = [
    { account_id:"ACC-NAME", business:"Name Bar" }, { account_id:"ACC-EXPLICIT", business:"Explicit Bar" },
    { account_id:"ACC-AMB-1", business:"Same Bar" }, { account_id:"ACC-AMB-2", business:"Same Bar" },
    { account_id:"ACC-ORDER-1", business:"Order Bar" }, { account_id:"ACC-ORDER-2", business:"Other Order Bar" },
    { account_id:"ACC-VOID", business:"Void Bar" }, { account_id:"ACC-IGNORED", business:"Ignored Bar" }, { account_id:"ACC-LINK-VOID", business:"Link Void Bar" },
  ];
  const links = new Map([
    ["RECENT", { account_id:"ACC-EXPLICIT", match_method:"Manual link" }],
    ["IGNORED", { account_id:"ACC-IGNORED", match_method:"Ignored" }],
    ["LINKVOID", { account_id:"ACC-LINK-VOID", match_method:"Void" }],
  ]);
  const { result } = lookup({
    directory,
    orders:[{ badger_invoice_number:"CONFLICT", account_id:"ACC-ORDER-1" }, { badger_invoice_number:"CONFLICT", account_id:"ACC-ORDER-2" }],
    links,
    invoices:[
      { invoice_number:"RECENT", invoice_date:monthsAgo(11), customer_name:"Name Bar" },
      { invoice_number:"OLD", invoice_date:monthsAgo(13), customer_name:"Name Bar" },
      { invoice_number:"VOID", invoice_date:monthsAgo(11), customer_name:"Void Bar", is_void:true },
      { invoice_number:"IGNORED", invoice_date:monthsAgo(11), customer_name:"Ignored Bar" },
      { invoice_number:"LINKVOID", invoice_date:monthsAgo(11), customer_name:"Link Void Bar" },
      { invoice_number:"AMBIGUOUS", invoice_date:monthsAgo(11), customer_name:"Same Bar" },
      { invoice_number:"CONFLICT", invoice_date:monthsAgo(11), customer_name:"Order Bar" },
    ],
  });
  assert.deepEqual([...result.recent()], ["ACC-EXPLICIT"], "only the explicit link on the 11-month invoice qualifies");
  assert.equal(result.has("ACC-NAME"), false, "the explicit link wins over the matching name");
  assert.equal(result.has("ACC-AMB-1"), false, "ambiguous business names match nobody");
  assert.equal(result.has("ACC-ORDER-1"), false, "conflicting order links do not fall through to a name match");
  const failed = lookup({ directory, throwReader:true });
  assert.equal(failed.result.has("ACC-NAME"), true, "a failed reader suppresses tasting offers for every account");
  assert.equal(failed.result.has("ACC-EXPLICIT"), true, "the failed result is memoized for the execution");
  assert.equal(failed.result.failed(), true);
  assert.equal(failed.warnings(), 1, "the reader failure is logged once");
});

test("Cocktail list campaigns keep newsletter eligibility, cross-send guards, and the non-sales template", async () => {
  const [backend, index, proxy] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("netlify/functions/inventory.js", root), "utf8"),
  ]);
  const eligibilitySource = backend.slice(backend.indexOf("function newsletterCocktailListEligibility_"), backend.indexOf("function campaignCocktailListRecords_"));
  const eligibility = new Function("outreachCrossSendCooldownReason_", "outreachRecentSendToEmail_", "OUTREACH_COCKTAIL_LIST_STAGE", "OUTREACH_COCKTAIL_LIST_GAP_DAYS", `${eligibilitySource}\nreturn newsletterCocktailListEligibility_;`)(
    (email, cocktail) => email === "recent@example.test" && cocktail ? "Another sales outreach email was sent within the last 14 days" : "",
    () => false,
    "Cocktail list",
    14,
  );
  assert.deepEqual(eligibility({ email:"subscribed@example.test", newsletter_status:"Subscribed", do_not_email:false }), []);
  assert.match(eligibility({ email:"unsubscribed@example.test", newsletter_status:"Unsubscribed", do_not_email:false }).join("; "), /not subscribed/);
  assert.match(eligibility({ email:"subscribed@example.test", newsletter_status:"Subscribed", do_not_email:true }).join("; "), /excluded/);
  assert.match(eligibility({ email:"recent@example.test", newsletter_status:"Subscribed", do_not_email:false }).join("; "), /last 14 days/);
  assert.match(backend, /campaign_type === "cocktail_list"/);
  assert.match(backend, /stage:OUTREACH_COCKTAIL_LIST_STAGE/);
  assert.match(backend, /liveCocktailListRecipient_/);
  assert.match(backend, /newsletterCocktailListEligibility_\(record\)/);
  assert.match(backend, /outreachCrossSendCooldownReason_\(email, false\)/, "sales eligibility checks the opposite direction");
  assert.match(backend, /Reply stop to unsubscribe\./);
  assert.match(backend, /values\["Tasting Offer"\] = ""/);
  assert.doesNotMatch(backend.slice(backend.indexOf("function cocktailListMessage_"), backend.indexOf("function outreachSegmentTemplateKey_")), /Customer application|Wholesale sell-sheet/);
  assert.match(backend, /unsubscribeNewsletterContactByEmail_/);
  assert.match(backend, /if \(outcome === "Unsubscribed"\) unsubscribeNewsletterContactByEmail_/);
  assert.match(index, /id="outreachCampaignCriteriaType"/);
  assert.match(index, /value="cocktail_list">Cocktail list/);
  assert.match(index, /campaign_type:\$\("outreachCampaignCriteriaType"\)\.value/);
  assert.match(proxy, /"createOutreachCampaign"/);
  const batchSource = backend.slice(backend.indexOf("function apiSendOutreachCampaignBatch_"), backend.indexOf("const CAMPAIGN_SCHEDULE_HANDLER"));
  assert.match(batchSource, /approval_token/);
  assert.match(batchSource, /campaignCriteria\?\.campaign_type === "cocktail_list"/);
  assert.match(batchSource, /continue_after_block !== true/);
});

test("Cocktail list review fixes memoize cooldowns, suppress opt-outs, validate mailer contacts, and unsubscribe duplicates", async () => {
  const [backend, mailer] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("docs/reference/distribution-outreach/Code.gs", root), "utf8"),
  ]);
  const recentSource = backend.slice(backend.indexOf("function outreachRecentSendIndex_"), backend.indexOf("function cocktailListMessage_"));
  const rows = [
    { intended_recipient:"sales-to-cocktail-day-13@example.test", message_stage:"Initial", result:"APP SENT", timestamp:"2026-10-03T12:00:00Z" },
    { intended_recipient:"sales-to-cocktail-day-15@example.test", message_stage:"Initial", result:"APP SENT", timestamp:"2026-10-01T12:00:00Z" },
    { intended_recipient:"cocktail-to-sales-day-13@example.test", message_stage:"Cocktail list", result:"APP SENT", timestamp:"2026-10-03T12:00:00Z" },
    { intended_recipient:"cocktail-to-sales-day-15@example.test", message_stage:"Cocktail list", result:"APP SENT", timestamp:"2026-10-01T12:00:00Z" },
    { intended_recipient:"cocktail-to-cocktail-day-13@example.test", message_stage:"Cocktail list", result:"APP SENT", timestamp:"2026-10-03T12:00:00Z" },
    { intended_recipient:"cocktail-to-cocktail-day-15@example.test", message_stage:"Cocktail list", result:"APP SENT", timestamp:"2026-10-01T12:00:00Z" },
    { intended_recipient:"sales-to-sales-day-eight@example.test", message_stage:"Initial", result:"APP SENT", timestamp:"2026-10-08T12:00:00Z" },
  ];
  let activityReads = 0;
  const recent = new Function("getOutreachSheet_", "getAllRowsAsObjects_", "outreachValue_", "outreachDate_", "OUTREACH_ACTIVITY_SHEET_NAME", "OUTREACH_COCKTAIL_LIST_STAGE", "OUTREACH_COCKTAIL_LIST_GAP_DAYS", `let __OUTREACH_RECENT_SEND_INDEX = null; ${recentSource}; return { outreachRecentSendToEmail_, outreachCrossSendCooldownReason_, outreachNoteRecentSend_ };`)(
    () => ({ getLastRow:() => rows.length + 1 }),
    () => { activityReads += 1; return rows; },
    (row, keys) => keys.map(key => row[key]).find(value => value !== undefined && value !== ""),
    value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : ""; },
    "Activity Log", "Cocktail list", 14,
  );
  const now = new Date("2026-10-16T12:00:00Z");
  assert.equal(recent.outreachRecentSendToEmail_("cocktail-to-cocktail-day-13@example.test", stage => stage === "Cocktail list", 14, now), true, "a Cocktail list message 13 days ago blocks another Cocktail list email");
  assert.equal(recent.outreachRecentSendToEmail_("cocktail-to-cocktail-day-15@example.test", stage => stage === "Cocktail list", 14, now), false, "a Cocktail list message 15 days ago allows another Cocktail list email");
  assert.equal(recent.outreachRecentSendToEmail_("sales-to-cocktail-day-13@example.test", stage => stage !== "Cocktail list", 14, now), true, "a sales message 13 days ago blocks Cocktail list");
  assert.equal(recent.outreachRecentSendToEmail_("sales-to-cocktail-day-15@example.test", stage => stage !== "Cocktail list", 14, now), false, "a sales message 15 days ago permits Cocktail list");
  assert.equal(recent.outreachRecentSendToEmail_("cocktail-to-sales-day-13@example.test", stage => stage === "Cocktail list", 14, now), true, "a Cocktail list message 13 days ago blocks sales outreach");
  assert.equal(recent.outreachRecentSendToEmail_("cocktail-to-sales-day-15@example.test", stage => stage === "Cocktail list", 14, now), false, "a Cocktail list message 15 days ago permits sales outreach");
  assert.equal(recent.outreachRecentSendToEmail_("sales-to-sales-day-eight@example.test", stage => stage === "Cocktail list", 14, now), false, "a sales Follow-up 1 eight days after Initial remains allowed without Cocktail list activity");
  assert.equal(activityReads, 1, "all cooldown checks share one Activity Log read per execution");
  recent.outreachNoteRecentSend_("same-scheduler@example.test", "cocktail", now);
  assert.equal(recent.outreachRecentSendToEmail_("same-scheduler@example.test", stage => stage === "Cocktail list", 14, now), true, "a Cocktail list send recorded during this execution blocks a second Cocktail list campaign");

  const eligibilitySource = backend.slice(backend.indexOf("function newsletterCocktailListEligibility_"), backend.indexOf("function cocktailListContactIndex_"));
  const eligibility = new Function("outreachCrossSendCooldownReason_", "outreachRecentSendToEmail_", "OUTREACH_COCKTAIL_LIST_STAGE", "OUTREACH_COCKTAIL_LIST_GAP_DAYS", `${eligibilitySource}; return newsletterCocktailListEligibility_;`)(
    () => "", () => false, "Cocktail list", 14,
  );
  assert.match(eligibility({ email:"x@example.test", newsletter_status:"Subscribed", directory_outcome:"Unsubscribed" }).join("; "), /excluded/);
  assert.match(eligibility({ email:"x@example.test", newsletter_status:"Subscribed", program_newsletter_status:"Declined" }).join("; "), /program excludes/);

  const unsubscribeSource = backend.slice(backend.indexOf("function unsubscribeNewsletterContactByEmail_"), backend.indexOf("function appendOutreachActivity_"));
  const contactRows = [["one@example.test", "Subscribed", ""], ["ONE@example.test", "Subscribed", ""], ["other@example.test", "Subscribed", ""]];
  const writes = [];
  const contactSheet = {
    getLastRow:() => 4,
    getLastColumn:() => 3,
    getRange:(row) => ({ getValues:() => contactRows, setValues:values => writes.push({ row, values }) }),
  };
  const unsubscribe = new Function("getOutreachSs_", "getHeaderMap_", "NEWSLETTER_CONTACTS_SHEET_NAME", "APP_VERSION", `${unsubscribeSource}; return unsubscribeNewsletterContactByEmail_;`)(
    () => ({ getSheetByName:() => contactSheet }), () => ({ email:0, status:1, app_version:2 }), "Newsletter Contacts", "test-version",
  );
  assert.equal(unsubscribe("one@example.test", "Test"), true);
  assert.equal(writes.length, 2, "every duplicate address is updated");
  assert.equal(writes[0].values[0][1], "Unsubscribed");
  assert.equal(writes[1].values[0][1], "Unsubscribed");

  const validatorSource = mailer.slice(mailer.indexOf("function validateNewsletterContact_"), mailer.indexOf("function appendAppLog_"));
  const newsletterRows = [["contact-1", "ACC-1", "Alex", "cocktails@example.test", "Example Bar", "Subscribed"]];
  const newsletterSheet = {
    getLastRow:() => 2,
    getLastColumn:() => 6,
    getRange:(row) => ({ getValues:() => [row === 1 ? ["Contact ID", "Account ID", "Name", "Email", "Organization", "Status"] : newsletterRows[0]] }),
  };
  const validateNewsletter = new Function("assertStagingEnvironment_", "OUTREACH", "appHeaderKey_", "isValidEmail_", `${validatorSource}; return validateNewsletterContact_;`)(
    () => ({ getSheetByName:() => newsletterSheet }),
    { NEWSLETTER_CONTACTS_SHEET:"Newsletter Contacts", COCKTAIL_LIST_STAGE:"Cocktail list" },
    value => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  );
  const payload = { action:"sendNewsletterEmail", idempotency_token:"campaign-contact-1-token", account_id:"ACC-1", newsletter_contact_id:"contact-1", business:"Example Bar", recipient:"cocktails@example.test", message_stage:"Cocktail list", subject:"October ideas", html:"<p>Hello</p>" };
  const lead = validateNewsletter(payload, false);
  assert.equal(lead.stage, "Cocktail list");
  assert.equal(lead.business, "Example Bar");
  assert.throws(() => validateNewsletter({ ...payload, recipient:"changed@example.test" }, false), /changed/);
  assert.match(mailer, /action === 'sendNewsletterEmail'/);
  assert.match(mailer, /sendNewsletterEmailRequest_\(body\)/);
  const batchSource = backend.slice(backend.indexOf("function apiSendOutreachCampaignBatch_"), backend.indexOf("const CAMPAIGN_SCHEDULE_HANDLER"));
  assert.match(batchSource, /outreachNoteRecentSend_\(record\.email, "cocktail", acceptedAt\)/);
  assert.match(batchSource, /outreachNoteRecentSend_\(record\.email, "sales", acceptedAt\)/);
});

test("source contains formula protection, global error listeners, and recoverable action state", async () => {
  const [backend, index, signup, order, mailer] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("customer-signup.html", root), "utf8"),
    readFile(new URL("order.html", root), "utf8"),
    readFile(new URL("docs/reference/distribution-outreach/Code.gs", root), "utf8"),
  ]);
  assert.match(backend, /sheetSafeText_\(p\.rep, 100, "Rep"\)/);
  assert.match(backend, /sheetSafeText_\(it\.notes, 500, "Notes"\)/);
  assert.match(backend, /sheetSafeText_\(p\.manager_name, 100, "Manager name"\)/);
  assert.match(backend, /sheetSafeText_\(p\.sku\.sku_name, 150, "SKU name"\)/);
  for (const page of [index, signup, order]) {
    assert.match(page, /window\.addEventListener\("unhandledrejection"/);
    assert.match(page, /window\.addEventListener\("error"/);
  }
  assert.match(index, /finally \{\s*button\.disabled = false;\s*\}/);
  assert.match(index, /staffApiGet\(\{ action:"initData"/);
  assert.doesNotMatch(index, /\bapi(?:Get|Post)\(/);
  assert.match(index, /action:"outreachSendStatus"/);
  assert.match(index, /action:"outreachNewsletterContacts"/);
  assert.match(index, /action:"updateOutreachCampaignRecipient"/);
  assert.match(index, /action:"setOutreachCampaignRecipientExclusion"/);
  assert.match(index, /campaigns: outreachData\.campaigns \|\| \[\]/);
  assert.match(index, /if \(outreachView === "campaigns"\) loadOutreachCampaigns\(\)\.catch\(handleOutreachLoadError\);/);
  assert.match(backend, /Only a campaign in Review can be edited/);
  assert.match(backend, /Excluded from this campaign/);
  const dashboardSource = backend.match(/function apiGetOutreachDashboard_\([^)]*\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(dashboardSource);
  assert.doesNotMatch(dashboardSource, /ensureAccountIdentityModel_/);
  assert.doesNotMatch(dashboardSource, /newsletterContacts_/);
  assert.match(backend, /function outreachSlimRecord_\(/);
  assert.match(backend, /function outreachDisplayBusinessName_\(value\)/);
  assert.match(backend, /letter === "s" && index \+ match\.length === source\.length/);
  assert.match(backend, /newsletter_status:String\(program\.newsletter_status/);
  assert.match(backend, /opened:Number\(engagement\.open_count \|\| 0\) > 0/);
  assert.match(backend, /search_text:searchText/);
  assert.match(index, /record\.search_text/);
  assert.match(backend, /case "outreachRecord": res = apiGetOutreachRecord_\(body\);/);
  assert.match(backend, /function apiGetOutreachRecord_\(p\)/);
  assert.match(backend, /requireFields_\(p, \["source_row"\]\)/);
  assert.match(backend, /if \(requestedAccountId && accountId !== requestedAccountId\)/);
  const outreachRecordSource = backend.slice(backend.indexOf("function apiGetOutreachRecord_"), backend.indexOf("// Campaigns are immutable"));
  assert.match(outreachRecordSource, /outreachTargetedActivityMap_\(accountId, business\)/);
  assert.match(outreachRecordSource, /outreachTargetedDraftMap_\(accountId, sourceRow\)/);
  assert.match(outreachRecordSource, /event:"outreach_record_timing"/);
  assert.doesNotMatch(outreachRecordSource, /outreachActivityMap_\(\)/);
  assert.doesNotMatch(outreachRecordSource, /outreachDraftMap_\(\)/);
  assert.doesNotMatch(outreachRecordSource, /outreachProgramMap_\(\)/);
  assert.doesNotMatch(outreachRecordSource, /outreachEngagementMap_\(\)/);
  assert.match(index, /await new Promise\(resolve => setTimeout\(resolve, 2000\)\)/);
  assert.match(backend, /function apiRecordEmailEngagement_\(p\)/);
  assert.match(backend, /createTextFinder\(target\)/);
  assert.match(backend, /if \(recentDuplicate\) return \{ recorded:false, duplicate:true \}/);
  const inventoryProxy = await readFile(new URL("netlify/functions/inventory.js", root), "utf8");
  assert.doesNotMatch(inventoryProxy, /recordEmailEngagement/);
  assert.match(backend, /function outreachTrackingUrl_\(target, accountId, stage, settings, extras, testMode\)/);
  assert.ok(backend.includes(String.raw`if (!/^https:\/\/\S+$/i.test(baseUrl) || !secret || !accountId) return "";`));
  assert.match(backend, /trackedSellSheet \|\| sellSheet/);
  assert.match(backend, /trackedApplication \|\| directApplication/);
  const inventoryMessageSource = backend.slice(backend.indexOf("function outreachMessage_"), backend.indexOf("function outreachRecord_"));
  assert.match(inventoryMessageSource, /const applicationLink = \(trackedApplication \|\| directApplication\)/);
  assert.doesNotMatch(inventoryMessageSource, /stage === "Initial" && \(trackedApplication/);
  assert.match(inventoryMessageSource, /stage === "Reactivation"/);
  assert.match(inventoryMessageSource, /If you'd like to set up online ordering with us/);
  assert.match(inventoryMessageSource, /complete our short wholesale account form/);
  assert.match(mailer, /function trackingUrl_\(target, accountId, stage, settings, extras, testMode\)/);
  assert.ok(mailer.includes(String.raw`if (!/^https:\/\/\S+$/i.test(baseUrl) || !secret || !accountId) return '';`));
  assert.match(mailer, /trackedSellSheet \|\| sellSheet/);
  assert.match(mailer, /trackedApplication \|\| applicationHref/);
  assert.match(backend, /if \(testMode\) params\.x = "test"/);
  assert.match(backend, /testMode \? outreachMessage_\(current, settings, testDraft, true\)\.html : record\.preview_html/);
  assert.match(mailer, /if \(testMode\) params\.x = 'test'/);
  assert.match(mailer, /testMode \? markTestTrackingLinks_\(html\) : html/);
  const mailerTemplateValuesSource = mailer.slice(mailer.indexOf("function templateValues_"), mailer.indexOf("function formatDateValue_"));
  assert.match(mailerTemplateValuesSource, /const applicationLink = \(trackedApplication \|\| applicationHref\)/);
  assert.doesNotMatch(mailerTemplateValuesSource, /stage === 'Initial' && \(trackedApplication/);
  assert.match(mailerTemplateValuesSource, /stage === 'Reactivation'/);
  assert.match(mailerTemplateValuesSource, /If you'd like to set up online ordering with us/);
  assert.match(mailerTemplateValuesSource, /complete our short wholesale account form/);
  assert.match(backend, /function apiRepairHubStructure_\(p\)/);
  assert.match(backend, /function installNightlyHubStructureRepair\(\)/);
  assert.match(backend, /function accountIdentityLookup_\(\)/);
  assert.match(backend, /let __HUB_INVENTORY_ACTIVE = null;/);
  assert.match(backend, /let __OUTREACH_CAMPAIGN_SETTINGS = null;/);
  assert.match(backend, /const BADGER_INVOICE_CACHE_TTL_SECONDS = 900;/);
  assert.match(backend, /function cachedBadgerInvoices_\(bypassCache\)/);
  assert.match(backend, /reconcileBadgerForOrder_\(orderSheet, raw\.source_row, h, order\.badger_invoice_number, true\)/);
  const businessUpdateSource = backend.slice(backend.indexOf("function apiUpdateOutreachBusiness_"), backend.indexOf("function apiUpdateOutreachPrograms_"));
  assert.match(businessUpdateSource, /sheet\.getRange\(rowNumber, 1, 1, values\.length\)\.setValues\(\[values\]\)/);
  assert.doesNotMatch(businessUpdateSource, /getRange\(rowNumber, h\[actualKey\] \+ 1\)\.setValue/);
  assert.match(backend, /event:"customer_work_queue_timing",[\s\S]*?stages:timings/);
  const foundationalCalls = backend.match(/ensureFoundationalSheets_\(\);/g) || [];
  assert.equal(foundationalCalls.length, 2, "only initialization and repair may create foundational sheets");
  const hotPathIdentityCalls = backend.slice(backend.indexOf("function apiCreateOutreachBusiness_"), backend.indexOf("function outreachValue_") );
  assert.doesNotMatch(hotPathIdentityCalls, /ensureAccountIdentityModel_/);
  const activityMapSource = backend.slice(backend.indexOf("function outreachActivityMap_"), backend.indexOf("function getOutreachCampaignSettings_"));
  assert.doesNotMatch(activityMapSource, /ensureHeaderColumns_/);
  assert.match(backend, /today: slim \? today\.map\(record => record\.source_row\) : today/);
  assert.match(backend, /sent: slim \? sent\.slice\(0, 50\)\.map\(record => record\.source_row\) : sent\.slice\(0, 50\)/);
  const accountBuilderSource = backend.slice(backend.indexOf("function buildCustomerAccounts_"), backend.indexOf("function apiGetCustomerWorkQueue_"));
  const customerQueueSource = backend.slice(backend.indexOf("function apiGetCustomerWorkQueue_"), backend.indexOf("function makeStoreId_"));
  assert.doesNotMatch(accountBuilderSource, /ensureAccountIdentityModel_/);
  assert.doesNotMatch(customerQueueSource, /ensureAccountIdentityModel_/);
  assert.match(index, /function startZohoLogin\(\)/);
  assert.match(index, /function loadStaffSession\(\)/);
  assert.doesNotMatch(index, /distribution_staff_access/);
  const sendStateSource = index.slice(index.indexOf("function updateOutreachSendState"), index.indexOf("async function saveOutreachDraft"));
  assert.doesNotMatch(sendStateSource, /saved && outreachCanSend/);
  assert.doesNotMatch(sendStateSource, /saved && outreachTestSendAvailable/);
  assert.match(sendStateSource, /const canAttempt = saved && !outreachIsMock/);
  const sendActionSource = index.slice(index.indexOf("async function sendOutreachEmail"), index.indexOf("$(\"locBackBtn\")"));
  assert.match(sendActionSource, /res\.accepted === true && !!String\(res\.message_id/);
  assert.match(sendActionSource, /res\.test === true && !!String\(res\.message_id/);
  assert.match(index, /class="contactAvailability" aria-label="Contact availability"/);
  assert.match(index, /"No email"/);
  assert.match(index, /"No phone"/);
  assert.match(index, /id="outreachReviewRecipientAlert" role="alert" hidden/);
  assert.match(index, /const hasRecipientEmail = !!String\(selectedOutreachRecord\?\.email/);
  assert.match(index, /disabled = !canAttempt \|\| !hasRecipientEmail/);
  assert.match(index, /action:"createOutreachCampaign"/);
  assert.match(index, /action:"approveOutreachCampaign"/);
  assert.match(index, /action:"reopenOutreachCampaign"/);
  assert.match(index, /action:"sendOutreachCampaignBatch"/);
  assert.match(index, /function sendRemainingCampaign\(\)/);
  assert.match(index, /function refreshCampaignSendControls\(\)/);
  assert.match(index, /function sendCampaignRecipients\(/);
  assert.match(index, /batch_size:1/);
  assert.doesNotMatch(index, /batch_size:10/);
  assert.match(index, /data-outcome="Bad address"/);
  assert.match(index, /data-outcome="Unsubscribed"/);
  assert.match(index, /Follow-ups due/);
  assert.match(index, /function outreachOutcomeIsInterested\(/);
  assert.match(index, /function outreachFollowUpIsDue\(/);
  assert.match(index, /continue_after_block:continueAfterBlock/);
  assert.match(index, /sendCampaignRecipients\(campaign, staffName, ready, true\)/);
  assert.match(backend, /CacheService\.getScriptCache\(\)/);
  assert.match(backend, /if \(!__OUTREACH_SS\) __OUTREACH_SS = SpreadsheetApp\.openById/);
  assert.match(backend, /const reasons = testMode \? \[\] : outreachSendEligibility_\(record\)/);
  assert.match(backend, /function apiCreateOutreachCampaign_\(/);
  assert.match(backend, /function apiApproveOutreachCampaign_\(/);
  assert.match(backend, /function apiReopenOutreachCampaign_\(/);
  assert.match(backend, /function apiSendOutreachCampaignBatch_\(/);
  assert.match(backend, /if \(p\.continue_after_block !== true\) break/);
  assert.match(backend, /status === "Blocked"[\s\S]*?zoho_message_id[\s\S]*?acceptedTokens/);
  assert.match(backend, /status\] = "Sent - needs recording"/);
  assert.match(backend, /function apiApproveOutreachCampaign_[\s\S]*?LockService\.getScriptLock\(\)/);
  assert.match(backend, /const token = String\(p\.idempotency_token \|\| ""\)\.trim\(\)/);
  assert.doesNotMatch(backend, /const token = publicText_\(p\.idempotency_token/);
  assert.match(backend, /const columnCount = sheet\.getLastColumn\(\);[\s\S]*?if \(!columnCount\)/);
  assert.match(backend, /Only an unsent recipient returned to review can be edited/);
  assert.match(backend, /made here in Oshkosh/, "reopen corrects the exact non-Oshkosh subject phrase");
  assert.match(backend, /Manual batches pause for review; the explicit continue run skips uncertain recipients without retrying them/);
  assert.match(backend, /Campaign created for review\. No email was sent\./);
  assert.match(backend, /Campaign approved\. No email was sent\./);
  assert.match(backend, /OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME/);
  assert.match(backend, /batch size must be between 1 and 20/i);
  assert.match(backend, /const OUTREACH_OUTCOME_VALUES = \[/);
  assert.match(backend, /"Wrong contact", "Bad address", "Not interested", "Unsubscribed"/);
  assert.match(backend, /requireValueInList\(OUTREACH_OUTCOME_VALUES, true\)/);
  assert.match(backend, /rowRange\.setValues\(\[values\]\)/);
  assert.match(index, /Number\(campaign\.counts\?\.Blocked \|\| 0\)/);
  assert.match(await readFile(new URL("netlify/functions/inventory.js", root), "utf8"), /"sendOutreachCampaignBatch"/);
  assert.match(mailer, /if \(!testMode && !isValidEmail_\(email\)\)/);
  assert.match(mailer, /if \(!testMode && \(row\[OUTREACH\.COL\.DO_NOT_EMAIL/);
  assert.match(mailer, /function sendApprovedPilotForActiveRow\(\) \{\s*throw new Error\('Pilot Review is a read-only legacy archive/);
  assert.doesNotMatch(mailer, /PILOT_SEND_LIMIT/);
});

test("formula-like staff text is stored with a literal-text prefix", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const publicTextSource = backend.match(/function publicText_\([\s\S]*?\n\}/)?.[0];
  const sheetSafeSource = backend.match(/function sheetSafeText_\([\s\S]*?\n\}/)?.[0];
  assert.ok(publicTextSource && sheetSafeSource);
  const sanitize = new Function(`${publicTextSource}\n${sheetSafeSource}\nreturn value => sheetSafeText_(value, 500, "Test");`)();
  for (const value of ["=1+1", "+SUM(A1:A2)", "-2+3", "@evil.example"]) assert.equal(sanitize(value), `'${value}`);
  assert.equal(sanitize("Normal staff note"), "Normal staff note");
});

test("outreach details retain the latest tracked link target without changing the clicked badge", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const index = await readFile(new URL("index.html", root), "utf8");
  assert.match(backend, /last_click_target/);
  assert.match(backend, /if \(latestClick !== summary\.last_clicked && row\.target\) summary\.last_click_target/);
  assert.match(index, /Link clicks \(sell sheet \/ application\)/);
  assert.match(index, /Most recent link click target/);
  assert.match(index, /\bclicked\b/i, "the existing Clicked badge remains rendered by the app");
});

test("campaign reconciliation uses targeted accepted Activity Log records without resending", async () => {
  const [backend, proxy] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("netlify/functions/inventory.js", root), "utf8"),
  ]);
  const reconciliationSource = backend.slice(backend.indexOf("function campaignAcceptedActivity_"), backend.indexOf("function campaignRecipientFooterHtml_"));
  assert.match(backend, /case "reconcileCampaignSends": res = apiReconcileCampaignSends_\(body\);/);
  assert.match(reconciliationSource, /outreachRowsMatchingCell_\(sheet, \["idempotency_token", "Idempotency Token"\], recipientToken\)/);
  assert.match(reconciliationSource, /result\.includes\("APP SENT"\)/);
  assert.match(reconciliationSource, /const campaignStage = String\(campaignStoredCriteria_\(campaign\.values\[campaign\.headers\.criteria\]\)\?\.stage \|\| "Initial"\)/);
  assert.match(reconciliationSource, /advanceOutreachSend_\(leadSheet, directory\.row, record, campaignStage, activity\.message_id, activity\.sent_at, settings\)/);
  assert.match(reconciliationSource, /Reconciled from Activity Log: Zoho accepted\./);
  assert.doesNotMatch(reconciliationSource, /callOutreachMailer_|appendOutreachActivity_/);
  assert.match(backend, /function reconcileBlockedCampaignSends\(\)/);
  assert.match(proxy, /"reconcileCampaignSends"/);
  assert.match(proxy, /\["reconcileCampaignSends", "outreach"\]/);
});

test("campaign rebuilding reconciles first and changes only review-ready snapshots", async () => {
  const [backend, proxy] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("netlify/functions/inventory.js", root), "utf8"),
  ]);
  const rebuildSource = backend.slice(backend.indexOf("function apiRebuildCampaignRecipients_"), backend.indexOf("function campaignRecipientFooterHtml_"));
  assert.match(backend, /case "rebuildCampaignRecipients": res = apiRebuildCampaignRecipients_\(body\);/);
  assert.match(rebuildSource, /if \(String\(campaign\.values\[ch\.status\] \|\| ""\) !== "Review"\) throw new Error\("Campaign must be in Review/);
  assert.match(rebuildSource, /reconcileBlockedCampaignSends_\(sheets, campaign, recipients, staffName\)/);
  assert.match(rebuildSource, /filter\(item => String\(item\.values\[item\.headers\.status\] \|\| ""\) === "Ready for review"\)/);
  assert.match(rebuildSource, /campaignRecipientWasEdited_/);
  assert.match(rebuildSource, /outreachPlainTextToHtml_\(String\(item\.values\[rh\.body_text\] \|\| ""\)\) \+ String\(message\.footer_html \|\| ""\)/);
  assert.match(rebuildSource, /item\.values\[rh\.html\] = message\.html/);
  assert.match(rebuildSource, /campaign\.values\[ch\.approval_token\] = ""/);
  assert.match(rebuildSource, /REBUILD_CAMPAIGN_RECIPIENTS/);
  assert.match(backend, /function rebuildUnsentCampaignEmails\(\)/);
  assert.match(proxy, /"rebuildCampaignRecipients"/);
  assert.match(proxy, /\["rebuildCampaignRecipients", "outreach"\]/);
});

test("campaign criteria preview uses centroid distances, JSON rules, and distinct send-time exclusions", async () => {
  const [backend, index, proxy] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("netlify/functions/inventory.js", root), "utf8"),
  ]);
  const previewSource = backend.slice(backend.indexOf("function apiPreviewOutreachCampaign_"), backend.indexOf("function apiApproveOutreachCampaign_"));
  const sendSource = backend.slice(backend.indexOf("function apiSendOutreachCampaignBatch_"), backend.indexOf("function outreachStatusForOutcome_"));
  const normalizeZipSource = backend.match(/function normalizeZip_\([\s\S]*?\n\}/)?.[0];
  const normalizeZip = new Function(`${normalizeZipSource}\nreturn normalizeZip_;`)();
  assert.equal(normalizeZip("53511.0"), "53511");
  assert.equal(normalizeZip(5000), "05000");
  assert.match(backend, /function normalizeZip_\(/);
  assert.match(backend, /function zipCentroidMap_\(/);
  assert.match(backend, /latitude:latitude/);
  assert.match(backend, /longitude:longitude/);
  assert.match(backend, /function milesBetweenCoordinates_\(/);
  assert.match(backend, /function campaignCenterForCriteria_\(/);
  assert.match(backend, /cache\.put\(cacheKey, JSON\.stringify\(Object\.fromEntries\(map\)\), 21600\)/);
  assert.match(backend, /ensureHeaderColumns_\(sheet, \["Miles Source"\]\)/);
  assert.match(backend, /function apiRecalculateOutreachMiles_\(/);
  assert.match(backend, /authenticated_staff_role.*!== "admin"/);
  assert.match(backend, /function recalculateOutreachMiles\(\)/);
  assert.match(backend, /"Criteria"/);
  assert.match(backend, /function campaignStoredCriteria_\(/);
  assert.doesNotMatch(backend, /function campaignAudienceRules_\(/);
  assert.match(previewSource, /function apiPreviewOutreachCampaign_\(/);
  assert.match(previewSource, /preview_confirmed !== true/);
  assert.match(previewSource, /campaignDirectoryInitialRecords_\(criteria\)/);
  assert.match(previewSource, /JSON\.stringify\(criteria\)/);
  assert.match(sendSource, /campaignStoredCriteria_\(campaign\.values\[ch\.criteria\]\)/);
  assert.match(sendSource, /Excluded — out of area/);
  assert.match(sendSource, /Excluded — below fit/);
  assert.match(proxy, /ADMIN_ACTIONS = new Set\([\s\S]*?"recalculateOutreachMiles"/);
  assert.match(proxy, /\["recalculateOutreachMiles", "outreach"\]/);
  assert.match(proxy, /"previewOutreachCampaign"/);
  assert.match(proxy, /const UPSTREAM_TIMEOUT_MS = 25000/);
  assert.match(proxy, /const SEND_UPSTREAM_TIMEOUT_MS = 24000/);
  assert.match(proxy, /const UPSTREAM_WRITE_ATTEMPTS = 1/);
  assert.match(index, /id="recalculateOutreachMilesBtn"/);
  assert.match(index, /action:"recalculateOutreachMiles"/);
  assert.match(index, /id="outreachCampaignCriteriaCenterType"/);
  assert.match(index, /id="previewOutreachCampaignCriteriaBtn"/);
  assert.match(index, /action:"previewOutreachCampaign"/);
  assert.match(index, /preview_confirmed:true/);
  assert.match(index, /recipient\.city/);
  assert.match(index, /Area review needed/);
});

test("campaign review exclusions are inline and previews use directory fields without rendered email", async () => {
  const [backend, index] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  const previewSource = backend.slice(backend.indexOf("function apiPreviewOutreachCampaign_"), backend.indexOf("function apiCreateOutreachCampaign_"));
  const exclusionSource = backend.slice(backend.indexOf("function apiSetOutreachCampaignRecipientExclusion_"), backend.indexOf("function apiUpdateOutreachCampaignRecipient_"));
  const campaignUiSource = index.slice(index.indexOf("async function openOutreachCampaign"), index.indexOf("function renderOutreach", index.indexOf("async function openOutreachCampaign")));
  assert.match(backend, /function campaignDirectoryInitialRecords_\(criteria\)/);
  assert.match(previewSource, /campaignDirectoryInitialRecords_\(criteria\)/);
  assert.doesNotMatch(previewSource, /outreachMessage_\(/);
  for (const field of ["postal_code", "craft_spirit_fit", "status", "email", "last_emailed"]) assert.match(previewSource, new RegExp(`${field}:record\\.${field}`));
  assert.match(exclusionSource, /\["Sent", "Sent - needs recording"\]\.includes/);
  assert.match(exclusionSource, /Sent recipients cannot be excluded or restored/);
  assert.doesNotMatch(campaignUiSource, /prompt\(/);
  assert.match(campaignUiSource, /data-campaign-exclusion-form/);
  assert.match(campaignUiSource, /data-campaign-exclusion-reason="Out of area"/);
  assert.match(campaignUiSource, /data-campaign-recipient-action="confirm-exclude"/);
  assert.match(campaignUiSource, /data-campaign-recipient-action="show-exclude"/);
  assert.match(index, /<select id="outreachCampaignCriteriaCounty">/);
  assert.match(index, /<select id="outreachCampaignCriteriaSegment">/);
  assert.match(index, /function populateCampaignCriteriaOptions\(\)/);
  assert.match(index, /fill\("outreachCampaignCriteriaCounty", "county", "Any county"\)/);
  assert.match(index, /fill\("outreachCampaignCriteriaSegment", "segment", "Any segment"\)/);
  assert.doesNotMatch(index, /escapeHtml\(res\.audience/);
});

test("campaign freeze fully rechecks duplicate sends while preview and send stay targeted", async () => {
  const [backend, index] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  const freezeSource = backend.slice(backend.indexOf("function campaignEligibleInitialRecords_"), backend.indexOf("function campaignRecipientSnapshotValues_"));
  const sendSource = backend.slice(backend.indexOf("function apiSendOutreachCampaignBatch_"), backend.indexOf("function campaignSendLightweightRecord_"));
  const pilotSource = backend.slice(backend.indexOf("function legacyPilotSent_"), backend.indexOf("function initialSentActivityForRecipient_"));
  assert.match(freezeSource, /outreachRecord_\(/);
  assert.match(freezeSource, /outreachSendEligibility_\(record, \{ initial_sent_emails:selection\.initial_sent_emails \}\)/);
  assert.match(freezeSource, /removed_by_duplicate_checks:directoryRecords\.length - records\.length/);
  assert.match(backend, /function campaignInitialSentEmailSet_\(/);
  assert.match(backend, /intended_recipient/, "preview checks Activity Log recipient fields");
  assert.match(backend, /delivered_to/, "preview checks delivered-to fallback fields");
  assert.match(pilotSource, /__LEGACY_PILOT_SENT_BY_EMAIL/);
  assert.match(pilotSource, /getAllRowsAsObjects_\(sheet\)\.forEach/, "Pilot Review is read once into a memoized lookup");
  assert.match(backend, /function initialSentActivityForRecipient_\(/);
  assert.match(backend, /createTextFinder/, "send-time duplicate check remains targeted");
  assert.match(sendSource, /initialSentActivityForRecipient_\(record\.email\) \|\| initialSentDirectoryEmailElsewhere_\(record\.email, sourceRow\)/);
  assert.match(index, /previewed, \$\{frozen\} frozen — \$\{removed\} removed by duplicate checks/);
  assert.match(index, /preview_recipient_count/);
  assert.match(index, /removed_by_duplicate_checks/);
});

test("campaign send timeouts reconcile one recipient before continuing and never resend an unknown result", async () => {
  const [backend, index] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  const sendSource = backend.slice(backend.indexOf("function apiSendOutreachCampaignBatch_"), backend.indexOf("function outreachStatusForOutcome_"));
  const clientSource = index.slice(index.indexOf("async function sendCampaignRecipients"), index.indexOf("async function sendOutreachCampaignBatch"));
  assert.doesNotMatch(sendSource, /outreachActivityMap_\(\)/);
  assert.doesNotMatch(sendSource, /outreachDraftMap_\(\)/);
  assert.doesNotMatch(sendSource, /outreachProgramMap_\(\)/);
  assert.doesNotMatch(sendSource, /outreachEngagementMap_\(\)/);
  assert.match(sendSource, /campaignSendLightweightRecord_\(current, sourceRow\)/);
  assert.match(sendSource, /outreachSendEligibility_\(record, \{ skip_legacy_pilot:true \}\)/);
  assert.match(sendSource, /outreach_campaign_send_timing/);
  assert.match(backend, /function acceptedOutreachSendForToken_[\s\S]*?outreachRowsMatchingCell_/);
  assert.match(clientSource, /campaignSendOutcomeIsUnknown\(error\)/);
  assert.match(clientSource, /action:"reconcileCampaignSends", campaign_id:campaign\.campaign_id, idempotency_token:expected\.idempotency_token/);
  assert.match(clientSource, /\["Sent", "Sent - needs recording"\]\.includes\(recipient\?\.status\)/);
  assert.match(clientSource, /no resend was attempted/);
  assert.match(clientSource, /continue;/);
});

test("outreach nurture lifecycle handles cocktail replies, tasting visits, and due check-ins", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const functionSource = (name, nextName) => backend.slice(backend.indexOf(`function ${name}`), backend.indexOf(`function ${nextName}`));
  const statusForOutcome = new Function(`${functionSource("outreachStatusForOutcome_", "appendOutreachActivity_")}; return outreachStatusForOutcome_;`)();
  const nextStage = new Function(`${functionSource("outreachNextStage_", "outreachAddDays_")}; return outreachNextStage_;`)();
  const eligibility = new Function(
    "outreachStatusLower_", "outreachIsCocktailListOutcome_", "outreachDate_", "legacyPilotSent_", "outreachStageIsDue_", "outreachRecentStageSend_", "outreachCrossSendCooldownReason_", "NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS",
    `${functionSource("outreachSendEligibility_", "outreachNextStage_")}; return outreachSendEligibility_;`
  )(
    record => String(record.status || "").trim().toLowerCase(),
    outcome => String(outcome || "").trim().toLowerCase() === "wants cocktail list",
    value => { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? "" : date; },
    () => false,
    record => !!record.next_follow_up && new Date(record.next_follow_up).getTime() <= Date.now() + 86400000,
    (record, stage, cooldownDays) => (record.activity || []).some(item => String(item.stage || "").toLowerCase() === String(stage).toLowerCase() && new Date(item.timestamp).getTime() >= Date.now() - cooldownDays * 86400000),
    () => "",
    60,
  );

  assert.equal(statusForOutcome("Wants cocktail list"), "Nurture");
  assert.equal(statusForOutcome("Tasting visit"), "Interested");
  assert.equal(nextStage("Follow-up 2"), "Nurture check-in");
  assert.ok(eligibility({ email:"cocktails@example.test", next_email:"Follow-up 1", status:"Nurture", outcome:"Wants cocktail list", activity:[] }).includes("Recipient receives the cocktail list instead of sales outreach"));
  assert.deepEqual(eligibility({ email:"nurture@example.test", next_email:"Nurture check-in", status:"Nurture", next_follow_up:new Date(Date.now() - 86400000), activity:[] }), []);
  assert.ok(eligibility({ email:"tomorrow@example.test", next_email:"Follow-up 1", status:"Sent", next_follow_up:new Date(Date.now() + 2 * 86400000), activity:[] }).includes("Follow-up date has not arrived"));

  const upsertSource = functionSource("upsertNewsletterFromCocktailReply_", "appendOutreachActivity_");
  const headers = ["contact_id", "account_id", "name", "email", "organization", "relationship_type", "status", "consent_source", "consent_date", "source_row", "source_business", "topics", "notes", "updated_at", "updated_by", "app_version"];
  const headerMap = Object.fromEntries(headers.map((header, index) => [header, index]));
  const existing = ["contact-existing", "OLD", "Old contact", "cocktails@example.test", "Old business", "Prospect", "Candidate", "", "", "", "", "", "", "", "", ""];
  const writes = [];
  const sheet = {
    getLastRow:() => 2,
    getLastColumn:() => headers.length,
    getRange:(row) => ({
      getValues:() => [existing],
      setValues:values => writes.push({ row, values }),
    }),
  };
  const upsertCocktailReply = new Function(
    "getNewsletterContactsSheet_", "getHeaderMap_", "Utilities", "APP_VERSION",
    `${upsertSource}; return upsertNewsletterFromCocktailReply_;`
  )(() => sheet, () => headerMap, { getUuid:() => "new-contact-id" }, "test-version");
  upsertCocktailReply({ account_id:"ACC-1", source_row:7, business:"Example Bar", contact:"Alex", email:"cocktails@example.test", relationship:"Customer" }, new Date("2026-10-03T12:00:00"));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].row, 2, "an existing email is updated rather than appended");
  const saved = writes[0].values[0];
  assert.equal(saved[headerMap.status], "Subscribed");
  assert.equal(saved[headerMap.relationship_type], "Customer");
  assert.equal(saved[headerMap.consent_source], 'Replied "cocktails" to outreach email');
  assert.equal(saved[headerMap.topics], "Monthly cocktail ideas");
  assert.equal(saved[headerMap.source_row], 7);
  assert.equal(saved[headerMap.contact_id], "contact-existing");

  const index = await readFile(new URL("index.html", root), "utf8");
  assert.match(index, /data-outcome="Wants cocktail list"/);
  assert.match(index, /data-outcome="Tasting visit"/);
  assert.match(index, /OUTREACH_INTERESTED_OUTCOMES = \[\.\.\.OUTREACH_FOLLOW_UP_OUTCOMES, "Tasting visit"\]/);
});

test("campaign builder freezes and delivers the requested outreach stage", async () => {
  const [backend, index] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  const criteriaSource = backend.slice(backend.indexOf("function campaignCriteriaFromRequest_"), backend.indexOf("function campaignAudienceLabel_"));
  const selectionSource = backend.slice(backend.indexOf("function campaignDirectoryStageSelection_"), backend.indexOf("function campaignDirectoryInitialSelection_"));
  const sendSource = backend.slice(backend.indexOf("function apiSendOutreachCampaignBatch_"), backend.indexOf("function outreachStatusForOutcome_"));
  assert.match(criteriaSource, /const stages = \["Initial", "Follow-up 1", "Follow-up 2", "Nurture check-in"\]/);
  assert.match(criteriaSource, /stage:stage/);
  assert.match(criteriaSource, /source_campaign_id:sourceCampaignId/);
  assert.match(selectionSource, /record\.next_email\.toLowerCase\(\) === stage\.toLowerCase\(\)/);
  assert.match(selectionSource, /campaignSourceRows_\(criteria\.source_campaign_id\)/);
  assert.match(sendSource, /const campaignStage = String\(campaignCriteria\?\.stage \|\| "Initial"\)/);
  assert.match(sendSource, /Outreach stage changed after review/);
  assert.match(sendSource, /message_stage:campaignStage/);
  assert.match(sendSource, /finalizeOutreachSend_\(leadSheet, sourceRow, record, campaignStage/);
  assert.match(index, /id="outreachCampaignCriteriaStage"/);
  assert.match(index, /id="outreachCampaignCriteriaSourceCampaign"/);
  assert.match(index, /source_campaign_id:\$\("outreachCampaignCriteriaSourceCampaign"\)\.value/);
  assert.match(index, /campaign\.criteria\?\.stage \|\| "Initial"/);
});

test("Deploy A review corrections repair validations and retain a campaign's stage", async () => {
  const [backend, mailer, status] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("docs/reference/distribution-outreach/Code.gs", root), "utf8"),
    readFile(new URL("PROJECT_STATUS.md", root), "utf8"),
  ]);
  const repairSource = backend.slice(backend.indexOf("function setOutreachDirectoryValidation_"), backend.indexOf("function repairHubStructure_"));
  const rebuildSource = backend.slice(backend.indexOf("function apiRebuildCampaignRecipients_"), backend.indexOf("function rebuildUnsentCampaignEmails"));
  const reconcileSource = backend.slice(backend.indexOf("function reconcileBlockedCampaignSends_"), backend.indexOf("function apiReconcileCampaignSends_"));
  assert.match(repairSource, /OUTREACH_DIRECTORY_STAGE_VALUES/);
  assert.match(repairSource, /OUTREACH_DIRECTORY_STATUS_VALUES/);
  assert.match(repairSource, /OUTREACH_OUTCOME_VALUES/);
  assert.match(backend, /const OUTREACH_DIRECTORY_STAGE_VALUES = \["Initial", "Follow-up 1", "Follow-up 2", "Nurture check-in", "Reactivation", "Complete"\]/);
  assert.match(backend, /"Use reactivation", "Nurture"/);
  assert.match(backend, /function outreachStageIsDue_\(/);
  assert.match(backend, /Follow-up date has not arrived/);
  assert.match(rebuildSource, /const campaignStage = String\(campaignStoredCriteria_\(campaign\.values\[ch\.criteria\]\)\?\.stage \|\| "Initial"\)/);
  assert.match(rebuildSource, /next_email:campaignStage, stage:campaignStage/);
  assert.match(rebuildSource, /Skipped — outreach stage changed/);
  assert.match(reconcileSource, /const campaignStage = String\(campaignStoredCriteria_\(campaign\.values\[campaign\.headers\.criteria\]\)\?\.stage \|\| "Initial"\)/);
  assert.match(reconcileSource, /advanceOutreachSend_\(leadSheet, directory\.row, record, campaignStage/);
  assert.match(backend, /NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS = 60/);
  const mailerVersion = mailer.match(/VERSION: ([^\s]+)/)[1];
  assert.match(mailer, new RegExp(`const OUTREACH_VERSION = '${mailerVersion.replace(/\./g, "\\.")}';`));
  assert.match(mailer, /function appStageWasRecentlySent_\(/);
  assert.match(mailer, /stage === 'Nurture check-in'/);
  // The status table must name the Inventory API version currently in Code.gs (it moves with every release).
  const backendVersion = backend.match(/const APP_VERSION = "([^"]+)";/)[1];
  assert.ok(status.includes(`| Inventory API Apps Script | \`${backendVersion}\``), `PROJECT_STATUS.md lists Inventory API ${backendVersion}`);
  assert.ok(status.includes(`| Distribution Outreach Apps Script | \`${mailerVersion}\``), `PROJECT_STATUS.md lists Distribution Outreach ${mailerVersion}`);
});

test("campaign rebuild UI and first-draft save gate preserve review-before-send", async () => {
  const index = await readFile(new URL("index.html", root), "utf8");
  assert.match(index, /id="rebuildCampaignRecipientsBtn"/);
  assert.match(index, /action:"rebuildCampaignRecipients"/);
  assert.match(index, /const ready = Number\(campaign\?\.counts\?\.\["Ready for review"\] \|\| 0\)/);
  assert.match(index, /Re-approve before sending/);
  assert.match(index, /\$\("saveOutreachDraftBtn"\)\.disabled = !dirty && !!selectedOutreachRecord\.has_saved_draft/);
  assert.match(index, /if \(!selectedOutreachRecord \|\| \(selectedOutreachRecord\.has_saved_draft && !outreachDraftIsDirty\(\)\)\) return;/);
  assert.match(index, /const saved = !!selectedOutreachRecord\?\.has_saved_draft && !outreachDraftIsDirty\(\)/);
});

test("Badger Phase 4 keeps payment states, reminder guards, batching, and review controls", async () => {
  const [backend, index, proxy] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("netlify/functions/inventory.js", root), "utf8"),
  ]);
  const accountBuilder = backend.slice(backend.indexOf("function buildCustomerAccounts_"), backend.indexOf("function apiGetCustomerWorkQueue_"));
  const syncState = backend.slice(backend.indexOf("function badgerSyncState_"), backend.indexOf("function badgerPaymentMarks_"));
  const reminderResolver = backend.slice(backend.indexOf("function apiResolvePaymentReminder_"), backend.indexOf("function makeStoreId_"));
  const reminderSend = backend.slice(backend.indexOf("function apiSendBadgerPaymentReminder_"), backend.indexOf("function apiResolvePaymentReminder_"));
  const batchWriter = backend.slice(backend.indexOf("function writeBadgerPaymentMarksBatch_"), backend.indexOf("function apiMarkBadgerInvoicePayment_"));
  const reconcile = backend.slice(backend.indexOf("function badgerReconcileGroups_"), backend.indexOf("function badgerRequest_"));
  assert.match(accountBuilder, /badgerInvoicePaymentState_\(badgerStatusIsFresh, invoice\.is_closed, paymentMark\.paid_to_me, paymentMark\.submitted\)/);
  assert.match(accountBuilder, /invoiceDate && invoiceDate\.getTime\(\) < paymentReminderCutoff/);
  assert.match(accountBuilder, /has_payment_mark:activePaymentMarkKeys\.has\(invoiceKey\)/);
  assert.match(accountBuilder, /payment_reminder_eligible_invoices:paymentReminderEligibleInvoices/);
  assert.match(syncState, /rowCountMatches/);
  assert.match(syncState, /BADGER_SYNC_MAX_AGE_MS && rowCountMatches/);
  assert.match(reminderSend, /content\.content_fingerprint !== fingerprint/);
  assert.match(reminderSend, /invoice balance changed after preview/);
  assert.match(reminderResolver, /status\] \|\| ""\)\.toUpperCase\(\) !== "PENDING"/);
  assert.match(reminderResolver, /24 \* 60 \* 60 \* 1000/);
  assert.match(reminderResolver, /This reminder is no longer current/);
  assert.match(batchWriter, /const rows = sheet\.getRange\(2, 1, rowCount, sheet\.getLastColumn\(\)\)\.getValues\(\)/);
  assert.match(batchWriter, /log\.getRange\(log\.getLastRow\(\) \+ 1, 1, logRows\.length, log\.getLastColumn\(\)\)\.setValues\(logRows\)/);
  assert.match(batchWriter, /Badger payment batch/);
  assert.match(backend, /writeBadgerPaymentMarksBatch_\(invoices\.map\(invoiceNumber => \(\{ invoice_number:invoiceNumber, paid_to_me:true, submitted:"Yes", require_owed:true \}\)\)/);
  assert.match(reconcile, /paid_not_marked:\[\], paid_check_no:\[\], unpaid_review:\[\], missing_tracker:\[\]/);
  assert.match(reconcile, /new Set\(\["paid_not_marked", "paid_check_no"\]\)/);
  assert.match(backend, /BADGER_BASE_URL = "https:\/\/badgerstatecoop\.com\/BSWCSite"/);
  assert.match(backend, /function badgerUrl_\(method, path\)/);
  assert.match(backend, /Badger request method or path is not allow-listed/);
  assert.match(proxy, /"recordBadgerCheck"/);
  assert.match(proxy, /"resolvePaymentReminder"/);
  assert.match(index, /id="recordBadgerCheckBtn"/);
  assert.match(index, /data-payment-reminder-resolution="retry"/);
  assert.match(index, /data-badger-reconcile-apply="paid_not_marked"/);
  assert.match(index, /Badger status is stale or unavailable/);
  assert.match(index, /id="owedToBadgerCount"/);
});

test("Badger Phase 5 invoice creation is review-gated and uses a narrow API boundary", async () => {
  const [backend, index, proxy] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("netlify/functions/inventory.js", root), "utf8"),
  ]);
  const stateSource = backend.slice(backend.indexOf("function badgerInvoicePaymentState_"), backend.indexOf("function cachedBadgerInvoices_"));
  const paymentState = vm.runInNewContext(`${stateSource}; badgerInvoicePaymentState_`);
  assert.equal(paymentState(false, false, false, ""), "Unknown");
  assert.equal(paymentState(true, true, false, ""), "Closed");
  assert.equal(paymentState(true, false, false, ""), "Customer owes");
  assert.equal(paymentState(true, false, true, "No"), "Owed to Badger");
  assert.equal(paymentState(true, false, true, "Yes"), "Check sent");
  assert.equal(paymentState(true, false, true, "N/A"), "Awaiting Badger");
  const urlSource = backend.slice(backend.indexOf("function badgerUrl_"), backend.indexOf("function badgerCookieHeader_"));
  assert.match(urlSource, /\/Api\/Invoice\/Paged\/orderorinvoicenumber/);
  assert.match(urlSource, /\^\\\/api\\\/invoice\\\/\\d\+\$/);
  assert.match(urlSource, /\^\\\/api\\\/customer\\\/\\d\+\$/);
  assert.match(urlSource, /validateforcreate\\\?number=\\d\{4\}/);
  assert.doesNotMatch(urlSource, /validateforcreate\\\?number=SS/);
  assert.match(urlSource, /method or path is not allow-listed/);
  const badgerUrl = vm.runInNewContext(`const BADGER_BASE_URL = "https://badger.example"; ${urlSource}; badgerUrl_`);
  assert.equal(badgerUrl("GET", "/api/invoice/validateforcreate?number=0163&date=2026-09-30"), "https://badger.example/api/invoice/validateforcreate?number=0163&date=2026-09-30");
  assert.throws(() => badgerUrl("GET", "/api/invoice/validateforcreate?number=SS0163&date=2026-09-30"));
  assert.throws(() => badgerUrl("PUT", "/api/invoice/1"));
  const creationSource = backend.slice(backend.indexOf("function apiCreateBadgerInvoice_"), backend.indexOf("function apiAdoptBadgerInvoice_"));
  const draftSource = backend.slice(backend.indexOf("function badgerInvoiceDraft_"), backend.indexOf("function badgerInvoiceMatchesDraft_"));
  assert.match(creationSource, /p\?\.reviewed !== true/);
  assert.match(creationSource, /draft\.draft_fingerprint !== fingerprint/);
  assert.match(creationSource, /status === "PENDING"/);
  assert.match(draftSource, /This order already has a Badger invoice/);
  assert.match(draftSource, /badgerNextInvoiceNumber_\(\)/);
  assert.doesNotMatch(creationSource, /badgerNextInvoiceNumber_\(\)/, "create never auto-bumps a number after validation");
  assert.match(creationSource, /badgerValidateInvoiceNumber_\(draft\.invoice_number, draft\.date\)/);
  assert.match(creationSource, /Invoice may have been created — check before retrying/);
  assert.match(creationSource, /badgerRemoteInvoiceDetails_/);
  assert.doesNotMatch(backend, /function seedCurrentPricesTab\(\)|BADGER_CURRENT_PRICES_SHEET_NAME/, "Current Prices tab is retired; prices live on SKUs");
  const tierPriceSource = backend.slice(backend.indexOf("function priceTierCents_"), backend.indexOf("function badgerPriceForOrderLine_"));
  assert.match(tierPriceSource, /getSs_\(\)\.getSheetByName\(PRICE_TIERS_SHEET_NAME\)/);
  assert.match(tierPriceSource, /getSs_\(\)\.getSheetByName\(CUSTOMER_PRICES_SHEET_NAME\)/);
  assert.match(backend, /parameters:\{ value:String\(invoiceNumber \|\| ""\) \}/);
  assert.match(backend, /Utilities\.formatDate\(new Date\(`\$\{draft\.date\}T00:00:00`\), "America\/Chicago", "yyyy-MM-dd'T'HH:mm:ssXXX"\)/);
  assert.match(proxy, /"createBadgerInvoice"/);
  assert.match(proxy, /SEND_ACTIONS = new Set\([\s\S]*?"createBadgerInvoice"/);
  assert.match(index, /id="previewBadgerInvoiceBtn"/);
  assert.match(index, /id="badgerInvoiceReviewed"/);
  assert.match(index, /action:"createBadgerInvoice"/);
  assert.match(index, /id="failBadgerInvoiceCreationBtn"/);
  assert.match(index, /if \(!applied\.ok\) throw new Error\(applied\.error \|\| "Reconciliation was not applied\."\)/);

  const validationSource = backend.slice(backend.indexOf("function badgerValidationError_"), backend.indexOf("function badgerValidateInvoiceNumber_"));
  const validationError = vm.runInNewContext(`${validationSource}; badgerValidationError_`);
  assert.match(validationError({ data:0, isSuccess:false, hasErrors:true, errors:["The invoice number is already used."] }), /already used/);
  assert.equal(validationError({ isSuccess:true, hasErrors:false }), "");
  let validationPath = "";
  const validateInvoiceNumber = vm.runInNewContext(`${validationSource}\n${backend.slice(backend.indexOf("function badgerValidateInvoiceNumber_"), backend.indexOf("function badgerOrderForInvoice_"))}; badgerValidateInvoiceNumber_`, { badgerJson_:(path) => { validationPath = path; return { isSuccess:true, hasErrors:false }; } });
  assert.equal(validateInvoiceNumber("SS0163", "2026-09-30"), true);
  assert.match(validationPath, /number=0163/);

  const customerSource = backend.slice(backend.indexOf("function badgerBillToCustomer_"), backend.indexOf("function badgerInvoiceDraft_"));
  const billToCustomer = vm.runInNewContext(`${customerSource}; badgerBillToCustomer_`);
  assert.equal(JSON.stringify(billToCustomer({ name:"North Bar", resellerNumber:"R-4", addressLine1:"10 Main", addressLine2:"Suite B", city:"Oshkosh", postalCode:"54901" })), JSON.stringify({
    id:"", billToName:"North Bar", billToResellerNumber:"R-4", billToAddressLine1:"10 Main", billToAddressLine2:"Suite B", billToCity:"Oshkosh", billToPostalCode:"54901", email:"", phone:"",
  }));

  const moneySource = backend.slice(backend.indexOf("function badgerMoneyToCents_"), backend.indexOf("function badgerMoneyLabel_"));
  const priceSource = backend.slice(backend.indexOf("function skuWholesaleCents_"), backend.indexOf("function skuPriceRow_"));
  const wholesaleCents = vm.runInNewContext(`${moneySource}\n${priceSource}; skuWholesaleCents_`);
  assert.equal(wholesaleCents({ wholesale_price:"12.50", price_tier:"Standard" }, new Map([["standard", 2200]])), 1250);
  assert.equal(wholesaleCents({ wholesale_price:"", price_tier:"Standard" }, new Map([["standard", 2200]])), 2200);

  const refreshSource = backend.slice(backend.indexOf("function badgerResponseNeedsSessionRefresh_"), backend.indexOf("function badgerRequest_"));
  const needsRefresh = vm.runInNewContext(`${refreshSource}; badgerResponseNeedsSessionRefresh_`);
  assert.equal(needsRefresh("POST", "/api/invoice", 200, "not json"), false, "create is sent exactly once even on a non-JSON response");
  assert.equal(needsRefresh("GET", "/api/invoice/validateforcreate?number=0163&date=2026-09-30", 200, JSON.stringify({ isAuthorized:false, hasErrors:true, errors:["taken"] })), false);
});

test("customer billing workflow keeps real Badger invoices distinct from Online requests", async () => {
  const [backend, index, proxy] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("netlify/functions/inventory.js", root), "utf8"),
  ]);
  const accountBuilder = backend.slice(backend.indexOf("function buildCustomerAccounts_"), backend.indexOf("function apiGetCustomerWorkQueue_"));
  const customerQueue = backend.slice(backend.indexOf("function apiGetCustomerWorkQueue_"), backend.indexOf("function getBadgerPaymentRemindersSheet_"));
  const invoiceRecordsSource = index.slice(index.indexOf("function customerInvoiceRecords"), index.indexOf("function customerStatusOptions"));
  const recordsForViewSource = index.slice(index.indexOf("function customerRecordsForView"), index.indexOf("function customerStatusBadge"));
  assert.match(accountBuilder, /sourceOrder \? Object\.assign\(\{\}, invoice, \{ request_id:sourceOrder\.request_id, online_request:true \}\) : invoice/);
  assert.match(backend, /function linkCreatedBadgerInvoiceToOrder_\([\s\S]*?set\("badger_invoice_number", draft\.invoice_number\)/);
  assert.match(customerQueue, /order\.badger_payment_status = invoice\.payment_status \|\| invoice\.invoice_status \|\| "Unknown"/);
  assert.match(index, /Invoices & payments/);
  assert.match(index, />Online requests</);
  assert.match(index, /Online request \$\{escapeHtml\(record\.request_id\)\}/);
  assert.match(index, /Needs account match/);
  assert.match(index, /const CUSTOMER_VIEW_DATA = \{ accounts:"accounts", online_requests:"orders", applications:"applications" \}/);
  assert.match(index, /customerData\[CUSTOMER_VIEW_DATA\[customerView\]\]/);
  assert.match(index, /data-badger-invoice-action="link"/);
  assert.match(index, /action:"linkBadgerInvoice"/);
  assert.match(index, /mode:"restore"/);
  assert.match(index, /data-badger-payment="paid_badger"/);
  assert.match(index, /data-badger-payment="paid_me"/);
  assert.match(index, /data-badger-owed-invoice/);
  assert.match(index, /data-badger-payment="undo"/);
  assert.match(index, /markBadgerPayment\(paymentButton\)/);
  assert.match(index, /Reminder eligible/);
  assert.match(index, /label:`\$\{option\.label\} \(\$\{countFor\(option\.value\)\}\)`/);
  assert.match(index, /reminder_eligible:reminderEligible\.has/);
  assert.match(index, /const dialogAccountId = button\.closest\("#customerRecordDialog"\) \? selectedCustomerRecord\?\.account_id : ""/);
  assert.match(index, /\[\.\.\.new Set\(Array\.from\(document\.querySelectorAll\("\[data-badger-owed-invoice\]:checked"\)\)/);
  assert.match(proxy, /"customerAccountIndex"/);
  assert.match(proxy, /"linkBadgerInvoice"/);
  const customerInvoiceRecords = vm.runInNewContext(`${invoiceRecordsSource}; customerInvoiceRecords`, {
    customerData:{
      accounts:[{ account_id:"A-1", business_name:"North Bar", contact_name:"Nora", email:"nora@example.test", invoices:[{ invoice_number:"SS0163", invoice_date:"2026-10-01", amount:"$50.00", payment_status:"Customer owes" }], payment_reminder_eligible_invoices:[{ invoice_number:"SS0163" }] }],
      unmatchedBadgerInvoices:[{ invoice_number:"SS0164", invoice_date:"2026-09-30", customer_name:"No Match", amount:"$25.00", match_reason:"No account match" }],
      ignoredBadgerInvoices:[{ invoice_number:"SS0165", invoice_date:"2026-09-29", customer_name:"Ignore Me", amount:"$10.00" }],
    },
    Set, Date,
  });
  const invoices = customerInvoiceRecords();
  assert.equal(invoices.length, 3);
  assert.equal(invoices.find(invoice => invoice.invoice_number === "SS0163").account_id, "A-1");
  assert.equal(invoices.find(invoice => invoice.invoice_number === "SS0163").reminder_eligible, true);
  assert.equal(invoices.find(invoice => invoice.invoice_number === "SS0164").badger_match_status, "Needs account match");
  assert.equal(invoices.find(invoice => invoice.invoice_number === "SS0165").badger_match_status, "Ignored");

  const onlineRequests = vm.runInNewContext(`${recordsForViewSource}; customerRecordsForView`, {
    customerView:"online_requests", customerData:{ orders:[{ request_id:"OR-1", workflow_status:"New" }] },
    CUSTOMER_VIEW_DATA:{ accounts:"accounts", online_requests:"orders", applications:"applications" },
    customerStatusFilter:"all", customerFilterText:"", ORDER_STATUSES:[], APPLICATION_STATUSES:[], customerInvoiceRecords:() => [], Array, String,
  });
  assert.equal(onlineRequests().length, 1, "Online requests must read the orders payload, not a nonexistent view key");
  assert.match(index, /input\[type="checkbox"\],input\[type="radio"\]\{[\s\S]*?width:18px;[\s\S]*?min-height:0;/, "checkboxes are not stretched by the global input sizing");
  assert.match(index, /\.checkLabel\{display:flex/);
  assert.match(backend, /else if \(mode === "not_paid"\) writeBadgerPaymentMark_\(invoiceNumber, false, "", "MARK_CUSTOMER_NOT_PAID", actor\)/);
  assert.match(backend, /\["link", "ignore", "void", "restore"\]\.includes\(mode\)/);
  assert.match(backend, /if \(mode === "void" && !voidReason\) throw new Error\("Enter why this invoice is void\."\)/);
  assert.match(backend, /"Void Prior Account ID", "Void Prior Match Method", "Void Prior Notes", "Void Prior Linked At", "Void Prior Linked By"/);
  assert.match(backend, /set\("void_prior_account_id", values\[h\.account_id\] \|\| ""\)/);
  assert.match(backend, /restore\("account_id", values\[h\.void_prior_account_id\] \|\| ""\)/);
  assert.match(backend, /return \{ message:`Invoice \$\{invoice\.invoice_number \|\| invoiceNumber\} restored to its prior \$\{priorMethod\} link\.`/);
  assert.match(backend, /voided_badger_invoices:ledger\.voided_badger_invoices/);
  assert.match(backend, /if \(String\(links\.get\(key\)\?\.match_method \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "void"\) return;/, "voided invoices never enter reconcile groups");
  assert.match(index, /Direct payments to run through Badger/);
  assert.match(index, /id="badgerOwedSelectAll"/);
  assert.match(index, /function updateBadgerOwedSelection\(\)/);
  assert.match(index, /mode:"void", notes:reason/);
  assert.match(index, /data-badger-payment="not_paid"/);
  const voidedRecords = vm.runInNewContext(`${invoiceRecordsSource}; customerInvoiceRecords`, {
    customerData:{ accounts:[], unmatchedBadgerInvoices:[], ignoredBadgerInvoices:[], voidedBadgerInvoices:[{ invoice_number:"SS0099", invoice_date:"2026-09-01", customer_name:"Error", amount:"10", void_reason:"Created in error" }] },
    Set, Date,
  })();
  assert.equal(voidedRecords[0].badger_match_status, "Void");
});

test("campaign loading backfills legacy cities once and does not label absent legacy miles", async () => {
  const [backend, index] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  const campaignObjectSource = backend.slice(backend.indexOf("function campaignRecipientCityFallbacks_"), backend.indexOf("function apiGetOutreachCampaigns_"));
  const campaignWindowSource = index.slice(index.indexOf("async function openOutreachCampaign"), index.indexOf("async function saveOutreachCampaignRecipient"));
  assert.match(campaignObjectSource, /function campaignRecipientCityFallbacks_\(/);
  assert.match(campaignObjectSource, /One directory data read per campaign load/);
  assert.match(campaignObjectSource, /by_account\.get\(accountId\) \|\| cityFallbacks\.by_source_row\.get\(sourceRow\)/);
  assert.match(campaignWindowSource, /else if \(criteria\) parts\.push\("Miles missing"\)/);
  assert.match(campaignWindowSource, /campaignRecipientLocation\(recipient\)/);
  assert.match(index, /expected\.city \?/);
});

test("campaign approval confirmation is inline, counted, and required before approval", async () => {
  const index = await readFile(new URL("index.html", root), "utf8");
  const dialog = index.slice(index.indexOf('<dialog id="outreachCampaignDialog">'), index.indexOf('<dialog id="outreachCampaignCriteriaDialog">'));
  const recipientsAt = dialog.indexOf('id="outreachCampaignRecipients"');
  const statusAt = dialog.indexOf('id="outreachCampaignStatus"');
  const confirmationAt = dialog.indexOf('id="campaignSegmentConfirmRow"');
  const approveAt = dialog.indexOf('id="approveOutreachCampaignBtn"');
  assert.ok(statusAt > recipientsAt, "campaign status is below the recipient list");
  assert.ok(confirmationAt > statusAt && confirmationAt < approveAt, "confirmation sits directly before approval in the bottom actions");
  assert.match(index, /I reviewed the fallback message for \$\{unsegmentedCount\} unsegmented recipient/);
  assert.match(index, /function refreshCampaignApprovalControl\(\)/);
  assert.match(index, /approveButton\.disabled = campaign\?\.status !== "Review" \|\| \(requiresConfirmation && !confirmed\)/);
  assert.match(index, /campaignSegmentConfirm"\)\.addEventListener\("change", refreshCampaignApprovalControl\)/);
  const campaignStart = index.indexOf("async function openOutreachCampaign");
  const campaignActions = index.slice(campaignStart, index.indexOf("function renderOutreach", campaignStart));
  assert.doesNotMatch(campaignActions, /toast\(/, "campaign-dialog validation never renders behind its modal");
  assert.match(campaignActions, /const isSameReviewSession = campaignSegmentConfirmation\.campaignId === campaign\.campaign_id/);
  assert.match(campaignActions, /\$\("campaignSegmentConfirm"\)\.checked = requiresSegmentConfirmation && campaignSegmentConfirmation\.confirmed/);
  assert.doesNotMatch(campaignActions, /\$\("campaignSegmentConfirm"\)\.checked = false/);
  assert.match(campaignActions, /if \(campaign\?\.status !== "Review"\) campaignSegmentConfirmation = \{ campaignId:campaign\?\.campaign_id \|\| "", confirmed:false \}/);
  assert.match(campaignActions, /setCampaignStatus\("Enter your staff name before approving\.", true\)/);
  assert.match(campaignActions, /setCampaignStatus\("An exclusion reason is required\.", true\)/);
  assert.match(campaignActions, /setCampaignStatus\("Refresh and re-open this campaign before sending/, "send validation stays in the dialog");
});

test("staff access sheet parsing: flexible headers, ticked areas, inactive rows, and lockout guards", async () => {
  const { rosterFromCsv, parseCsv } = await loadFunction("netlify/lib/staff-roster.js", "roster-parse");
  assert.deepEqual(parseCsv('a,"b, ""c""",d\r\n1,2,3'), [["a", 'b, "c"', "d"], ["1", "2", "3"]]);
  const csv = [
    "Name,Email Address,Role,Inventory,Outreach,Orders & Accounts,Active,Notes",
    "Karl,Karl@SturgeonSpirits.com,Admin,FALSE,FALSE,FALSE,TRUE,owner",
    "Pat,pat@sturgeonspirits.com,staff,TRUE,FALSE,x,TRUE,",
    "Gone,gone@sturgeonspirits.com,staff,TRUE,TRUE,TRUE,FALSE,left in May",
    "Nobody,none@sturgeonspirits.com,staff,FALSE,FALSE,FALSE,TRUE,",
    "Typo,typo@sturgeonspirits.com,manager,TRUE,TRUE,TRUE,TRUE,",
    ",,,,,,,",
  ].join("\n");
  const { entries, warnings } = rosterFromCsv(csv);
  assert.deepEqual(Object.keys(entries).sort(), ["karl@sturgeonspirits.com", "pat@sturgeonspirits.com"]);
  assert.deepEqual(entries["karl@sturgeonspirits.com"].areas, ["inventory", "outreach", "orders"]);
  assert.deepEqual(entries["pat@sturgeonspirits.com"], { role:"staff", areas:["inventory", "orders"], name:"Pat" });
  assert.equal(warnings.length, 2);
  const chatLayout = rosterFromCsv("Staff ID,Display Name,Email,Role,Areas,Active\nkarl,Karl,karl@sturgeonspirits.com,admin,,TRUE\npat,Pat,pat@sturgeonspirits.com,staff,\"outreach, orders\",TRUE");
  assert.deepEqual(chatLayout.entries["pat@sturgeonspirits.com"], { role:"staff", areas:["outreach", "orders"], name:"Pat" });
  assert.throws(() => rosterFromCsv("Email,Inventory,Active\nkarl@sturgeonspirits.com,TRUE,TRUE"), /Email, Role, and Active/);
  assert.throws(() => rosterFromCsv("Email,Role,Inventory\npat@sturgeonspirits.com,staff,TRUE"), /Email, Role, and Active/);
  const blankRole = rosterFromCsv("Email,Role,Inventory,Active\nkarl@sturgeonspirits.com,admin,TRUE,TRUE\npat@sturgeonspirits.com,,TRUE,TRUE");
  assert.equal(blankRole.entries["pat@sturgeonspirits.com"], undefined);
  assert.match(blankRole.warnings[0], /not admin or staff/);
});

async function rosterHarness(suffix, csvOrStatus) {
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength:2048 });
  process.env.APPS_SCRIPT_URL = "https://script.google.test/exec";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.GOOGLE_SA_CLIENT_EMAIL = "relay@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SA_PRIVATE_KEY = privateKey.export({ type:"pkcs8", format:"pem" }).replace(/\n/g, "\\n");
  process.env.STAFF_ROSTER_SHEET_ID = "roster-sheet";
  delete process.env.RELAY_MANIFEST_FILE_ID;
  const calls = { roster:0, apps:[] };
  globalThis.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token:"token", expires_in:3600 }), { status:200 });
    if (text.startsWith("https://sheets.googleapis.com/v4/spreadsheets/roster-sheet/values/")) {
      calls.roster += 1;
      assert.match(decodeURIComponent(text), /'Staff Access'!A1:Z1000/);
      if (typeof csvOrStatus === "number") return new Response("nope", { status:csvOrStatus });
      return new Response(JSON.stringify({ values:csvOrStatus.split("\n").map(line => line.split(",")) }), { status:200 });
    }
    calls.apps.push(options.body ? JSON.parse(options.body) : text);
    return new Response(JSON.stringify({ ok:true }), { status:200 });
  };
  const inventory = await loadFunction("netlify/functions/inventory.js", `${suffix}-inv`, { useRealRoster:true });
  const auth = await loadFunction("netlify/functions/auth.js", `${suffix}-auth`, { useRealRoster:true });
  return { inventory:inventory.handler, auth:auth.handler, calls };
}

function clearRosterEnv() {
  delete process.env.STAFF_ROSTER_SHEET_ID;
  delete process.env.GOOGLE_SA_CLIENT_EMAIL;
  delete process.env.GOOGLE_SA_PRIVATE_KEY;
}

test("the staff access sheet is authoritative over STAFF_ROLES_JSON and is cached between requests", async () => {
  const csv = "Email,Role,Inventory,Outreach,Orders,Active\nkarl@sturgeonspirits.com,admin,,,,TRUE\nstaff@sturgeonspirits.com,staff,TRUE,FALSE,FALSE,TRUE";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":"admin","old@sturgeonspirits.com":"admin"}';
  const { inventory, calls } = await rosterHarness("roster-authoritative", csv);
  try {
    const allowed = await inventory(event("initData", { session:staffSession() }));
    assert.equal(allowed.statusCode, 200);
    assert.equal(calls.apps[0].authenticated_staff_role, "staff");
    const areaBlocked = await inventory(event("customerWorkQueue", { session:staffSession() }));
    assert.equal(JSON.parse(areaBlocked.body).code, "STAFF_AREA_FORBIDDEN");
    const removed = await inventory(event("initData", { session:staffSession({ email:"old@sturgeonspirits.com", role:"admin", areas:["inventory", "outreach", "orders"] }) }));
    assert.equal(removed.statusCode, 401);
    assert.equal(calls.roster, 1);
  } finally {
    clearRosterEnv();
  }
});

test("session endpoint reports the sheet role and areas", async () => {
  const csv = "Email,Role,Inventory,Outreach,Orders,Active\nkarl@sturgeonspirits.com,admin,,,,TRUE\nstaff@sturgeonspirits.com,staff,FALSE,TRUE,TRUE,TRUE";
  process.env.STAFF_ROLES_JSON = "{}";
  process.env.ZOHO_OIDC_CLIENT_ID = "client";
  process.env.ZOHO_OIDC_CLIENT_SECRET = "secret";
  process.env.ZOHO_OIDC_REDIRECT_URI = "https://example.test/api/auth?action=callback";
  const { auth } = await rosterHarness("roster-session", csv);
  try {
    const response = await auth({ httpMethod:"GET", headers:{ cookie:staffSession() }, queryStringParameters:{ action:"session" } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body).user.areas, ["outreach", "orders"]);
  } finally {
    clearRosterEnv();
    delete process.env.ZOHO_OIDC_CLIENT_ID;
    delete process.env.ZOHO_OIDC_CLIENT_SECRET;
    delete process.env.ZOHO_OIDC_REDIRECT_URI;
  }
});

test("an unreadable or invalid Staff Access tab fails closed with a retryable roster error", async () => {
  process.env.STAFF_ROLES_JSON = '{"karl@sturgeonspirits.com":"admin"}';
  process.env.ZOHO_OIDC_CLIENT_ID = "client";
  process.env.ZOHO_OIDC_CLIENT_SECRET = "secret";
  process.env.ZOHO_OIDC_REDIRECT_URI = "https://example.test/api/auth?action=callback";
  const { inventory, auth, calls } = await rosterHarness("roster-down", 500);
  try {
    const signed = staffSession({ role:"staff", areas:["inventory"] });
    const unavailable = await inventory(event("initData", { session:signed }));
    assert.equal(unavailable.statusCode, 503);
    assert.equal(JSON.parse(unavailable.body).code, "STAFF_ROSTER_UNAVAILABLE");
    assert.match(JSON.parse(unavailable.body).error, /Staff list temporarily unavailable/);
    assert.equal((await inventory(event("initData", { session:staffSession() }))).statusCode, 503);
    assert.equal((await inventory(event("customerWorkQueue", { session:staffSession({ email:"karl@sturgeonspirits.com" }) }))).statusCode, 503);
    const sessionResponse = await auth({ httpMethod:"GET", headers:{ cookie:signed }, queryStringParameters:{ action:"session" } });
    assert.equal(sessionResponse.statusCode, 503);
    assert.equal(JSON.parse(sessionResponse.body).code, "STAFF_ROSTER_UNAVAILABLE");
    assert.equal(calls.roster, 2, "each function module backs off after its one failed read");
  } finally {
    clearRosterEnv();
    delete process.env.ZOHO_OIDC_CLIENT_ID;
    delete process.env.ZOHO_OIDC_CLIENT_SECRET;
    delete process.env.ZOHO_OIDC_REDIRECT_URI;
  }
  const noAdmin = await rosterHarness("roster-no-admin", "Email,Role,Inventory,Active\nstaff@sturgeonspirits.com,staff,TRUE,TRUE");
  try {
    const invalid = await noAdmin.inventory(event("customerWorkQueue", { session:staffSession({ email:"karl@sturgeonspirits.com" }) }));
    assert.equal(invalid.statusCode, 503);
    assert.equal(JSON.parse(invalid.body).code, "STAFF_ROSTER_UNAVAILABLE");
  } finally {
    clearRosterEnv();
  }
});

test("roster errors are retryable server errors, not browser sign-outs", async () => {
  const [auth, index] = await Promise.all([
    readFile(new URL("netlify/functions/auth.js", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  assert.match(auth, /STAFF_ROSTER_UNAVAILABLE/);
  assert.match(auth, /Staff list temporarily unavailable, try again in a minute\./);
  assert.match(auth, /The Staff Access tab could not be read\. Ask Karl to check the staff list/);
  assert.match(index, /res\.status === 401 \|\| json\.code === "STAFF_AUTH_REQUIRED"/);
  assert.doesNotMatch(index, /STAFF_ROSTER_UNAVAILABLE[\s\S]{0,80}staffAuth/);
});

test("scheduled campaign sends validate times, run due campaigns, skip guarded recipients, and pause on mailer failures", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const functionSource = (name, nextName) => backend.slice(backend.indexOf(`function ${name}`), backend.indexOf(`function ${nextName}`));
  const ACTIVE = ["Scheduled", "Sending"];
  const validate = new Function("CAMPAIGN_SCHEDULE_MAX_DAYS_AHEAD", `${functionSource("campaignScheduleValidation_", "campaignScheduleIsDue_")}; return campaignScheduleValidation_;`)(30);
  const isDue = new Function("CAMPAIGN_SCHEDULE_ACTIVE_STATUSES", `${functionSource("campaignScheduleIsDue_", "campaignScheduleUnsafeBlocks_")}; return campaignScheduleIsDue_;`)(ACTIVE);
  const unsafeBlocks = new Function(`${functionSource("campaignScheduleUnsafeBlocks_", "campaignScheduleTimeLabel_")}; return campaignScheduleUnsafeBlocks_;`)();
  const now = new Date("2026-10-04T15:00:00Z");

  assert.match(validate("", now).error, /valid send date/);
  assert.match(validate("2026-10-04T15:00:30Z", now).error, /at least one minute/);
  assert.match(validate("2026-11-10T15:00:00Z", now).error, /within 30 days/);
  assert.equal(validate("2026-10-06T15:00:00Z", now).send_at.toISOString(), "2026-10-06T15:00:00.000Z");

  assert.equal(isDue({ status:"Approved", schedule_status:"Scheduled", scheduled_send_at:new Date("2026-10-04T14:59:00Z") }, now), true);
  assert.equal(isDue({ status:"Approved", schedule_status:"Sending", scheduled_send_at:"2026-10-04T14:00:00Z" }, now), true);
  assert.equal(isDue({ status:"Approved", schedule_status:"Scheduled", scheduled_send_at:"2026-10-04T15:05:00Z" }, now), false);
  assert.equal(isDue({ status:"Approved", schedule_status:"Paused", scheduled_send_at:"2026-10-04T14:00:00Z" }, now), false);
  assert.equal(isDue({ status:"Approved", schedule_status:"Cancelled", scheduled_send_at:"2026-10-04T14:00:00Z" }, now), false);
  assert.equal(isDue({ status:"Review", schedule_status:"Scheduled", scheduled_send_at:"2026-10-04T14:00:00Z" }, now), false);

  assert.equal(unsafeBlocks([{ status:"Blocked", mailer_attempted:false }, { status:"Sent" }]).length, 0);
  assert.equal(unsafeBlocks([{ status:"Blocked", mailer_attempted:true, business:"Bar" }]).length, 1);

  // Run one campaign against an in-memory sheet and a scripted batch sender.
  const runCampaign = (batches, { cancelAfterFirst = false } = {}) => {
    const headers = { campaign_id:0, status:1, approval_token:2, scheduled_send_at:3, scheduled_by:4, schedule_status:5, schedule_detail:6, app_version:7 };
    const campaign = { row:2, headers, values:["CMP-1", "Approved", "tok", new Date(Date.now() - 3600000), "Karl", "Scheduled", "", ""] };
    const calls = [];
    const audits = [];
    const sender = p => {
      calls.push(p);
      if (cancelAfterFirst && calls.length === 1) campaign.values[headers.schedule_status] = "Cancelled";
      const next = batches.shift();
      if (next instanceof Error) throw next;
      return next;
    };
    const run = new Function(
      "updateCampaignSchedule_", "outreachCampaignSheets_", "outreachCampaignRow_", "campaignScheduleState_", "apiSendOutreachCampaignBatch_",
      "campaignScheduleTimeLabel_", "clearCampaignSchedule_", "appendAudit_", "CAMPAIGN_SCHEDULE_ACTIVE_STATUSES", "CAMPAIGN_SCHEDULE_BATCH_SIZE",
      "campaignScheduleIsDue_", "campaignScheduleUnsafeBlocks_", "OUTREACH_CAMPAIGNS_SHEET_NAME", "console",
      `${functionSource("runScheduledCampaign_", "outreachStatusForOutcome_")}; return runScheduledCampaign_;`
    )(
      (id, mutate) => mutate(campaign),
      () => ({ campaigns:{} }),
      () => campaign,
      new Function(`${functionSource("campaignScheduleState_", "updateCampaignSchedule_")}; return campaignScheduleState_;`)(),
      sender,
      () => "Sun Oct 4, 10:00 AM CT",
      new Function(`${functionSource("clearCampaignSchedule_", "campaignScheduleState_")}; return clearCampaignSchedule_;`)(),
      (...args) => audits.push(args),
      ACTIVE, 5, isDue, unsafeBlocks, "Outreach Campaigns", { warn() {}, log() {} },
    );
    const result = run("CMP-1", Date.now() + 60000);
    return { result, campaign, calls, audits };
  };

  const done = runCampaign([
    { sent:4, blocked:1, remaining:3, results:[{ status:"Sent" }, { status:"Sent" }, { status:"Blocked", mailer_attempted:false, business:"Replied Bar" }, { status:"Sent" }, { status:"Sent" }] },
    { sent:3, blocked:0, remaining:0, results:[{ status:"Sent" }, { status:"Sent" }, { status:"Sent" }] },
  ]);
  assert.equal(done.result.state, "Done");
  assert.equal(done.result.sent, 7);
  assert.equal(done.result.skipped, 1);
  assert.equal(done.campaign.values[5], "Done");
  assert.equal(done.calls[0].approval_token, "tok");
  assert.equal(done.calls[0].continue_after_block, true);
  assert.equal(done.calls[0].batch_size, 5);
  assert.ok(done.calls[0].deadline_at > Date.now());

  const paused = runCampaign([
    { sent:1, blocked:1, remaining:5, results:[{ status:"Sent" }, { status:"Blocked", mailer_attempted:true, business:"Uncertain Bar", detail:"Zoho did not return a verified message ID." }] },
  ]);
  assert.equal(paused.result.state, "Paused");
  assert.equal(paused.calls.length, 1);
  assert.match(paused.campaign.values[6], /Uncertain Bar/);

  const lockBusy = runCampaign([new Error("Another outreach send is in progress. Wait a moment and try again.")]);
  assert.equal(lockBusy.result.state, "Sending");
  assert.equal(lockBusy.campaign.values[5], "Sending");

  const failed = runCampaign([new Error("Campaign approval is not valid. Refresh and review again.")]);
  assert.equal(failed.result.state, "Paused");

  const cancelled = runCampaign([{ sent:2, blocked:0, remaining:4, results:[{ status:"Sent" }, { status:"Sent" }] }, { sent:4, blocked:0, remaining:0, results:[] }], { cancelAfterFirst:true });
  assert.equal(cancelled.result.state, "Stopped");
  assert.equal(cancelled.calls.length, 1);
  assert.equal(cancelled.campaign.values[5], "Cancelled");

  // The manual batch path marks whether the mailer was attempted, honors the deadline, and approval/reopen reset schedules.
  const batch = functionSource("apiSendOutreachCampaignBatch_", "campaignScheduleTimeLabel_");
  assert.match(batch, /if \(deadlineAt && Date\.now\(\) > deadlineAt\) break;/);
  assert.match(batch, /mailerAttempted = !prior;\s*\n\s*result = prior \|\| callOutreachMailer_/);
  assert.match(batch, /mailer_attempted:mailerAttempted/);
  assert.match(functionSource("apiApproveOutreachCampaign_", "apiReopenOutreachCampaign_"), /clearCampaignSchedule_\(campaign, ""\)/);
  assert.match(functionSource("apiReopenOutreachCampaign_", "apiSendOutreachCampaignBatch_"), /clearCampaignSchedule_\(campaign, "Cancelled"/);
  assert.match(backend, /case "scheduleOutreachCampaign": res = apiScheduleOutreachCampaign_\(body\); break;/);
  assert.match(backend, /case "cancelOutreachCampaignSchedule": res = apiCancelOutreachCampaignSchedule_\(body\); break;/);
  assert.match(backend, /ScriptApp\.newTrigger\(CAMPAIGN_SCHEDULE_HANDLER\)\.timeBased\(\)\.everyMinutes\(5\)\.create\(\);/);
  assert.ok(!/READ_ACTIONS = new Set\([^)]*scheduleOutreachCampaign/.test(backend));

  const proxy = await readFile(new URL("netlify/functions/inventory.js", root), "utf8");
  assert.match(proxy, /"scheduleOutreachCampaign",\n  "cancelOutreachCampaignSchedule",/);
  assert.match(proxy, /\["scheduleOutreachCampaign", "outreach"\], \["cancelOutreachCampaignSchedule", "outreach"\]/);

  const index = await readFile(new URL("index.html", root), "utf8");
  assert.match(index, /id="campaignScheduleAt" type="datetime-local"/);
  assert.match(index, /action:"scheduleOutreachCampaign", campaign_id:campaign\.campaign_id, approval_token:selectedCampaignApprovalToken, send_at:sendAt\.toISOString\(\)/);
  assert.match(index, /action:"cancelOutreachCampaignSchedule"/);
});

test("Code.gs header names the current APP_VERSION and keeps the prior version's changes", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const version = backend.match(/const APP_VERSION = "([^"]+)";/)[1];
  assert.match(backend.slice(0, 400), new RegExp(`App version: ${version.replace(/\./g, "\\.")}\\n`));
  assert.doesNotMatch(backend.slice(0, 4000), new RegExp(`CHANGES IN ${version.replace(/\./g, "\\.")}\\n`), "the current version's changes sit under CHANGES IN THIS VERSION");
});

test("wholesale prices come from SKU tiers or overrides, customer deals, and Toast stock sets availability", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const functionSource = (name, nextName) => backend.slice(backend.indexOf(`function ${name}`), backend.indexOf(`function ${nextName}`));
  const toBool = value => value === true || /^(true|yes|1|y)$/i.test(String(value || "").trim());
  const money = new Function(`${functionSource("badgerMoneyToCents_", "badgerMoneyLabel_")}; return badgerMoneyToCents_;`)();
  const uom = new Function(`${functionSource("badgerVolumeUnitOfMeasureId_", "priceTierCents_")}; return badgerVolumeUnitOfMeasureId_;`)();
  const firstPresent = (row, keys) => { for (const key of keys) if (row[key] !== undefined && row[key] !== "") return row[key]; return ""; };
  const build = new Function("badgerMoneyToCents_", "badgerVolumeUnitOfMeasureId_", "toBool_", "firstPresent_",
    `${functionSource("skuWholesaleCents_", "badgerCurrentPrices_")}; return { wholesalePriceRows_, skuWholesaleCents_ };`)(money, uom, toBool, firstPresent);
  const tiers = new Map([["standard", 2200], ["premium", 3000], ["b-17", 3500], ["half", 1200]]);
  const skus = [
    { sku_id:"STUR-VOD-CRAN-750", sku_name:"Cranberry Vodka", size:"750ml", active:true, price_tier:"Standard", wholesale_price:"", proof:70 },
    { sku_id:"STUR-BRB-STR-750", sku_name:"Straight Bourbon", size:"750ml", active:"TRUE", price_tier:"Premium", wholesale_price:"", proof:90 },
    { sku_id:"STUR-BRB-B17-750", sku_name:"Flying Fortress Bourbon", size:"750ml", active:true, price_tier:"Premium", wholesale_price:"$35", proof:100 },
    { sku_id:"STUR-LIQ-LIMO-375", sku_name:"Limoncello", size:"375ml", active:true, price_tier:"half", proof:60 },
    { sku_id:"STUR-VOD-OFF-750", sku_name:"Inactive Vodka", size:"750ml", active:false, price_tier:"Standard", proof:70 },
    { sku_id:"STUR-VOD-NONE-750", sku_name:"Unpriced Vodka", size:"750ml", active:true, price_tier:"", proof:70 },
  ];
  const customers = [
    { sku_id:"STUR-VOD-CRAN-750", account_id:"ACC-FESTIVAL", price:20, active:true },
    { sku_id:"STUR-VOD-OFF-750", account_id:"ACC-FESTIVAL", price:18, active:true },
    { sku_id:"STUR-VOD-CRAN-750", account_id:"ACC-OLD", price:15, active:false },
  ];
  const rows = build.wholesalePriceRows_(skus, tiers, customers);
  const find = (id, account = "") => rows.find(row => row.sku_id === id && row.account_id === account);
  assert.equal(find("STUR-VOD-CRAN-750").unit_price_cents, 2200, "tier price");
  assert.equal(find("STUR-BRB-STR-750").unit_price_cents, 3000);
  assert.equal(find("STUR-BRB-B17-750").unit_price_cents, 3500, "a typed wholesale price overrides the tier");
  assert.equal(find("STUR-LIQ-LIMO-375").unit_of_measure_id, 5);
  assert.equal(find("STUR-VOD-CRAN-750").unit_of_measure_id, 3);
  assert.equal(find("STUR-VOD-CRAN-750").proof, 70);
  assert.equal(find("STUR-VOD-CRAN-750", "ACC-FESTIVAL").unit_price_cents, 2000, "customer deal");
  assert.equal(find("STUR-VOD-OFF-750"), undefined, "inactive SKUs are never priced");
  assert.equal(find("STUR-VOD-OFF-750", "ACC-FESTIVAL"), undefined, "customer rows need an active SKU");
  assert.equal(find("STUR-VOD-CRAN-750", "ACC-OLD"), undefined, "inactive customer rows are ignored");
  assert.equal(find("STUR-VOD-NONE-750"), undefined, "no tier and no override means no price");

  // Duplicate Customer Prices rows: same price collapses to one row; different prices block that account (zero price).
  const dupRows = build.wholesalePriceRows_(skus, tiers, [
    { sku_id:"STUR-VOD-CRAN-750", account_id:"ACC-A", price:20, active:true },
    { sku_id:"STUR-VOD-CRAN-750", account_id:"ACC-A", price:20, active:true },
    { sku_id:"STUR-VOD-CRAN-750", account_id:"ACC-B", price:20, active:true },
    { sku_id:"STUR-VOD-CRAN-750", account_id:"ACC-B", price:19, active:true },
  ]);
  assert.deepEqual(dupRows.filter(row => row.account_id === "ACC-A").map(row => row.unit_price_cents), [2000]);
  assert.deepEqual(dupRows.filter(row => row.account_id === "ACC-B").map(row => row.unit_price_cents), [0], "conflicting deals block instead of picking one");

  // Duplicate Price Tiers rows with different prices remove the tier, so its products are unpriced (invoice blocks).
  const sheetRows = [{ tier:"Standard", price:22 }, { tier:"standard ", price:24 }, { tier:"Premium", price:30 }, { tier:"Premium", price:30 }];
  const tierLib = new Function("getSs_", "PRICE_TIERS_SHEET_NAME", "getAllRowsAsObjects_", "badgerMoneyToCents_", "firstPresent_",
    `${functionSource("priceTierCents_", "skuWholesaleCents_")}; return priceTierCents_;`)(
    () => ({ getSheetByName:() => ({ getLastRow:() => sheetRows.length + 1 }) }), "Price Tiers", () => sheetRows, money, firstPresent);
  const liveTiers = tierLib();
  assert.equal(liveTiers.has("standard"), false);
  assert.equal(liveTiers.get("premium"), 3000, "an exact duplicate is harmless");
  assert.deepEqual(liveTiers.conflicts, ["standard"]);

  assert.match(backend, /const prices = badgerCurrentPrices_\(true\);/, "invoice drafts always read the catalog fresh");
  assert.match(functionSource("installHubReadCacheWarmer", "installBadgerStatusSyncTrigger"), /SpreadsheetApp\.openById\(BADGER_TRACKER_SPREADSHEET_ID\), getSs_\(\)\]/, "inventory workbook edits invalidate caches");

  const listSkus = functionSource("apiListSkus_", "apiAddSkuToStoreUnlocked_");
  assert.match(listSkus, /\(hasStock && stock <= 0\)/);
  assert.match(listSkus, /hasStock \? "In stock" : "Staff will confirm availability"/);
  assert.doesNotMatch(listSkus, /toast_stock:/, "bottle counts are not sent to the public order page");
});

test("Toast 86 Report import maps stock by exact Toast item name and reports gaps; catalog check finds unpriced products", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const functionSource = (name, nextName) => backend.slice(backend.indexOf(`function ${name}`), backend.indexOf(`function ${nextName}`));
  const parseCsv = text => text.trim().split(/\r?\n/).map(line => {
    const cells = []; let cell = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true; else if (c === ",") { cells.push(cell); cell = ""; } else cell += c;
    }
    cells.push(cell); return cells;
  });
  const lib = new Function("Utilities", "TOAST_STOCK_GROUPS",
    `${functionSource("toastItemKey_", "importLatestToastStockReport")}; return { parseToast86Report_, toastStockUpdates_ };`)({ parseCsv }, ["750 ml", "375 ml", "box sets"]);
  const csv = [
    "Location,Menu Name,Group Name,Subgroup(s),Item Name,Quantity Remaining,SKU,PLU",
    ',"Bottles, Cans, Boxes",750 ml,,Cranberry Vodka 750 ml,117.0,,',
    ',"Bottles, Cans, Boxes",750 ml,,Peach Vodka  750 ml,0.0,,',
    ',"Bottles, Cans, Boxes",750 ml,,Brand New Vodka 750 ml,9.0,,',
    ',"Bottles, Cans, Boxes",Box Sets,,Gin 5 pack,2.0,,',
    ",Distribution,Bottles,,Cranberry Vodka 750 ml,117.0,,",
    ",Merchandise,Sturgeon Spirits Merchandise,,Black hoodie,9.0,,",
  ].join("\n");
  const report = lib.parseToast86Report_(csv);
  assert.equal(report.length, 6);
  const skus = [
    { sku_id:"STUR-VOD-CRAN-750", toast_item_name:"Cranberry Vodka 750 ml" },
    { sku_id:"STUR-VOD-PEAC-750", toast_item_name:"peach vodka 750 ml" },
    { sku_id:"STUR-BOX-GIN-5X100", toast_item_name:"Gin 5 pack" },
    { sku_id:"STUR-VOD-GONE-750", toast_item_name:"Retired Vodka 750 ml" },
    { sku_id:"STUR-ANY-750", toast_item_name:"" },
  ];
  const result = lib.toastStockUpdates_(skus, report);
  assert.deepEqual(result.updates.map(u => [u.sku_id, u.stock]), [["STUR-VOD-CRAN-750", 117], ["STUR-VOD-PEAC-750", 0], ["STUR-BOX-GIN-5X100", 2]]);
  assert.deepEqual(result.missing_in_report, ["STUR-VOD-GONE-750"]);
  assert.deepEqual(result.cleared, [{ index:3, sku_id:"STUR-VOD-GONE-750" }], "stock for a SKU missing from the report is cleared, not kept");
  const importSource = functionSource("importLatestToastStockReport", "priceTierCents_");
  assert.match(importSource, /result\.cleared\.forEach\(item => \{ stockValues\[item\.index\]\[0\] = ""; dateValues\[item\.index\]\[0\] = ""; \}\)/);
  assert.deepEqual(result.unmapped_toast_items, ["Brand New Vodka 750 ml"], "new bottles without a SKU are reported; merchandise is ignored");
  assert.throws(() => lib.parseToast86Report_("a,b\n1,2"), /does not look like a Toast 86 Report/);

  const toBool = value => value === true || /^(true|yes|1|y)$/i.test(String(value || "").trim());
  const money = new Function(`${functionSource("badgerMoneyToCents_", "badgerMoneyLabel_")}; return badgerMoneyToCents_;`)();
  const wholesaleCents = new Function("badgerMoneyToCents_", `${functionSource("skuWholesaleCents_", "skuPriceRow_")}; return skuWholesaleCents_;`)(money);
  const uomFor = new Function(`${functionSource("badgerVolumeUnitOfMeasureId_", "toastItemKey_")}; return badgerVolumeUnitOfMeasureId_;`)();
  const invoiceVolume = new Function(`${functionSource("skuInvoiceVolume_", "skuPriceRow_")}; return skuInvoiceVolume_;`)();
  const firstPresent = (row, keys) => { for (const key of keys) if (row[key] !== undefined && row[key] !== "") return row[key]; return ""; };
  const customerConflicts = new Function("badgerMoneyToCents_", "toBool_", "firstPresent_",
    `${functionSource("customerPriceConflicts_", "wholesalePriceRows_")}; return customerPriceConflicts_;`)(money, toBool, firstPresent);
  const problemsFor = new Function("badgerMoneyToCents_", "toBool_", "skuWholesaleCents_", "badgerVolumeUnitOfMeasureId_", "skuInvoiceVolume_", "customerPriceConflicts_",
    `${functionSource("wholesaleCatalogProblems_", "checkWholesaleCatalog")}; return wholesaleCatalogProblems_;`)(money, toBool, wholesaleCents, uomFor, invoiceVolume, customerConflicts);
  assert.equal(invoiceVolume({ size:"5 x 100ml", invoice_volume:"500ml" }), "500ml");
  assert.equal(invoiceVolume({ size:"750ml", invoice_volume:"" }), "750ml");
  const tiers = new Map([["standard", 2200], ["squadron", 0]].filter(([, cents]) => cents > 0));
  tiers.conflicts = ["premium"];
  const problems = problemsFor([
    { sku_id:"A", active:true, price_tier:"Standard", proof:70, size:"750ml", toast_item_name:"A 750 ml" },
    { sku_id:"B", active:true, price_tier:"Squadron", proof:80, size:"750ml", toast_item_name:"B 750 ml" },
    { sku_id:"C", active:true, price_tier:"Standard", proof:"", size:"5 x 100ml", invoice_volume:"9000ml", toast_item_name:"" },
    { sku_id:"D", active:false, price_tier:"Old Name", proof:"", toast_item_name:"" },
    { sku_id:"E", active:true, price_tier:"Premium", proof:90, size:"750ml", toast_item_name:"E 750 ml" },
    { sku_id:"F", active:true, price_tier:"Bitters", wholesale_price:"7", proof:180, size:"50ml", toast_item_name:"" },
  ], tiers, [
    { sku_id:"A", account_id:"ACC-1", price:20, active:true },
    { sku_id:"A", account_id:"ACC-1", price:21, active:true },
  ]);
  assert.deepEqual(problems.unknown_tier, ["B (Squadron)", "D (Old Name)"], "a conflicting tier is reported as a conflict, not unknown");
  assert.deepEqual(problems.no_price, ["B", "E"]);
  assert.deepEqual(problems.no_proof, ["C"]);
  assert.deepEqual(problems.tier_conflicts, ["premium"]);
  assert.deepEqual(problems.customer_price_conflicts, ["A|ACC-1"]);
  assert.deepEqual(problems.not_stock_tracked, ["C", "F"], "products with no Toast item are listed as information, not problems");
  assert.equal(problems.no_toast_item, undefined);
  assert.deepEqual(problems.no_invoice_unit, ["C (9000ml)"]);
});
