// App version: 2026.10.08.40-WEB
import { createHmac, timingSafeEqual } from "node:crypto";

const APP_VERSION = "2026.10.08.40-WEB";
const TRACKED_TARGETS = new Set(["sell_sheet", "application"]);
const BOT_USER_AGENT = /(bot|crawler|spider|preview|slackbot|facebookexternalhit|linkedinbot|twitterbot|discordbot|whatsapp|googleimageproxy|proofpoint|mimecast|barracuda|urlscan|virustotal|safelinks|security|scanner|curl|wget)/i;
const PUBLIC_SITE_URL_FALLBACK = "https://distribution.sturgeonspirits.com";
const SELL_SHEET_ACCESS_SECONDS = 90 * 24 * 60 * 60;

function redirect(location) {
  return {
    statusCode:302,
    headers:{ "Location":location, "Cache-Control":"no-store", "X-App-Version":APP_VERSION },
    body:"",
  };
}

function signaturePayload(target, accountId, stage) {
  return `${target}\n${accountId}\n${stage}`;
}

function validSignature(target, accountId, stage, supplied, secret) {
  if (!secret || !supplied) return false;
  const expected = createHmac("sha256", secret).update(signaturePayload(target, accountId, stage)).digest("base64url");
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(String(supplied));
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function publicSiteUrl() {
  const configured = String(process.env.PUBLIC_SITE_URL || "").trim();
  try {
    const parsed = new URL(configured);
    return parsed.protocol === "https:" ? parsed.origin : PUBLIC_SITE_URL_FALLBACK;
  } catch (_) {
    return PUBLIC_SITE_URL_FALLBACK;
  }
}

function sellSheetAccessToken(accountId) {
  const secret = String(process.env.SELL_SHEET_ACCESS_SECRET || process.env.TRACKING_LINK_SECRET || "");
  if (!secret || !accountId) return "";
  const payload = Buffer.from(JSON.stringify({ purpose:"sell_sheet", account_id:String(accountId), exp:Math.floor(Date.now() / 1000) + SELL_SHEET_ACCESS_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function destinationFor(target, params, allowSellSheetAccess) {
  if (target === "sell_sheet") {
    const destination = new URL("/sell-sheet.html", publicSiteUrl());
    const token = allowSellSheetAccess ? sellSheetAccessToken(params.get("a") || "") : "";
    if (token) destination.searchParams.set("access", token);
    return destination.toString();
  }
  const destination = new URL("/customer-signup.html", publicSiteUrl());
  destination.searchParams.set("account_id", params.get("a") || "");
  destination.searchParams.set("business", params.get("business") || "");
  destination.searchParams.set("email", params.get("email") || "");
  return destination.toString();
}

async function logClick(params) {
  const appsScriptUrl = String(process.env.APPS_SCRIPT_URL || "").trim();
  const apiKey = String(process.env.API_KEY || "");
  if (!appsScriptUrl) return;
  const url = new URL(appsScriptUrl);
  if (apiKey) url.searchParams.set("api_key", apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    await fetch(url.toString(), {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        action:"recordEmailEngagement",
        event_type:"click",
        target:params.get("t"),
        account_id:params.get("a"),
        stage:params.get("s"),
        api_key:apiKey,
      }),
      signal:controller.signal,
    });
  } catch (_) {
    // Redirects must continue even when the analytics write fails or times out.
  } finally {
    clearTimeout(timer);
  }
}

export async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode:405, headers:{ "Cache-Control":"no-store" }, body:"Method not allowed." };
  const params = new URLSearchParams(event.rawQuery || "");
  const target = params.get("t") || "";
  if (!TRACKED_TARGETS.has(target)) return { statusCode:404, headers:{ "Cache-Control":"no-store" }, body:"Not found." };
  const userAgent = String(event.headers?.["user-agent"] || event.headers?.["User-Agent"] || "");
  const signatureIsValid = validSignature(target, params.get("a") || "", params.get("s") || "", params.get("k") || "", process.env.TRACKING_LINK_SECRET || "");
  const visitorIsHuman = !BOT_USER_AGENT.test(userAgent);
  const destination = destinationFor(target, params, signatureIsValid && visitorIsHuman);
  if (!destination) return { statusCode:503, headers:{ "Cache-Control":"no-store" }, body:"Destination is not configured." };

  const isTestLink = params.get("x") === "test";
  if (signatureIsValid && !isTestLink && visitorIsHuman) await logClick(params);
  return redirect(destination);
}
