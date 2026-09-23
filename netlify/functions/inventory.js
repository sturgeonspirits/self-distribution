// App version: 2026.09.23.6-WEB
import { requireStaffSession } from "./auth.js";

const APP_VERSION = "2026.09.23.6-WEB";
const STAFF_ACTIONS = new Set([
  "outreachDashboard",
  "outreachSendStatus",
  "outreachNewsletterContacts",
  "outreachCampaigns",
  "outreachCampaign",
  "createOutreachCampaign",
  "updateOutreachCampaignRecipient",
  "setOutreachCampaignRecipientExclusion",
  "approveOutreachCampaign",
  "sendOutreachCampaignBatch",
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

const UPSTREAM_ATTEMPTS = 2;
const UPSTREAM_TIMEOUT_MS = 11000;
const SEND_UPSTREAM_ATTEMPTS = 1;
const SEND_UPSTREAM_TIMEOUT_MS = 24000;
const SEND_ACTIONS = new Set(["sendOutreachEmail", "sendOutreachTestEmail", "sendOutreachCampaignBatch"]);
const SNAPSHOT_ACTIONS = new Set(["createOutreachCampaign"]);
const CAMPAIGN_READ_ACTIONS = new Set(["outreachCampaigns", "outreachCampaign"]);
const ADMIN_ACTIONS = new Set(["initializeHardenedHub", "reconcileIntegrations", "upsertProduct", "addSkuToStore"]);
const ACTION_AREAS = new Map([
  ["outreachDashboard", "outreach"], ["outreachSendStatus", "outreach"], ["outreachNewsletterContacts", "outreach"],
  ["outreachCampaigns", "outreach"], ["outreachCampaign", "outreach"], ["createOutreachCampaign", "outreach"], ["updateOutreachCampaignRecipient", "outreach"], ["setOutreachCampaignRecipientExclusion", "outreach"],
  ["approveOutreachCampaign", "outreach"], ["sendOutreachCampaignBatch", "outreach"],
  ["saveOutreachDraft", "outreach"], ["updateOutreachOutcome", "outreach"], ["updateOutreachBusiness", "outreach"],
  ["updateOutreachPrograms", "outreach"], ["upsertNewsletterContact", "outreach"], ["createOutreachBusiness", "outreach"],
  ["importOutreachBusinesses", "outreach"], ["sendOutreachEmail", "outreach"], ["sendOutreachTestEmail", "outreach"],
  ["customerWorkQueue", "orders"], ["updateCustomerApplication", "orders"], ["updateOnlineOrderRequest", "orders"],
  ["hubSystemStatus", "orders"], ["initializeHardenedHub", "orders"], ["reconcileIntegrations", "orders"],
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
    ? `Google Sheets took too long to answer after ${attempts} attempts.`
    : `Inventory API connection failed after ${attempts} attempts: ${String(lastError)}`);
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

function staffActionFor(event, body) {
  if (event.httpMethod === "GET") return event.queryStringParameters?.action || "";
  return body?.action || "";
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
    const action = staffActionFor(event, body);

    if (STAFF_ACTIONS.has(action)) {
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
      let url = APPS_SCRIPT_URL;
      const qs = event.rawQuery || "";
      if (qs) url += `?${qs}`;
      if (API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${encodeURIComponent(API_KEY)}`;

      const resp = await fetchAppsScript(url, { method:"GET", headers:{ "Accept":"application/json" } }, CAMPAIGN_READ_ACTIONS.has(action) ? {
        attempts:1,
        timeoutMs:SEND_UPSTREAM_TIMEOUT_MS,
        campaignRead:true,
      } : {});
      return proxyResult(resp, cors);
    }

    if (API_KEY) body.api_key = API_KEY;

    const sendRequest = SEND_ACTIONS.has(action);
    const snapshotRequest = SNAPSHOT_ACTIONS.has(action);
    const resp = await fetchAppsScript(APPS_SCRIPT_URL, {
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
