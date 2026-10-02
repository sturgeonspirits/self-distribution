// Staff access roster read from a Google Sheet.
//
// The roster lives in the FIRST tab of a dedicated Google Sheet ("Hub Staff Access").
// Karl adds, removes, or changes staff there; no Netlify variable edit or redeploy.
// Netlify reads it with the same read-only service account as the Drive relay
// (GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY), by exporting the first tab as CSV.
// The sheet must be shared with that service account as Viewer.
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
// - If the sheet cannot be read, the last good copy is used. If there has never been a
//   good copy in this function instance, the caller falls back (see auth.js).
// - A sheet without an Email or Role column, or with no active admin, is treated as
//   misconfigured rather than as "nobody has access", so a bad edit cannot lock Karl out.

import { accessToken } from "./drive-relay.js";

export const STAFF_AREAS = ["inventory", "outreach", "orders"];
const ROSTER_TTL_MS = 2 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 3500;
const DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files/";

let cache = null;          // { entries, fetchedAt }
let lastFailureAt = 0;
let inFlight = null;

export function rosterConfig(env = process.env) {
  const clientEmail = String(env.GOOGLE_SA_CLIENT_EMAIL || "").trim();
  const privateKey = String(env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const sheetId = String(env.STAFF_ROSTER_SHEET_ID || "").trim();
  return { clientEmail, privateKey, sheetId, enabled:!!(clientEmail && privateKey && sheetId) };
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
  const rows = parseCsv(text).filter(row => row.some(cell => String(cell).trim()));
  if (!rows.length) throw new Error("The staff access sheet is empty.");
  const columns = {};
  rows[0].forEach((cell, index) => {
    const key = headerKey(cell);
    if (key && columns[key] === undefined) columns[key] = index;
  });
  if (columns.email === undefined || columns.role === undefined) {
    throw new Error("The staff access sheet's first tab needs Email and Role columns.");
  }
  const entries = {};
  const warnings = [];
  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    const email = String(row[columns.email] || "").trim().toLowerCase();
    if (!email) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { warnings.push(`Row ${line}: "${email}" is not an email address.`); return; }
    if (columns.active !== undefined && !ticked(row[columns.active])) return;
    const roleText = String(row[columns.role] || "").trim().toLowerCase();
    const role = roleText === "admin" ? "admin" : roleText === "staff" || roleText === "" ? "staff" : "";
    if (!role) { warnings.push(`Row ${line}: role "${roleText}" is not admin or staff.`); return; }
    const listed = columns.areas === undefined ? [] : String(row[columns.areas] || "").toLowerCase().split(/[,;\s]+/).map(area => area === "accounts" ? "orders" : area);
    const areas = role === "admin" ? [...STAFF_AREAS] : STAFF_AREAS.filter(area => listed.includes(area) || (columns[area] !== undefined && ticked(row[columns[area]])));
    if (!areas.length) { warnings.push(`Row ${line}: ${email} has no areas ticked.`); return; }
    if (entries[email]) warnings.push(`Row ${line}: ${email} is listed more than once; the later row wins.`);
    entries[email] = { role, areas, name:String(row[columns.name] ?? "").trim() };
  });
  if (!Object.values(entries).some(entry => entry.role === "admin")) {
    throw new Error("The staff access sheet has no active admin; ignoring it so no one is locked out.");
  }
  return { entries, warnings };
}

async function fetchRosterCsv(config) {
  // One deadline covers the token request and the export, so a stalled Google call
  // can never hold a staff request open.
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("Staff access sheet read timed out.")); }, FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const token = await accessToken(config);
      const response = await fetch(`${DRIVE_FILE_URL}${encodeURIComponent(config.sheetId)}/export?mimeType=text%2Fcsv`, {
        headers:{ Authorization:`Bearer ${token}` },
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`Staff access sheet read failed (HTTP ${response.status}).`);
      return await response.text();
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

// Returns { entries, source:"sheet" } when a current or last-good roster is available,
// { source:"unconfigured" } when no sheet is set up, or { source:"unavailable" } when
// the sheet is set up but has never been read successfully by this instance.
export async function loadStaffRoster({ config = rosterConfig(), now = Date.now() } = {}) {
  if (!config.enabled) return { source:"unconfigured" };
  const fresh = cache && now - cache.fetchedAt < ROSTER_TTL_MS;
  if (fresh) return { entries:cache.entries, source:"sheet" };
  const backingOff = now - lastFailureAt < RETRY_AFTER_FAILURE_MS;
  if (!backingOff) {
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const { entries, warnings } = rosterFromCsv(await fetchRosterCsv(config));
          if (warnings.length) console.warn("Staff access sheet warnings:", warnings.join(" | "));
          cache = { entries, fetchedAt:Date.now() };
        } catch (error) {
          lastFailureAt = Date.now();
          console.error("Staff access sheet could not be used:", error?.message || error);
        } finally {
          inFlight = null;
        }
      })();
    }
    await inFlight;
  }
  return cache ? { entries:cache.entries, source:"sheet" } : { source:"unavailable" };
}

// Test hook.
export function resetStaffRosterCache() {
  cache = null;
  lastFailureAt = 0;
  inFlight = null;
}
