// App version: 2026.09.22.5-WEB
const APP_VERSION = "2026.09.22.5-WEB";
const STAFF_ACTIONS = new Set([
  "outreachDashboard",
  "outreachSendStatus",
  "outreachNewsletterContacts",
  "saveOutreachDraft",
  "updateOutreachOutcome",
  "updateOutreachBusiness",
  "updateOutreachPrograms",
  "upsertNewsletterContact",
  "customerWorkQueue",
  "updateCustomerApplication",
  "updateOnlineOrderRequest",
  "createOutreachBusiness",
  "importOutreachBusinesses",
  "hubSystemStatus",
  "initializeHardenedHub",
  "reconcileIntegrations",
  "sendOutreachEmail",
  "sendOutreachTestEmail",
  "initData",
  "listSkus",
  "addSkuToStore",
  "upsertProduct",
  "submitCounts",
  "createReorder",
  "managerGrid",
  "salesSinceCount",
  "updateStoreContacts",
]);

const FAILED_ATTEMPT_LIMIT = 5;
const FAILED_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const UPSTREAM_ATTEMPTS = 2;
const UPSTREAM_TIMEOUT_MS = 11000;
const SEND_UPSTREAM_ATTEMPTS = 1;
const SEND_UPSTREAM_TIMEOUT_MS = 24000;
const SEND_ACTIONS = new Set(["sendOutreachEmail", "sendOutreachTestEmail"]);
const failedStaffAttempts = new Map();

function response(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function fetchAppsScript(url, options = {}, policy = {}) {
  const attempts = Number(policy.attempts || UPSTREAM_ATTEMPTS);
  const timeoutMs = Number(policy.timeoutMs || UPSTREAM_TIMEOUT_MS);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let upstream = await fetch(url, { ...options, redirect:"manual", signal:controller.signal });
      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("location");
        if (!location) throw new Error("Inventory API redirect was missing its destination.");
        upstream = await fetch(location, {
          method:"GET",
          headers:{ "Accept":"application/json" },
          redirect:"follow",
          signal:controller.signal,
        });
      }
      clearTimeout(timer);
      return upstream;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      console.warn("Inventory API upstream attempt failed", { attempt, error:String(error) });
    }
  }
  if (policy.send) {
    throw new Error(lastError?.name === "AbortError"
      ? "Zoho did not confirm the send before the connection timed out. The outcome is unknown; check Activity Log and Zoho before retrying."
      : `The send connection failed before Zoho confirmation: ${String(lastError)}`);
  }
  throw new Error(lastError?.name === "AbortError"
    ? `Google Sheets took too long to answer after ${attempts} attempts.`
    : `Inventory API connection failed after ${attempts} attempts: ${String(lastError)}`);
}

async function proxyResult(upstream, cors) {
  const text = await upstream.text();
  try { JSON.parse(text); }
  catch (error) {
    return response(502, cors, { ok:false, error:"The Inventory API returned a non-JSON response. Refresh and try again." });
  }
  return { statusCode:upstream.ok ? 200 : 502, headers:cors, body:text };
}

function staffActionFor(event, body) {
  if (event.httpMethod === "GET") return event.queryStringParameters?.action || "";
  return body?.action || "";
}

function staffCodeFor(event) {
  return event.headers?.["x-staff-code"] || event.headers?.["X-Staff-Code"] || "";
}

function requestSourceFor(event) {
  return String(
    event.headers?.["x-nf-client-connection-ip"] ||
    event.headers?.["x-forwarded-for"] ||
    event.headers?.["client-ip"] ||
    "unknown"
  ).split(",")[0].trim().slice(0, 120);
}

function activeFailureState(source, now = Date.now()) {
  const state = failedStaffAttempts.get(source);
  if (!state || now - state.startedAt >= FAILED_ATTEMPT_WINDOW_MS) {
    failedStaffAttempts.delete(source);
    return null;
  }
  return state;
}

function registerFailedStaffAttempt(source, action, now = Date.now()) {
  const current = activeFailureState(source, now) || { count:0, startedAt:now };
  current.count += 1;
  failedStaffAttempts.set(source, current);
  console.warn("Rejected staff-code attempt", {
    action:String(action || "").slice(0, 80),
    source,
    attempts:current.count,
    windowStartedAt:new Date(current.startedAt).toISOString(),
  });
  return current;
}

export async function handler(event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Staff-Code",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-App-Version": APP_VERSION,
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  try {
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const API_KEY = process.env.API_KEY || "";
    const body = event.httpMethod === "POST" && event.body ? JSON.parse(event.body) : {};
    const action = staffActionFor(event, body);

    if (STAFF_ACTIONS.has(action)) {
      const expectedStaffCode = process.env.STAFF_ACCESS_CODE || "";
      if (!expectedStaffCode) {
        return response(503, cors, { ok:false, error:"Staff customer access is not configured.", code:"STAFF_AUTH_NOT_CONFIGURED" });
      }
      const requestSource = requestSourceFor(event);
      const failureState = activeFailureState(requestSource);
      if (failureState?.count >= FAILED_ATTEMPT_LIMIT) {
        return response(429, { ...cors, "Retry-After":"900" }, { ok:false, error:"Too many incorrect staff-code attempts. Try again later.", code:"STAFF_AUTH_THROTTLED" });
      }
      if (staffCodeFor(event) !== expectedStaffCode) {
        registerFailedStaffAttempt(requestSource, action);
        return response(401, cors, { ok:false, error:"Enter the staff access code.", code:"STAFF_AUTH_REQUIRED" });
      }
      failedStaffAttempts.delete(requestSource);
    }

    if (!APPS_SCRIPT_URL) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ ok: false, error: "Missing APPS_SCRIPT_URL env var." }),
      };
    }

    if (event.httpMethod === "GET") {
      let url = APPS_SCRIPT_URL;
      const qs = event.rawQuery || "";
      if (qs) url += `?${qs}`;
      if (API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${encodeURIComponent(API_KEY)}`;

      const resp = await fetchAppsScript(url, { method:"GET", headers:{ "Accept":"application/json" } });
      return proxyResult(resp, cors);
    }

    if (API_KEY) body.api_key = API_KEY;

    const sendRequest = SEND_ACTIONS.has(action);
    const resp = await fetchAppsScript(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, sendRequest ? {
      attempts:SEND_UPSTREAM_ATTEMPTS,
      timeoutMs:SEND_UPSTREAM_TIMEOUT_MS,
      send:true,
    } : {
      attempts:UPSTREAM_ATTEMPTS,
      timeoutMs:UPSTREAM_TIMEOUT_MS,
    });
    return proxyResult(resp, cors);
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
}
