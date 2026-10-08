// Zoho OIDC authentication for the staff application.
// Required Netlify environment variables:
// ZOHO_OIDC_CLIENT_ID, ZOHO_OIDC_CLIENT_SECRET, APP_SESSION_SECRET.
// Staff access comes from the "Staff Access" tab of the Hub spreadsheet (STAFF_ROSTER_SHEET_ID,
// read with GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY; see netlify/lib/staff-roster.js).
// Staff email, role, and workspace access are never read from Netlify environment
// variables. A missing or unavailable roster denies access.
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { loadStaffRoster } from "../lib/staff-roster.js";

const SESSION_COOKIE = "distribution_staff_session";
const STATE_COOKIE = "distribution_zoho_state";
const SESSION_SECONDS = 8 * 60 * 60;
const STATE_SECONDS = 10 * 60;
const STAFF_ROSTER_UNAVAILABLE_MESSAGE = "Staff list temporarily unavailable, try again in a minute.";

function base64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function fromBase64url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function config() {
  const issuer = String(process.env.ZOHO_OIDC_ISSUER || "https://accounts.zoho.com").replace(/\/$/, "");
  return {
    issuer,
    clientId:String(process.env.ZOHO_OIDC_CLIENT_ID || "").trim(),
    clientSecret:String(process.env.ZOHO_OIDC_CLIENT_SECRET || "").trim(),
    redirectUri:String(process.env.ZOHO_OIDC_REDIRECT_URI || "").trim(),
    sessionSecret:String(process.env.APP_SESSION_SECRET || "").trim(),
  };
}

function configured() {
  const value = config();
  return !!(value.clientId && value.clientSecret && value.redirectUri && value.sessionSecret.length >= 32);
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSigned(payload, secret) {
  const encoded = base64url(payload);
  return `${encoded}.${sign(encoded, secret)}`;
}

function decodeSigned(value, secret) {
  const [encoded, signature] = String(value || "").split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(fromBase64url(encoded));
    return payload && Number(payload.exp) > Math.floor(Date.now() / 1000) ? payload : null;
  } catch (_) {
    return null;
  }
}

