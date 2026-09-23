/**
 * Recipe import relay — holds webhook secrets in Cloudflare Pages env.
 * POST /recipes/api/import-request
 * Body: { url?: string, caption?: string, note?: string }
 * Env: GROK_RECIPE_IMPORT_WEBHOOK_URL, GROK_RECIPE_IMPORT_WEBHOOK_KEY
 */

const ALLOWED_ORIGIN = "https://groot.zynergy.studio";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin) {
  if (origin !== ALLOWED_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    Vary: "Origin",
  };
}

function forbidOrigin(origin) {
  // Same-origin browser calls send Origin; reject anything else.
  // Allow missing Origin (non-browser / curl) for Dastan smoke tests.
  if (origin && origin !== ALLOWED_ORIGIN) {
    return json({ ok: false, error: "Forbidden origin" }, 403);
  }
  return null;
}

function authorizationHeader(key) {
  const trimmed = String(key || "").trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase().startsWith("bearer ")
    ? trimmed
    : `Bearer ${trimmed}`;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin || ALLOWED_ORIGIN),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;

  const webhookUrl = String(env.GROK_RECIPE_IMPORT_WEBHOOK_URL ?? "").trim();
  const key = String(env.GROK_RECIPE_IMPORT_WEBHOOK_KEY ?? "").trim();
  if (!webhookUrl || !key) {
    const missing = [];
    if (!webhookUrl) missing.push("GROK_RECIPE_IMPORT_WEBHOOK_URL");
    if (!key) missing.push("GROK_RECIPE_IMPORT_WEBHOOK_KEY");
    return json(
      {
        ok: false,
        error: "Relay not configured",
        missing,
        hint: "Set these as Production runtime Variables/Secrets on the Cloudflare Pages project that serves groot.zynergy.studio, then redeploy.",
      },
      503,
      corsHeaders(origin)
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400, corsHeaders(origin));
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "Expected JSON object" }, 400, corsHeaders(origin));
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const caption = typeof body.caption === "string" ? body.caption : "";
  const note = typeof body.note === "string" ? body.note : "";

  if (!url && !String(caption).trim()) {
    return json(
      { ok: false, error: "Provide url and/or caption" },
      400,
      corsHeaders(origin)
    );
  }

  const payload = {};
  if (url) payload.url = url;
  if (String(caption).trim()) payload.caption = caption;
  if (String(note).trim()) payload.note = note;

  let upstream;
  try {
    upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorizationHeader(key),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json(
      { ok: false, error: "Upstream unreachable" },
      502,
      corsHeaders(origin)
    );
  }

  if (!upstream.ok) {
    return json(
      { ok: false, error: `Upstream ${upstream.status}` },
      502,
      corsHeaders(origin)
    );
  }

  return json({ ok: true }, 202, corsHeaders(origin));
}

