// App version: 2026.09.16.21
const APP_VERSION = "2026.09.16.21";
const ALLOWED_ACTIONS = new Set(["listSkus", "submitCustomerApplication", "submitOnlineOrderRequest"]);

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
    return { statusCode:405, headers:cors, body:JSON.stringify({ ok:false, error:"Method not allowed." }) };
  }

  try {
    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    const apiKey = process.env.API_KEY || "";
    if (!appsScriptUrl) {
      return { statusCode:500, headers:cors, body:JSON.stringify({ ok:false, error:"Customer service is not configured." }) };
    }

    const body = event.httpMethod === "POST" && event.body ? JSON.parse(event.body) : {};
    const params = new URLSearchParams(event.rawQuery || "");
    const action = String(body.action || params.get("action") || "");
    if (!ALLOWED_ACTIONS.has(action)) {
      return { statusCode:403, headers:{"Content-Type":"application/json",...cors}, body:JSON.stringify({ ok:false, error:"Unsupported customer action." }) };
    }

    if (event.httpMethod === "GET") {
      if (apiKey) params.set("api_key", apiKey);
      const response = await fetch(`${appsScriptUrl}?${params.toString()}`, { method:"GET" });
      return { statusCode:200, headers:{"Content-Type":"application/json",...cors}, body:await response.text() };
    }

    if (apiKey) body.api_key = apiKey;
    const response = await fetch(appsScriptUrl, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
    });
    return { statusCode:200, headers:{"Content-Type":"application/json",...cors}, body:await response.text() };
  } catch (error) {
    return { statusCode:500, headers:{"Content-Type":"application/json",...cors}, body:JSON.stringify({ ok:false, error:"Customer request could not be processed." }) };
  }
}
