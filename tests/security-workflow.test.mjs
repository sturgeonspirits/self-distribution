// App version: 2026.09.23.5-WEB
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";

const root = new URL("../", import.meta.url);

async function loadFunction(path, suffix = Math.random()) {
  let source = await readFile(new URL(path, root), "utf8");
  if (path === "netlify/functions/inventory.js") {
    const auth = await readFile(new URL("netlify/functions/auth.js", root), "utf8");
    const authUrl = `data:text/javascript;base64,${Buffer.from(auth).toString("base64")}`;
    source = source.replace('from "./auth.js";', `from "${authUrl}";`);
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

test("campaign review reads use one extended upstream attempt", async () => {
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
  assert.equal(calls, 1);
  assert.equal(result.statusCode, 500);
  assert.match(JSON.parse(result.body).error, /campaign review connection failed/i);
});

test("roles and workspace areas are enforced server-side and revoked users lose access immediately", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "roles");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.STAFF_ROLES_JSON = '{"staff@sturgeonspirits.com":{"role":"staff","areas":["inventory"]}}';
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response(JSON.stringify({ ok:true }), { status:200 }); };
  const session = staffSession();
  const blocked = await handler(event("upsertProduct", { session }));
  assert.equal(blocked.statusCode, 403);
  assert.equal(JSON.parse(blocked.body).code, "STAFF_ROLE_FORBIDDEN");
  const areaBlocked = await handler(event("customerWorkQueue", { method:"POST", session }));
  assert.equal(areaBlocked.statusCode, 403);
  assert.equal(JSON.parse(areaBlocked.body).code, "STAFF_AREA_FORBIDDEN");
  assert.equal(fetches, 0);
  process.env.STAFF_ROLES_JSON = "{}";
  const revoked = await handler(event("initData", { session }));
  assert.equal(revoked.statusCode, 401);
  assert.equal(fetches, 0);
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
  const dashboardSource = backend.match(/function apiGetOutreachDashboard_\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(dashboardSource);
  assert.doesNotMatch(dashboardSource, /ensureAccountIdentityModel_/);
  assert.doesNotMatch(dashboardSource, /newsletterContacts_/);
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
