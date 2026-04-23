export async function handler(event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  try {
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const API_KEY = process.env.API_KEY || "";

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

      const resp = await fetch(url, { method: "GET" });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...cors },
        body: await resp.text(),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    if (API_KEY) body.api_key = API_KEY;

    const resp = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...cors },
      body: await resp.text(),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
}
