// App version: 2026.09.24.43-WEB
import { requireStaffSession } from "./auth.js";

const APP_VERSION = "2026.09.24.43-WEB";
const STAFF_ACTIONS = new Set([
  "outreachDashboard",
  "outreachRecord",
  "outreachSendStatus",
  "outreachNewsletterContacts",
  "outreachCampaigns",
  "outreachCampaign",
  "previewOutreachCampaign",
  "createOutreachCampaign",
  "updateOutreachCampaignRecipient",
  "setOutreachCampaignRecipientExclusion",
  "setOutreachCampaignRecipientExclusions",
  "approveOutreachCampaign",
  "reopenOutreachCampaign",
  "reconcileCampaignSends",
  "rebuildCampaignRecipients",
  "sendOutreachCampaignBatch",
  "saveOutreachDraft",
  "updateOutreachOutcome",
  "logOutreachContact",
  "updateOutreachBusiness",
  "updateOutreachPrograms",
  "upsertNewsletterContact",
  "customerWorkQueue",
  "customerAccountIndex",
  "linkBadgerInvoice",
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

// The site allows roughly 26 seconds for this synchronous function. Keep these
// requests about one second below that ceiling; writes and sends must remain
// single-attempt because Apps Script may finish after the browser times out.
const UPSTREAM_ATTEMPTS = 1;
const UPSTREAM_WRITE_ATTEMPTS = 1;
const UPSTREAM_TIMEOUT_MS = 25000;
const SEND_UPSTREAM_ATTEMPTS = 1;
// Sends use the established 24-second single-attempt window; never retry an
// uncertain send because the original request may still be holding the lock.
const SEND_UPSTREAM_TIMEOUT_MS = 24000;
const SEND_ACTIONS = new Set(["sendOutreachEmail", "sendOutreachTestEmail", "sendOutreachCampaignBatch"]);
const SNAPSHOT_ACTIONS = new Set(["createOutreachCampaign"]);
const CAMPAIGN_READ_ACTIONS = new Set(["outreachCampaigns", "outreachCampaign", "previewOutreachCampaign"]);
const ADMIN_ACTIONS = new Set(["initializeHardenedHub", "repairHubStructure", "reconcileIntegrations", "recalculateOutreachMiles", "backfillEngagementDetails", "upsertProduct", "addSkuToStore"]);
const ACTION_AREAS = new Map([
  ["outreachDashboard", "outreach"], ["outreachRecord", "outreach"], ["outreachSendStatus", "outreach"], ["outreachNewsletterContacts", "outreach"],
  ["outreachCampaigns", "outreach"], ["outreachCampaign", "outreach"], ["previewOutreachCampaign", "outreach"], ["createOutreachCampaign", "outreach"], ["updateOutreachCampaignRecipient", "outreach"], ["setOutreachCampaignRecipientExclusion", "outreach"], ["setOutreachCampaignRecipientExclusions", "outreach"],
  ["approveOutreachCampaign", "outreach"], ["reopenOutreachCampaign", "outreach"], ["reconcileCampaignSends", "outreach"], ["rebuildCampaignRecipients", "outreach"], ["sendOutreachCampaignBatch", "outreach"],
  ["saveOutreachDraft", "outreach"], ["updateOutreachOutcome", "outreach"], ["logOutreachContact", "outreach"], ["updateOutreachBusiness", "outreach"],
  ["updateOutreachPrograms", "outreach"], ["upsertNewsletterContact", "outreach"], ["createOutreachBusiness", "outreach"],
  ["importOutreachBusinesses", "outreach"], ["recalculateOutreachMiles", "outreach"], ["backfillEngagementDetails", "outreach"], ["sendOutreachEmail", "outreach"], ["sendOutreachTestEmail", "outreach"],
  ["customerWorkQueue", "orders"], ["customerAccountIndex", "orders"], ["linkBadgerInvoice", "orders"], ["updateCustomerApplication", "orders"], ["updateOnlineOrderRequest", "orders"],
  ["hubSystemStatus", "orders"], ["initializeHardenedHub", "orders"], ["repairHubStructure", "orders"], ["reconcileIntegrations", "orders"],
  ["initData", "inventory"], ["listSkus", "inventory"], ["addSkuToStore", "inventory"], ["upsertProduct", "inventory"],
  ["submitCounts", "inventory"], ["createReorder", "inventory"], ["managerGrid", "inventory"], ["salesSinceCount", "inventory"], ["updateStoreContacts", "inventory"],
]);

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
      // Google Apps Script creates a one-time googleusercontent response URL for
      // each request. Fetching that URL ourselves after a manual redirect can
      // return a 404; let fetch follow the redirect within the same request.
      const upstream = await fetch(url, { ...options, redirect:"follow", signal:controller.signal });
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
  if (policy.snapshot) {
    throw new Error(lastError?.name === "AbortError"
      ? "Campaign creation did not finish before the connection timed out. Do not create another campaign yet; refresh Campaigns after one minute to check whether the snapshot completed."
      : `Campaign creation connection failed: ${String(lastError)}`);
  }
  if (policy.campaignRead) {
    throw new Error(lastError?.name === "AbortError"
      ? "Campaign review took too long to load. The campaign remains unchanged; wait a minute and refresh Campaigns."
      : `Campaign review connection failed: ${String(lastError)}`);
  }
  throw new Error(lastError?.name === "AbortError"
    ? `Google Sheets took too long to answer after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}.`
    : `Inventory API connection failed after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}: ${String(lastError)}`);
}

function nonJsonUpstreamDetail(upstream, text) {
  const contentType = String(upstream.headers.get("content-type") || "unknown").split(";")[0];
  const title = (text.match(/<title[^>]*>\s*([^<]{1,120})\s*<\/title>/i) || [])[1] || "";
  const normalized = `${title} ${text.slice(0, 800)}`.toLowerCase();
  if (/accounts\.google\.com|servicelogin|sign in to continue/.test(normalized)) {
    return "Google returned a sign-in page instead of the Inventory API response.";
  }
  if (/script error|google apps script|exception:/.test(normalized)) {
    return "Google returned an Apps Script error page instead of the Inventory API response.";
  }
  return `Inventory API returned ${contentType} instead of JSON (HTTP ${upstream.status}).`;
}

async function proxyResult(upstream, cors) {
  const text = await upstream.text();
  try { JSON.parse(text); }
  catch (error) {
    const detail = nonJsonUpstreamDetail(upstream, text);
    console.error("Inventory API returned non-JSON", {
      status:upstream.status,
      contentType:upstream.headers.get("content-type") || "unknown",
      detail,
    });
    return response(502, cors, { ok:false, code:"UPSTREAM_NON_JSON", error:detail });
  }
  return { statusCode:upstream.ok ? 200 : 502, headers:cors, body:text };
}

function requestAction_(event, body) {
  if (event.httpMethod !== "GET") return { action:String(body?.action || ""), params:null };
  const params = new URLSearchParams(event.rawQuery || "");
  const actions = params.getAll("action");
  if (actions.length > 1) return { error:"Only one action parameter is allowed." };
  const action = actions[0] || "";
  if (action !== String(event.queryStringParameters?.action || "")) {
    return { error:"The request action did not match the authenticated action." };
  }
  return { action, params };
}

export async function handler(event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
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
    const request = requestAction_(event, body);
    if (request.error) return response(400, cors, { ok:false, code:"INVALID_ACTION", error:request.error });
    const action = request.action;
    if (action && !STAFF_ACTIONS.has(action) && !ADMIN_ACTIONS.has(action)) {
      return response(400, cors, { ok:false, code:"UNKNOWN_ACTION", error:"Unknown Inventory API action." });
    }

    if (STAFF_ACTIONS.has(action) || ADMIN_ACTIONS.has(action)) {
      const staff = requireStaffSession(event);
      if (staff.error) return response(staff.statusCode, cors, { ok:false, error:staff.error, code:staff.code });
      const area = ACTION_AREAS.get(action);
      if (!area || !staff.areas?.includes(area)) {
        return response(403, cors, { ok:false, error:"Your staff account does not have access to this workspace.", code:"STAFF_AREA_FORBIDDEN" });
      }
      if (ADMIN_ACTIONS.has(action) && staff.role !== "admin") {
        return response(403, cors, { ok:false, error:"This action requires an administrator role.", code:"STAFF_ROLE_FORBIDDEN" });
      }
      // These fields are written only after browser input has been parsed, so the
      // Apps Script audit trail receives the identity verified by Zoho, not a name
      // typed into the page.
      body.staff_name = staff.name;
      body.authenticated_staff_name = staff.name;
      body.authenticated_staff_email = staff.email;
      body.authenticated_staff_id = staff.sub;
      body.authenticated_staff_role = staff.role;
      if (["submitCounts", "createReorder"].includes(action)) body.rep = staff.name;
    }

    if (!APPS_SCRIPT_URL) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ ok: false, error: "Missing APPS_SCRIPT_URL env var." }),
      };
    }

    if (event.httpMethod === "GET") {
      const url = new URL(APPS_SCRIPT_URL);
      request.params.forEach((value, key) => url.searchParams.append(key, value));
      if (API_KEY) url.searchParams.set("api_key", API_KEY);

      const resp = await fetchAppsScript(url.toString(), { method:"GET", headers:{ "Accept":"application/json" } }, CAMPAIGN_READ_ACTIONS.has(action) ? {
        attempts:1,
        timeoutMs:SEND_UPSTREAM_TIMEOUT_MS,
        campaignRead:true,
      } : {});
      return proxyResult(resp, cors);
    }

    // Apps Script reliably exposes URL parameters for both GET and POST. Keep the
    // body copy for compatibility, but also put the server-only key on the POST
    // URL so authorization does not depend on postData parsing.
    let postUrl = APPS_SCRIPT_URL;
    if (API_KEY) {
      body.api_key = API_KEY;
      postUrl += (postUrl.includes("?") ? "&" : "?") + `api_key=${encodeURIComponent(API_KEY)}`;
    }

    const sendRequest = SEND_ACTIONS.has(action);
    const snapshotRequest = SNAPSHOT_ACTIONS.has(action);
    const resp = await fetchAppsScript(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, sendRequest ? {
      attempts:SEND_UPSTREAM_ATTEMPTS,
      timeoutMs:SEND_UPSTREAM_TIMEOUT_MS,
      send:true,
    } : snapshotRequest ? {
      attempts:1,
      timeoutMs:SEND_UPSTREAM_TIMEOUT_MS,
      snapshot:true,
    } : CAMPAIGN_READ_ACTIONS.has(action) ? {
      attempts:1,
      timeoutMs:SEND_UPSTREAM_TIMEOUT_MS,
      campaignRead:true,
    } : {
      // A Google Apps Script write can finish after this function times out.
      // Retrying it here risks a duplicate note, activity row, or update while
      // the first request still owns the Apps Script lock.
      attempts:UPSTREAM_WRITE_ATTEMPTS,
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
