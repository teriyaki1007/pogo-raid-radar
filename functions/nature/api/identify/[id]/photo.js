/**
 * GET /nature/api/identify/:id/photo — sighting photo bytes for the owner or Guide secret.
 * Does not leak other users' photos (404).
 */
import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireBucket,
  requireUser,
} from "../../_lib.js";
import {
  noStoreJson,
  ensureIdentifySchema,
  normalizePackageId,
  hasIdentifySecret,
  loadJob,
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

  const id = normalizePackageId(params.id);
  if (!id) {
    return noStoreJson(origin, { ok: false, error: "Invalid identify job id" }, 400);
  }

  try {
    await ensureIdentifySchema(env.NATURE_DB);
    const job = await loadJob(env.NATURE_DB, id);
    const asGuide = hasIdentifySecret(request, env);
    if (!asGuide) {
      const auth = await requireUser(request, env, origin);
      if (auth.error) return auth.error;
      if (!job || job.username !== auth.username) {
        return noStoreJson(origin, { ok: false, error: "Photo not found" }, 404);
      }
    } else if (!job) {
      return noStoreJson(origin, { ok: false, error: "Photo not found" }, 404);
    }

    if (!job.photo_id) {
      return noStoreJson(origin, { ok: false, error: "Photo not found" }, 404);
    }

    const row = await env.NATURE_DB.prepare(
      "SELECT id, username, r2_key, content_type FROM photos WHERE id = ?"
    )
      .bind(job.photo_id)
      .first();

    if (!row || row.username !== job.username) {
      return noStoreJson(origin, { ok: false, error: "Photo not found" }, 404);
    }

    const obj = await env.NATURE_PHOTOS.get(row.r2_key);
    if (!obj) {
      return noStoreJson(origin, { ok: false, error: "Photo blob missing" }, 404);
    }

    const headers = {
      "Content-Type": row.content_type || obj.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "private, no-store",
      ...corsHeaders(origin),
    };
    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return json(
      { ok: false, error: "Identify photo lookup failed", detail: msg },
      500,
      corsHeaders(origin)
    );
  }
}
