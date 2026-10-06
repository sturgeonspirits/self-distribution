// App version: 2026.10.06.30-WEB
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireStaffSession } from "./auth.js";

const APP_VERSION = "2026.10.06.30-WEB";
const ACCESS_SECONDS = 90 * 24 * 60 * 60;

function headers() {
  return {
    "Content-Type":"application/json",
    "Cache-Control":"no-store",
    "X-Robots-Tag":"noindex, nofollow, noarchive",
    "X-App-Version":APP_VERSION,
  };
}

function json(statusCode, body) {
  return { statusCode, headers:headers(), body:JSON.stringify(body) };
}

function accessSecret() {
  // TRACKING_LINK_SECRET is a temporary compatibility fallback for existing deployments. Set the dedicated secret
  // before rollout so sell-sheet links can be rotated without changing email-link signatures.
  return String(process.env.SELL_SHEET_ACCESS_SECRET || process.env.TRACKING_LINK_SECRET || "");
}

function signedToken(payload) {
  const secret = accessSecret();
  if (!secret) return "";
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

function verifiedToken(token) {
  const [encoded, supplied, extra] = String(token || "").split(".");
  const secret = accessSecret();
  if (!encoded || !supplied || extra || !secret) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const expectedBytes = Buffer.from(expected); const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.purpose !== "sell_sheet" || !String(payload.account_id || "").trim() || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) { return null; }
}

async function upstreamSellSheet({ prices, accountId }) {
  const base = String(process.env.APPS_SCRIPT_URL || "").trim();
  if (!base) throw new Error("Missing APPS_SCRIPT_URL env var.");
  const url = new URL(base);
  const apiKey = String(process.env.API_KEY || "");
  if (apiKey) url.searchParams.set("api_key", apiKey);
  const response = await fetch(url.toString(), {
    method:"POST", redirect:"follow", headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ action:"sellSheet", api_key:apiKey, sell_sheet_proxy:true, include_prices:prices, account_id:accountId || "" }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.error || "The sell sheet could not load right now.");
  // Defense in depth: a no-price response must never contain price fields, regardless of an upstream regression.
  if (!prices) (result.sections || []).forEach(section => (section.products || []).forEach(product => delete product.price_cents));
  return result;
}

function publicUrl(path) {
  const configured = String(process.env.PUBLIC_SITE_URL || "https://distribution.sturgeonspirits.com").trim();
  try { return new URL(path, new URL(configured).origin).toString(); }
  catch (_) { return `https://distribution.sturgeonspirits.com${path}`; }
}

export async function handler(event) {
  const params = new URLSearchParams(event.rawQuery || "");
  const action = params.get("action") || "view";
  if (event.httpMethod === "OPTIONS") return { statusCode:204, headers:headers(), body:"" };

  if (action === "createLink") {
    if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed." });
    const staff = await requireStaffSession(event);
    if (staff.error) return json(staff.statusCode, { ok:false, code:staff.code, error:staff.error });
    if (!staff.areas?.includes("orders")) return json(403, { ok:false, code:"STAFF_AREA_FORBIDDEN", error:"Your staff account does not have access to customer records." });
    let body; try { body = JSON.parse(event.body || "{}"); } catch (_) { return json(400, { ok:false, error:"Invalid request." }); }
    const accountId = String(body.account_id || "").trim();
    if (!accountId || accountId.length > 100) return json(400, { ok:false, error:"A valid account is required." });
    const token = signedToken({ purpose:"sell_sheet", account_id:accountId, exp:Math.floor(Date.now() / 1000) + ACCESS_SECONDS });
    if (!token) return json(503, { ok:false, error:"Sell-sheet access links are not configured." });
    return json(200, { ok:true, url:publicUrl(`/sell-sheet.html?access=${encodeURIComponent(token)}`), expires_at:new Date((Math.floor(Date.now() / 1000) + ACCESS_SECONDS) * 1000).toISOString() });
  }

  if (action !== "view" || event.httpMethod !== "GET") return json(404, { ok:false, error:"Not found." });
  const token = verifiedToken(params.get("access"));
  const staff = token ? null : await requireStaffSession(event);
  const prices = !!token || (!staff?.error && !!staff?.areas?.length);
  try {
    const result = await upstreamSellSheet({ prices, accountId:token?.account_id || "" });
    return json(200, Object.assign(result, { access:{ prices, account_specific:!!token?.account_id, account_id:token?.account_id || "", source:token ? "customer_link" : prices ? "staff" : "public" } }));
  } catch (error) {
    return json(502, { ok:false, error:error?.message || "The sell sheet could not load right now.", access:{ prices:false, source:"public" } });
  }
}
