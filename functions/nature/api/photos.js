/**
 * POST /nature/api/photos — multipart field "photo" (jpeg/png/webp, ≤6MB)
 * Stores bytes as-is (client should preserve EXIF DateTime when possible).
 * Returns { ok, photoId, url }
 * Env: NATURE_DB, NATURE_PHOTOS, NATURE_AUTH_SECRET
 */

import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireBucket,
  requireUser,
  randomId,
  MAX_PHOTO_BYTES,
  ALLOWED_PHOTO_TYPES,
} from "./_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "POST, OPTIONS");
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;
  const noBucket = requireBucket(env, origin);
  if (noBucket) return noBucket;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Expected multipart form" }, 400, corsHeaders(origin));
  }

  const file = form.get("photo");
  if (!file || typeof file === "string" || !file.arrayBuffer) {
    return json({ ok: false, error: "Missing photo file field" }, 400, corsHeaders(origin));
  }

  const contentType = String(file.type || "").toLowerCase() || "application/octet-stream";
  if (!ALLOWED_PHOTO_TYPES.has(contentType)) {
    return json(
      { ok: false, error: "Photo must be jpeg, png, or webp." },
      400,
      corsHeaders(origin)
    );
  }

  const buf = await file.arrayBuffer();
  if (!buf.byteLength) {
    return json({ ok: false, error: "Empty photo" }, 400, corsHeaders(origin));
  }
  if (buf.byteLength > MAX_PHOTO_BYTES) {
    return json(
      { ok: false, error: "Photo too large (max 6 MB after encode)." },
      413,
      corsHeaders(origin)
    );
  }

  const photoId = randomId("ph");
  const ext =
    contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const r2Key = `u/${auth.username}/${photoId}.${ext}`;
  const now = new Date().toISOString();
  const width = Number(form.get("width")) || null;
  const height = Number(form.get("height")) || null;

  try {
    await env.NATURE_PHOTOS.put(r2Key, buf, {
      httpMetadata: { contentType },
      customMetadata: {
        username: auth.username,
        photoId,
      },
    });
  } catch (err) {
    return json(
      {
        ok: false,
        error: "R2 upload failed",
        detail: String(err && err.message ? err.message : err),
      },
      500,
      corsHeaders(origin)
    );
  }

  try {
    await env.NATURE_DB.prepare(
      `INSERT INTO photos (id, username, r2_key, content_type, byte_size, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        photoId,
        auth.username,
        r2Key,
        contentType,
        buf.byteLength,
        width,
        height,
        now
      )
      .run();
  } catch (err) {
    try {
      await env.NATURE_PHOTOS.delete(r2Key);
    } catch {
      /* ignore */
    }
    return json(
      {
        ok: false,
        error: "Photo metadata write failed",
        detail: String(err && err.message ? err.message : err),
      },
      500,
      corsHeaders(origin)
    );
  }

  return json(
    {
      ok: true,
      photoId,
      url: `/nature/api/photos/${photoId}`,
      byteSize: buf.byteLength,
      width,
      height,
    },
    201,
    corsHeaders(origin)
  );
}
