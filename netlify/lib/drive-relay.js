// Drive response relay (reader side).
//
// Google's Apps Script web-app response handoff intermittently stalls or returns a 404
// page even when the script finished in 1–8 seconds. The Inventory API therefore also
// writes each response into one of 32 fixed Drive "slot" files (see relayedOutput_ in
// apps-script/Code.gs). This module reads that slot directly through the Drive API with
// a read-only service account and races it against the normal response. Whichever
// valid JSON arrives first wins. The Apps Script request is only ever sent once.
//
// Enabled only when GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY and
// RELAY_MANIFEST_FILE_ID are all set; otherwise callers use the normal path unchanged.

import { createSign, randomUUID } from "node:crypto";

export const RELAY_SLOT_COUNT = 32;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files/";
const FIRST_POLL_DELAY_MS = 900;
const POLL_INTERVAL_MS = 700;

let cachedToken = null;
let cachedManifest = null;

// Must match relaySlotIndex_() in apps-script/Code.gs exactly.
export function relaySlotIndex(relayId) {
  let hash = 0;
  const text = String(relayId || "");
  for (let index = 0; index < text.length; index += 1) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  return hash % RELAY_SLOT_COUNT;
}

export function relayConfig(env = process.env) {
  const clientEmail = String(env.GOOGLE_SA_CLIENT_EMAIL || "").trim();
  const privateKey = String(env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const manifestId = String(env.RELAY_MANIFEST_FILE_ID || "").trim();
  return { clientEmail, privateKey, manifestId, enabled:!!(clientEmail && privateKey && manifestId) };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function accessToken(config) {
  if (cachedToken && cachedToken.expiresAt - 60000 > Date.now()) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg:"RS256", typ:"JWT" }));
  const claims = base64Url(JSON.stringify({
    iss:config.clientEmail,
    scope:"https://www.googleapis.com/auth/drive.readonly",
    aud:TOKEN_URL,
    iat:now,
    exp:now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(config.privateKey).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const response = await fetch(TOKEN_URL, {
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body:new URLSearchParams({ grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer", assertion:`${header}.${claims}.${signature}` }).toString(),
  });
  if (!response.ok) throw new Error(`Service account token request failed (HTTP ${response.status}).`);
  const data = await response.json();
  cachedToken = { value:data.access_token, expiresAt:Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function driveText(config, fileId) {
  const token = await accessToken(config);
  const response = await fetch(`${DRIVE_FILE_URL}${encodeURIComponent(fileId)}?alt=media`, { headers:{ Authorization:`Bearer ${token}` } });
  if (!response.ok) throw new Error(`Drive read failed (HTTP ${response.status}).`);
  return response.text();
}

async function slotIds(config) {
  if (cachedManifest) return cachedManifest;
  const manifest = JSON.parse(await driveText(config, config.manifestId));
  if (!Array.isArray(manifest.slots) || manifest.slots.length !== RELAY_SLOT_COUNT) throw new Error("Relay manifest is missing its slot list.");
  cachedManifest = manifest.slots;
  return cachedManifest;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function withRelayId(url, relayId) {
  return `${url}${url.includes("?") ? "&" : "?"}relay_id=${encodeURIComponent(relayId)}`;
}

// Resolves with a Response built from the first valid JSON body, or rejects with an
// Error named "AbortError" when neither copy arrives before the deadline.
export async function fetchWithDriveRelay(url, options, { deadlineMs, config = relayConfig() } = {}) {
  const relayId = randomUUID();
  const controller = new AbortController();
  const deadline = Date.now() + deadlineMs;
  let settled = false;

  const direct = (async () => {
    const upstream = await fetch(withRelayId(url, relayId), { ...options, redirect:"follow", signal:controller.signal });
    const text = await upstream.text();
    JSON.parse(text); // an HTML error page must not win the race
    return new Response(text, { status:upstream.status, headers:{ "content-type":upstream.headers.get("content-type") || "application/json" } });
  })();

  const relay = (async () => {
    const slotId = (await slotIds(config))[relaySlotIndex(relayId)];
    await sleep(FIRST_POLL_DELAY_MS);
    while (!settled && Date.now() < deadline) {
      try {
        const slot = JSON.parse(await driveText(config, slotId));
        if (slot && slot.relay_id === relayId && typeof slot.body === "string") {
          JSON.parse(slot.body);
          return new Response(slot.body, { status:200, headers:{ "content-type":"application/json" } });
        }
      } catch (error) {
        // A half-written or unrelated slot; keep polling until the deadline.
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error("Relay deadline reached.");
  })();

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("The Inventory API did not answer before the deadline.");
      error.name = "AbortError";
      reject(error);
    }, Math.max(0, deadline - Date.now()));
  });

  try {
    return await Promise.race([Promise.any([direct, relay]), timeout]);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    const failure = new Error(`Inventory API connection failed: ${String(error?.errors?.[0] || error)}`);
    throw failure;
  } finally {
    settled = true;
    clearTimeout(timer);
    controller.abort();
  }
}

// Test hook.
export function resetDriveRelayCache() {
  cachedToken = null;
  cachedManifest = null;
}