function cookies(event) {
  return String(event.headers?.cookie || event.headers?.Cookie || "").split(";").reduce((result, item) => {
    const index = item.indexOf("=");
    if (index > 0) result[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
    return result;
  }, {});
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function json(statusCode, body, headers = {}) {
  return { statusCode, headers:{ "Content-Type":"application/json", "Cache-Control":"no-store", ...headers }, body:JSON.stringify(body) };
}

// Only a path on this site. Browsers read "\\" as "/" and drop tabs and newlines in a
// Location header, so "/\\evil.example" or "/<tab>/evil.example" would leave the site.
function safeReturnTo(value) {
  const path = String(value || "/");
  if (!/^\/(?![\/\\])/.test(path) || /[\\\s\u0000-\u001f\u007f]/.test(path)) return "/";
  return path;
}

// Returns an approved access object, an unapproved result, or an unavailable roster.
async function rosterAccessFor(email) {
  const key = String(email || "").trim().toLowerCase();
  const roster = await loadStaffRoster();
  if (roster.source !== "sheet") return { unavailable:true, reason:roster.reason || "Staff Access tab is unavailable." };
  if (roster.source === "sheet") {
    const entry = roster.entries[key];
    return entry ? { access:{ role:entry.role, areas:[...entry.areas] } } : { denied:true };
  }
}

async function sessionFor(event) {
  const settings = config();
  if (!settings.sessionSecret) return null;
  const session = decodeSigned(cookies(event)[SESSION_COOKIE], settings.sessionSecret);
  if (!session?.email || !session?.sub) return null;
  const rosterAccess = await rosterAccessFor(session.email);
  if (rosterAccess.unavailable) return { unavailable:true, reason:rosterAccess.reason };
  return rosterAccess.access ? { ...session, ...rosterAccess.access } : null;
}

export async function requireStaffSession(event) {
  const settings = config();
  if (!settings.sessionSecret) return { error:"Staff sign-in is not configured.", code:"STAFF_AUTH_NOT_CONFIGURED", statusCode:503 };
  const session = await sessionFor(event);
  if (session?.unavailable) return { error:STAFF_ROSTER_UNAVAILABLE_MESSAGE, code:"STAFF_ROSTER_UNAVAILABLE", statusCode:503 };
  return session || { error:"Sign in with Zoho to continue.", code:"STAFF_AUTH_REQUIRED", statusCode:401 };
}

function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function verifyIdToken(token, expectedNonce, settings) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Zoho did not return a valid identity token.");
  let header, claims;
  try {
    header = JSON.parse(fromBase64url(parts[0]));
    claims = JSON.parse(fromBase64url(parts[1]));
  } catch (_) {
    throw new Error("Zoho returned an unreadable identity token.");
  }
  if (header.alg !== "RS256" || !header.kid) throw new Error("Zoho returned an unsupported identity token.");
  const discoveryResponse = await fetch(`${settings.issuer}/.well-known/openid-configuration`);
  if (!discoveryResponse.ok) throw new Error("Could not retrieve Zoho sign-in configuration.");
  const discovery = await discoveryResponse.json();
  const keysResponse = await fetch(discovery.jwks_uri);
  if (!keysResponse.ok) throw new Error("Could not retrieve Zoho signing keys.");
  const keys = await keysResponse.json();
  const key = Array.isArray(keys.keys) && keys.keys.find(item => item.kid === header.kid && item.kty === "RSA");
  if (!key || !verifySignature("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format:"jwk" }), Buffer.from(parts[2], "base64url"))) {
    throw new Error("Zoho identity-token verification failed.");
  }
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== settings.issuer || !audiences.includes(settings.clientId) || Number(claims.exp) <= now || claims.nonce !== expectedNonce) {
    throw new Error("Zoho identity-token claims did not match this sign-in request.");
  }
  if (!claims.email_verified || !claims.email || !claims.sub) throw new Error("A verified Zoho email address is required.");
  return claims;
}

async function beginLogin(event) {
  if (!configured()) return json(503, { ok:false, error:"Zoho staff sign-in is not configured." });
  const settings = config();
  const now = Math.floor(Date.now() / 1000);
  const verifier = randomBytes(32).toString("base64url");
  const state = encodeSigned({
    purpose:"zoho_oidc", nonce:randomBytes(24).toString("base64url"), verifier,
    returnTo:safeReturnTo(event.queryStringParameters?.return_to), exp:now + STATE_SECONDS,
  }, settings.sessionSecret);
  const payload = decodeSigned(state, settings.sessionSecret);
  const query = new URLSearchParams({
    response_type:"code", client_id:settings.clientId, redirect_uri:settings.redirectUri,
    scope:"openid email profile", state, nonce:payload.nonce,
    code_challenge:pkceChallenge(verifier), code_challenge_method:"S256",
  });
  return { statusCode:302, headers:{ Location:`${settings.issuer}/oauth/v2/auth?${query}`, "Set-Cookie":cookie(STATE_COOKIE, state, STATE_SECONDS), "Cache-Control":"no-store" }, body:"" };
}

async function finishLogin(event) {
  if (!configured()) return json(503, { ok:false, error:"Zoho staff sign-in is not configured." });
  const settings = config();
  const params = event.queryStringParameters || {};
  const state = String(params.state || "");
  const savedState = cookies(event)[STATE_COOKIE];
  const payload = state && savedState === state ? decodeSigned(state, settings.sessionSecret) : null;
  if (!payload || payload.purpose !== "zoho_oidc" || !params.code) return json(400, { ok:false, error:"This Zoho sign-in link is invalid or expired." }, { "Set-Cookie":clearCookie(STATE_COOKIE) });
  const tokenResponse = await fetch(`${settings.issuer}/oauth/v2/token`, {
    method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body:new URLSearchParams({ grant_type:"authorization_code", code:String(params.code), redirect_uri:settings.redirectUri, client_id:settings.clientId, client_secret:settings.clientSecret, code_verifier:payload.verifier }),
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !token.id_token) return json(401, { ok:false, error:"Zoho did not approve this sign-in request." }, { "Set-Cookie":clearCookie(STATE_COOKIE) });
  const claims = await verifyIdToken(token.id_token, payload.nonce, settings);
  const email = String(claims.email).trim().toLowerCase();
  const rosterAccess = await rosterAccessFor(email);
  if (rosterAccess.unavailable) return json(503, { ok:false, error:"The Staff Access tab could not be read. Ask Karl to check the staff list and try again in a minute.", code:"STAFF_ROSTER_UNAVAILABLE" }, { "Set-Cookie":clearCookie(STATE_COOKIE) });
  if (!rosterAccess.access) return json(403, { ok:false, error:"Your Zoho account is not on the Hub staff list. Ask Karl to add it to the Staff Access tab in the Hub." }, { "Set-Cookie":clearCookie(STATE_COOKIE) });
  const now = Math.floor(Date.now() / 1000);
  const name = String(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || email).slice(0, 120);
  const session = encodeSigned({ sub:String(claims.sub), email, name, role:rosterAccess.access.role, areas:rosterAccess.access.areas, exp:now + SESSION_SECONDS }, settings.sessionSecret);
  return {
    statusCode:302,
    headers:{ Location:payload.returnTo, "Cache-Control":"no-store" },
    multiValueHeaders:{ "Set-Cookie":[cookie(SESSION_COOKIE, session, SESSION_SECONDS), clearCookie(STATE_COOKIE)] },
    body:"",
  };
}

export async function handler(event) {
  const action = event.queryStringParameters?.action || "session";
  if (action === "login") return beginLogin(event);
  if (action === "callback") return finishLogin(event);
  if (action === "logout") return json(200, { ok:true }, { "Set-Cookie":clearCookie(SESSION_COOKIE) });
  if (action === "session") {
    if (!configured()) return json(503, { ok:false, error:"Zoho staff sign-in is not configured.", code:"STAFF_AUTH_NOT_CONFIGURED" });
    const session = await sessionFor(event);
    if (session?.unavailable) return json(503, { ok:false, error:STAFF_ROSTER_UNAVAILABLE_MESSAGE, code:"STAFF_ROSTER_UNAVAILABLE" });
    return session ? json(200, { ok:true, user:{ email:session.email, name:session.name, role:session.role, areas:session.areas } }) : json(401, { ok:false, error:"Sign in with Zoho to continue.", code:"STAFF_AUTH_REQUIRED" });
  }
  return json(404, { ok:false, error:"Unknown authentication action." });
}
