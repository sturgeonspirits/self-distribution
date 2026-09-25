// App version: 2026.09.24.43-WEB
import { createHmac, timingSafeEqual } from "node:crypto";

const APP_VERSION = "2026.09.24.43-WEB";
const TRACKED_TARGETS = new Set(["sell_sheet", "application"]);
const BOT_USER_AGENT = /(bot|crawler|spider|preview|slackbot|facebookexternalhit|linkedinbot|twitterbot|discordbot|whatsapp|googleimageproxy|proofpoint|mimecast|barracuda|urlscan|virustotal|safelinks|security|scanner|curl|wget)/i;

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

function destinationFor(target, params) {
  if (target === "sell_sheet") return String(process.env.SELL_SHEET_URL || "").trim();
  const destination = new URL("/customer-signup.html", "https://distribution-hub.netlify.app");
  destination.searchParams.set("account_id", params.get("a") || "");
  destination.searchParams.set("business", params.get("business") || "");
  destination.searchParams.set("email", params.get("email") || "");
  return `${destination.pathname}?${destination.searchParams.toString()}`;
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
  const destination = destinationFor(target, params);
  if (!destination) return { statusCode:503, headers:{ "Cache-Control":"no-store" }, body:"Destination is not configured." };

  const userAgent = String(event.headers?.["user-agent"] || event.headers?.["User-Agent"] || "");
  const signatureIsValid = validSignature(target, params.get("a") || "", params.get("s") || "", params.get("k") || "", process.env.TRACKING_LINK_SECRET || "");
  const isTestLink = params.get("x") === "test";
  if (signatureIsValid && !isTestLink && !BOT_USER_AGENT.test(userAgent)) await logClick(params);
  return redirect(destination);
}
