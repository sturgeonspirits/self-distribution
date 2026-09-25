// App version: 2026.09.23.5-WEB
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHmac } from "node:crypto";

const root = new URL("../", import.meta.url);

async function loadFunction(path, suffix = Math.random()) {
  let source = await readFile(new URL(path, root), "utf8");
  if (path === "netlify/functions/inventory.js") {
    const auth = await readFile(new URL("netlify/functions/auth.js", root), "utf8");
    const authUrl = `data:text/javascript;base64,${Buffer.from(auth).toString("base64")}`;
    source = source.replace('from "./auth.js";', `from "${authUrl}";`);
    const relay = await readFile(new URL("netlify/lib/drive-relay.js", root), "utf8");
    const relayUrl = `data:text/javascript;base64,${Buffer.from(relay).toString("base64")}`;
    source = source.replace('from "../lib/drive-relay.js";', `from "${relayUrl}";`);
  }
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${suffix}`);
}

function staffSession({ email = "staff@sturgeonspirits.com", name = "Staff Member", sub = "zoho-user-1", exp = Math.floor(Date.now() / 1000) + 3600 } = {}) {
  const encoded = Buffer.from(JSON.stringify({ email, name, sub, exp })).toString("base64url");
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
  assert.match(script, /\[getOutreachSs_\(\), SpreadsheetApp\.openById\(BADGER_TRACKER_SPREADSHEET_ID\)\]/);
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

function goEvent(params, userAgent = "Mozilla/5.0") {
  return { httpMethod:"GET", rawQuery:new URLSearchParams(params).toString(), headers:{ "user-agent":userAgent } };
}

function trackingSignature(target, accountId, stage) {
  return createHmac("sha256", process.env.TRACKING_LINK_SECRET).update(`${target}\n${accountId}\n${stage}`).digest("base64url");
}

test("tracking redirect allowlists destinations and ignores invalid signatures", async () => {
  const { handler } = await loadFunction("netlify/functions/go.js", "tracking-redirect");
  process.env.TRACKING_LINK_SECRET = "tracking-test-secret";
  process.env.SELL_SHEET_URL = "https://example.test/sell-sheet";
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response(JSON.stringify({ ok:true }), { status:200 }); };
  const unknown = await handler(goEvent({ t:"https://attacker.test", url:"https://attacker.test" }));
  assert.equal(unknown.statusCode, 404);
  const invalid = await handler(goEvent({ t:"sell_sheet", a:"ACC-1", s:"Initial", k:"bad", url:"https://attacker.test" }));
  assert.equal(invalid.statusCode, 302);
  assert.equal(invalid.headers.Location, "https://example.test/sell-sheet");
  assert.equal(fetches, 0);
  const application = await handler(goEvent({ t:"application", a:"ACC-1", s:"Initial", k:"bad", business:"Example Bar", email:"orders@example.test", url:"https://attacker.test" }));
  assert.equal(application.statusCode, 302);
  assert.match(application.headers.Location, /^\/customer-signup\.html\?/);
  assert.equal(new URL(application.headers.Location, "https://distribution-hub.netlify.app").searchParams.get("business"), "Example Bar");
  assert.doesNotMatch(application.headers.Location, /attacker\.test/);
});

test("tracking logging failure or timeout never prevents a redirect", async () => {
  const { handler } = await loadFunction("netlify/functions/go.js", "tracking-log-failure");
  process.env.TRACKING_LINK_SECRET = "tracking-test-secret";
  process.env.SELL_SHEET_URL = "https://example.test/sell-sheet";
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  const signature = trackingSignature("sell_sheet", "ACC-1", "Initial");
  globalThis.fetch = async () => { throw Object.assign(new Error("timed out"), { name:"AbortError" }); };
  const response = await handler(goEvent({ t:"sell_sheet", a:"ACC-1", s:"Initial", k:signature }));
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.Location, "https://example.test/sell-sheet");
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("valid Karl-only test tracking links redirect without recording engagement", async () => {
  const { handler } = await loadFunction("netlify/functions/go.js", "tracking-test-link");
  process.env.TRACKING_LINK_SECRET = "tracking-test-secret";
  process.env.SELL_SHEET_URL = "https://example.test/sell-sheet";
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  const signature = trackingSignature("sell_sheet", "ACC-1", "Initial");
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response(JSON.stringify({ ok:true }), { status:200 }); };
  const response = await handler(goEvent({ t:"sell_sheet", a:"ACC-1", s:"Initial", k:signature, x:"test" }));
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.Location, "https://example.test/sell-sheet");
  assert.equal(fetches, 0);
});

test("Karl-only test rendering supplies non-empty HTML with an unsigned x=test marker", async () => {
  const backend = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const rendererSource = backend.slice(backend.indexOf("function outreachPlainTextToHtml_"), backend.indexOf("function outreachFieldLabel_"));
  const renderMessage = new Function(
    "Utilities", "PropertiesService", "outreachValue_", "outreachSegmentTemplateKey_", "outreachDisplayBusinessName_", "escapeOutreachHtml_", "outreachTemplateParts_", "renderOutreachTemplate_",
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
    (template, values) => String(template || "").replace(/{{([^}]+)}}/g, (_, key) => values[key.trim()] || "")
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
  assert.match(reconciliationSource, /advanceOutreachSend_\(leadSheet, directory\.row, record, "Initial", activity\.message_id, activity\.sent_at, settings\)/);
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
