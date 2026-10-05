// App version: 2026.10.05.4-WEB
const APP_VERSION = "2026.10.05.4-WEB";
const ALLOWED_ACTIONS = new Set(["listSkus", "submitCustomerApplication", "submitOnlineOrderRequest"]);
const CATALOG_RETRY_DELAY_MS = 1500;

function customerResponse(statusCode, cors, body) {
  return { statusCode, headers:{ "Content-Type":"application/json", ...cors }, body:JSON.stringify(body) };
}

async function readUpstreamJson_(response, action) {
  const text = await response.text();
  try {
    return { ok:response.ok, text, json:JSON.parse(text) };
  } catch (_) {
    if (action === "listSkus") console.warn("Customer catalog upstream response was not JSON", { status:response.status, preview:text.slice(0, 200) });
    return { ok:response.ok, text, json:null };
  }
}

function catalogUnavailable_(cors) {
  return customerResponse(502, cors, { ok:false, retryable:true, error:"The order catalog is temporarily unavailable." });
}

function waitForCatalogRetry_() {
  return new Promise(resolve => setTimeout(resolve, CATALOG_RETRY_DELAY_MS));
}

export async function handler(event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "X-App-Version": APP_VERSION,
  };

  if (event.httpMethod === "OPTIONS") return { statusCode:204, headers:cors, body:"" };
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return customerResponse(405, cors, { ok:false, error:"Method not allowed." });
  }

  try {
    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const apiKey = process.env.API_KEY || "";
    if (!appsScriptUrl) {
      return customerResponse(500, cors, { ok:false, error:"Customer service is not configured." });
    }

    if (event.body && event.body.length > 150000) {
      return customerResponse(413, cors, { ok:false, error:"Request is too large." });
    }
    const body = event.httpMethod === "POST" && event.body ? JSON.parse(event.body) : {};
    const params = new URLSearchParams(event.rawQuery || "");
    const action = String(body.action || params.get("action") || "");
    if (!ALLOWED_ACTIONS.has(action)) {
      return customerResponse(403, cors, { ok:false, error:"Unsupported customer action." });
    }

    const request = event.httpMethod === "GET" ? (() => {
      if (apiKey) params.set("api_key", apiKey);
      return { url:`${appsScriptUrl}?${params.toString()}`, options:{ method:"GET" } };
    })() : (() => {
      if (apiKey) body.api_key = apiKey;
      return { url:appsScriptUrl, options:{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) } };
    })();
    const attempts = action === "listSkus" ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const upstream = await fetch(request.url, request.options);
      const parsed = await readUpstreamJson_(upstream, action);
      if (parsed.ok && parsed.json) return { statusCode:200, headers:{"Content-Type":"application/json",...cors}, body:parsed.text };
      if (action !== "listSkus") {
        if (parsed.json) return { statusCode:upstream.status || 502, headers:{"Content-Type":"application/json",...cors}, body:parsed.text };
        return customerResponse(502, cors, { ok:false, error:"Customer request could not be processed." });
      }
      if (attempt < attempts) await waitForCatalogRetry_();
    }
    return catalogUnavailable_(cors);
  } catch (error) {
    return customerResponse(500, cors, { ok:false, error:"Customer request could not be processed." });
  }
}
