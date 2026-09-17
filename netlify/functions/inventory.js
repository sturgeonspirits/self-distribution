// App version: 2026.09.16.26
const APP_VERSION = "2026.09.16.26";
const STAFF_ACTIONS = new Set([
  "customerWorkQueue",
  "updateCustomerApplication",
  "updateOnlineOrderRequest",
]);

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
      if (staffCodeFor(event) !== expectedStaffCode) {
        return response(401, cors, { ok:false, error:"Enter the staff access code.", code:"STAFF_AUTH_REQUIRED" });
      }
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
