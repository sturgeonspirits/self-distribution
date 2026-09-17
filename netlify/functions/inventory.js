// App version: 2026.09.17.28
const APP_VERSION = "2026.09.17.28";
const STAFF_ACTIONS = new Set([
  "outreachDashboard",
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
const failedStaffAttempts = new Map();

function response(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
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

      const resp = await fetch(url, { method: "GET" });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...cors },
        body: await resp.text(),
      };
    }

    if (API_KEY) body.api_key = API_KEY;

    const resp = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...cors },
      body: await resp.text(),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
}
