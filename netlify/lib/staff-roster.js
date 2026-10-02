// Staff access roster read from a Google Sheet.
//
// The roster lives in the "Staff Access" tab of the Hub spreadsheet (STAFF_ROSTER_SHEET_ID;
// tab name overridable with STAFF_ROSTER_TAB). Karl adds, removes, or changes staff there;
// no Netlify variable edit or redeploy. Netlify reads that one tab through the Google Sheets
// API with the same read-only service account as the Drive relay (GOOGLE_SA_CLIENT_EMAIL /
// GOOGLE_SA_PRIVATE_KEY). The Hub must be shared with that service account as Viewer, and
// the Google Sheets API must be enabled in the service account's Cloud project.
//
// Columns (header names, any order, case-insensitive; extra columns are ignored):
//   Staff ID | Display Name | Email | Role | Areas | Inventory | Outreach | Orders | Active
// Role is "admin" or "staff". Admins get every area. Staff get the areas ticked in the
// Inventory/Outreach/Orders columns and/or listed in Areas ("inventory, orders").
// Active is optional; when the column exists, an unticked row has no access.
//
// Safety rules:
// - The roster is cached in memory for ROSTER_TTL_MS, so a removal takes effect within
//   that time on every request (existing sessions included).
// - If the tab cannot be refreshed after its two-minute cache lifetime, the caller
//   fails closed. A roster change therefore cannot be bypassed during an outage.
// - A tab without Email, Role, or Active, or with no active admin, is misconfigured
//   and denied rather than silently granting a partial or stale roster.

import { accessToken } from "./drive-relay.js";

export const STAFF_AREAS = ["inventory", "outreach", "orders"];
const ROSTER_TTL_MS = 2 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 3500;
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets/";

let cache = null;          // { entries, fetchedAt }
let lastFailureAt = 0;
let inFlight = null;

export function rosterConfig(env = process.env) {
  const clientEmail = String(env.GOOGLE_SA_CLIENT_EMAIL || "").trim();
  const privateKey = String(env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const sheetId = String(env.STAFF_ROSTER_SHEET_ID || "").trim();
  const tab = String(env.STAFF_ROSTER_TAB || "Staff Access").trim() || "Staff Access";
  return { clientEmail, privateKey, sheetId, tab, configured:!!sheetId, enabled:!!(clientEmail && privateKey && sheetId) };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text || "").replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function ticked(value) {
  return ["true", "yes", "y", "x", "1", "✓", "✔", "checked", "on"].includes(String(value || "").trim().toLowerCase());
}

function headerKey(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (["email", "emailaddress", "zohoemail", "login", "loginemail"].includes(text)) return "email";
  if (["name", "displayname", "staffname", "fullname"].includes(text)) return "name";
  if (["areas", "workareas", "workspaces"].includes(text)) return "areas";
  if (["role", "access", "accesslevel"].includes(text)) return "role";
  if (["inventory"].includes(text)) return "inventory";
  if (["outreach"].includes(text)) return "outreach";
  if (["orders", "ordersaccounts", "ordersandaccounts", "accounts"].includes(text)) return "orders";
  if (["active", "enabled"].includes(text)) return "active";
  return "";
}

// Returns { entries:{ email:{ role, areas, name } }, warnings:[] } or throws when misconfigured.
export function rosterFromCsv(text) {
  return rosterFromRows(parseCsv(text));
}

export function rosterFromRows(values) {
  const rows = (Array.isArray(values) ? values : []).map(row => (Array.isArray(row) ? row : []).map(cell => String(cell ?? ""))).filter(row => row.some(cell => cell.trim()));
  if (!rows.length) throw new Error("The Staff Access tab is empty or missing.");
  const columns = {};
  rows[0].forEach((cell, index) => {
    const key = headerKey(cell);
    if (key && columns[key] === undefined) columns[key] = index;
  });
  if (columns.email === undefined || columns.role === undefined || columns.active === undefined) {
    throw new Error("The Staff Access tab needs Email, Role, and Active columns.");
  }
  const entries = {};
  const warnings = [];
  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    const email = String(row[columns.email] || "").trim().toLowerCase();
    if (!email) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { warnings.push(`Row ${line}: "${email}" is not an email address.`); return; }
    if (!ticked(row[columns.active])) return;
    const roleText = String(row[columns.role] || "").trim().toLowerCase();
    const role = roleText === "admin" ? "admin" : roleText === "staff" ? "staff" : "";
    if (!role) { warnings.push(`Row ${line}: role "${roleText}" is not admin or staff.`); return; }
    const listed = columns.areas === undefined ? [] : String(row[columns.areas] || "").toLowerCase().split(/[,;\s]+/).map(area => area === "accounts" ? "orders" : area);
    const areas = role === "admin" ? [...STAFF_AREAS] : STAFF_AREAS.filter(area => listed.includes(area) || (columns[area] !== undefined && ticked(row[columns[area]])));
    if (!areas.length) { warnings.push(`Row ${line}: ${email} has no areas ticked.`); return; }
    if (entries[email]) warnings.push(`Row ${line}: ${email} is listed more than once; the later row wins.`);
    entries[email] = { role, areas, name:String(row[columns.name] ?? "").trim() };
  });
  if (!Object.values(entries).some(entry => entry.role === "admin")) {
    throw new Error("The Staff Access tab has no active admin; denying access until it is corrected.");
  }
  return { entries, warnings };
}

async function fetchRosterRows(config) {
  // One deadline covers the token request and the read, so a stalled Google call
  // can never hold a staff request open.
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("Staff Access tab read timed out.")); }, FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const token = await accessToken(config);
      const range = encodeURIComponent(`'${config.tab.replace(/'/g, "''")}'!A1:Z1000`);
      const response = await fetch(`${SHEETS_URL}${encodeURIComponent(config.sheetId)}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, {
        headers:{ Authorization:`Bearer ${token}` },
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`Staff Access tab read failed (HTTP ${response.status}).`);
      const data = await response.json();
      return Array.isArray(data.values) ? data.values : [];
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

// Returns { entries, source:"sheet" } only while a current cache exists. Once that
// cache expires, any failed refresh is unavailable and callers fail closed.
export async function loadStaffRoster({ config = rosterConfig(), now = Date.now() } = {}) {
  if (!config.enabled) return { source:config.configured ? "unavailable" : "unconfigured" };
  const fresh = cache && now - cache.fetchedAt < ROSTER_TTL_MS;
  if (fresh) return { entries:cache.entries, source:"sheet" };
  const backingOff = now - lastFailureAt < RETRY_AFTER_FAILURE_MS;
  if (!backingOff) {
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const { entries, warnings } = rosterFromRows(await fetchRosterRows(config));
          if (warnings.length) console.warn("Staff Access tab warnings:", warnings.join(" | "));
          cache = { entries, fetchedAt:Date.now() };
        } catch (error) {
          lastFailureAt = Date.now();
          console.error("Staff Access tab could not be used:", error?.message || error);
        } finally {
          inFlight = null;
        }
      })();
    }
    await inFlight;
  }
  return cache && Date.now() - cache.fetchedAt < ROSTER_TTL_MS
    ? { entries:cache.entries, source:"sheet" }
    : { source:"unavailable" };
}

// Test hook.
export function resetStaffRosterCache() {
  cache = null;
  lastFailureAt = 0;
  inFlight = null;
}
