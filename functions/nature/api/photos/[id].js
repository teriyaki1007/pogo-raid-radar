/**
 * GET /nature/api/photos/:id — auth-gated private photo bytes
 */

import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireBucket,
  requireUser,
} from "../_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "GET, OPTIONS");
}

export async function onRequestGet({ request, env, params }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;
  const noBucket = requireBucket(env, origin);
  if (noBucket) return noBucket;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  const photoId = String(params.id || "").trim();
  if (!photoId) {
    return json({ ok: false, error: "Missing photo id" }, 400, corsHeaders(origin));
  }

  const row = await env.NATURE_DB.prepare(
    "SELECT id, username, r2_key, content_type FROM photos WHERE id = ?"
  )
    .bind(photoId)
    .first();

  if (!row || row.username !== auth.username) {
    return json({ ok: false, error: "Photo not found" }, 404, corsHeaders(origin));
  }

  const obj = await env.NATURE_PHOTOS.get(row.r2_key);
  if (!obj) {
    return json({ ok: false, error: "Photo blob missing" }, 404, corsHeaders(origin));
  }

  const headers = {
    "Content-Type": row.content_type || obj.httpMetadata?.contentType || "image/jpeg",
    "Cache-Control": "private, max-age=3600",
    ...corsHeaders(origin),
  };
  return new Response(obj.body, { status: 200, headers });
}
