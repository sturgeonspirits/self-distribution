// App version: 2026.09.17.28
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function loadFunction(path, suffix = Math.random()) {
  const source = await readFile(new URL(path, root), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${suffix}`);
}

function event(action, options = {}) {
  const method = options.method || "POST";
  return {
    httpMethod:method,
    headers:{
      ...(options.code ? { "x-staff-code":options.code } : {}),
      "x-nf-client-connection-ip":options.ip || "192.0.2.10",
    },
    queryStringParameters:method === "GET" ? { action } : {},
    rawQuery:method === "GET" ? `action=${encodeURIComponent(action)}` : "",
    body:method === "POST" ? JSON.stringify({ action, ...(options.body || {}) }) : "",
  };
}

test("every inventory action rejects missing staff auth before proxying", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "unauthenticated-actions");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.STAFF_ACCESS_CODE = "staff-code";
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error("should not proxy"); };
  const actions = ["initData", "listSkus", "addSkuToStore", "upsertProduct", "submitCounts", "createReorder", "managerGrid", "salesSinceCount", "updateStoreContacts"];
  for (const action of actions) {
    const response = await handler(event(action, { method:action === "managerGrid" ? "GET" : "POST", ip:`192.0.2.${actions.indexOf(action) + 10}` }));
    assert.equal(response.statusCode, 401, action);
    assert.equal(JSON.parse(response.body).code, "STAFF_AUTH_REQUIRED", action);
  }
  assert.equal(fetches, 0);
});

test("authenticated inventory GET and POST preserve action payload and API key", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "authenticated-regression");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.API_KEY = "backend-key";
  process.env.STAFF_ACCESS_CODE = "staff-code";
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    return new Response(JSON.stringify({ ok:true, version:"2026.09.17.28" }), { status:200 });
  };
  const getResponse = await handler(event("managerGrid", { method:"GET", code:"staff-code", ip:"198.51.100.1" }));
  const postResponse = await handler(event("submitCounts", { code:"staff-code", ip:"198.51.100.1", body:{ store_id:"S1", rep:"Karl", items:[{ sku_id:"SKU", counted:1 }] } }));
  assert.equal(getResponse.statusCode, 200);
  assert.match(calls[0].url, /action=managerGrid/);
  assert.match(calls[0].url, /api_key=backend-key/);
  const forwarded = JSON.parse(calls[1].options.body);
  assert.equal(forwarded.action, "submitCounts");
  assert.equal(forwarded.api_key, "backend-key");
  assert.equal(JSON.parse(postResponse.body).ok, true);
});

test("wrong staff codes are logged and throttled by source", async () => {
  const { handler } = await loadFunction("netlify/functions/inventory.js", "throttle");
  process.env.APPS_SCRIPT_URL = "https://example.test/exec";
  process.env.STAFF_ACCESS_CODE = "correct";
  globalThis.fetch = async () => new Response(JSON.stringify({ ok:true }), { status:200 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await handler(event("initData", { code:"wrong", ip:"203.0.113.5" }));
    assert.equal(response.statusCode, 401);
  }
  const throttled = await handler(event("initData", { code:"wrong", ip:"203.0.113.5" }));
  assert.equal(throttled.statusCode, 429);
  assert.equal(JSON.parse(throttled.body).code, "STAFF_AUTH_THROTTLED");
  const legitimate = await handler(event("initData", { code:"correct", ip:"203.0.113.6" }));
  assert.equal(legitimate.statusCode, 200);
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
