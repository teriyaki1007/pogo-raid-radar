/**
 * GET  /nature/api/sightings — list current user's sightings
 * POST /nature/api/sightings — create sighting (after photo upload)
 */

import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireUser,
  randomId,
  rowToSighting,
  readJson,
} from "./_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "GET, POST, OPTIONS");
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  const rows = await env.NATURE_DB.prepare(
    "SELECT * FROM sightings WHERE username = ? ORDER BY observed_at DESC LIMIT 200"
  )
    .bind(auth.username)
    .all();

  return json(
    { ok: true, sightings: (rows.results || []).map(rowToSighting) },
    200,
    corsHeaders(origin)
  );
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  const parsed = await readJson(request);
  if (parsed.error) {
    return json({ ok: false, error: parsed.error }, 400, corsHeaders(origin));
  }
  const body = parsed.body;
  const now = new Date().toISOString();
  const id = String(body.id || randomId("sight")).slice(0, 64);
  const photoId = body.photoId ? String(body.photoId).slice(0, 64) : null;

  if (photoId) {
    const photo = await env.NATURE_DB.prepare(
      "SELECT id FROM photos WHERE id = ? AND username = ?"
    )
      .bind(photoId, auth.username)
      .first();
    if (!photo) {
      return json({ ok: false, error: "photoId not found for user" }, 400, corsHeaders(origin));
    }
  }

  const place = body.place || {};
  const privacy = body.privacy === "shared" ? "shared" : "private";
  const tags = Array.isArray(body.tags) ? body.tags.slice(0, 32) : [];
  const lookalikes = Array.isArray(body.lookalikeRefs)
    ? body.lookalikeRefs.slice(0, 32)
    : Array.isArray(body.lookalikes)
      ? body.lookalikes.slice(0, 32)
      : [];
  const meta = body.sampleMeta || body.meta || null;

  try {
    await env.NATURE_DB.prepare(
      `INSERT INTO sightings (
        id, username, photo_id, place_label, place_lat, place_lng, place_precision,
        observed_at, notes, tags_json, id_confidence, taxon_id, lookalike_json,
        privacy, status, xp_awarded, meta_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        auth.username,
        photoId,
        String(place.label || body.placeLabel || "").slice(0, 200),
        place.lat ?? null,
        place.lng ?? null,
        String(place.precision || "label-only").slice(0, 32),
        String(body.observedAt || now),
        body.notes == null ? null : String(body.notes).slice(0, 2000),
        JSON.stringify(tags),
        body.idConfidence ? String(body.idConfidence).slice(0, 32) : null,
        body.speciesRef || body.taxonId
          ? String(body.speciesRef || body.taxonId).slice(0, 64)
          : null,
        JSON.stringify(lookalikes),
        privacy,
        body.status ? String(body.status).slice(0, 32) : null,
        Math.max(0, Number(body.xpAwarded) || 0),
        meta ? JSON.stringify(meta).slice(0, 8000) : null,
        now,
        now
      )
      .run();
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/UNIQUE|constraint/i.test(msg)) {
      return json({ ok: false, error: "Sighting id already exists" }, 409, corsHeaders(origin));
    }
    return json({ ok: false, error: "Sighting write failed", detail: msg }, 500, corsHeaders(origin));
  }

  const row = await env.NATURE_DB.prepare("SELECT * FROM sightings WHERE id = ?")
    .bind(id)
    .first();

  return json({ ok: true, sighting: rowToSighting(row) }, 201, corsHeaders(origin));
}
