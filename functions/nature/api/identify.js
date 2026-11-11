/**
 * POST /nature/api/identify — create (or reuse) an Identify job for the signed-in owner.
 * Body: { id: "log-<timestamp>", photoId, observedAt, placeLabel, notes, privacy }
 *
 * GET /nature/api/identify — Species Guide lists recent jobs (NATURE_IDENTIFY_SECRET).
 * Query: ?status=pending|ready|all  (default pending)
 */
import {
  forbidOrigin,
  optionsResponse,
  requireDb,
  requireUser,
  readJson,
} from "./_lib.js";
import {
  corsJson,
  noStoreJson,
  ensureIdentifySchema,
  normalizePackageId,
  normalizePrivacy,
  requireIdentifySecret,
  jobView,
} from "./identify/_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "GET, POST, OPTIONS");
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const writer = requireIdentifySecret(request, env, origin);
  if (writer.error) return writer.error;

  const url = new URL(request.url);
  const statusFilter = String(url.searchParams.get("status") || "pending").trim().toLowerCase();
  const status = statusFilter === "all" || statusFilter === "ready" || statusFilter === "pending"
    ? statusFilter
    : "pending";

  try {
    await ensureIdentifySchema(env.NATURE_DB);
    const sql =
      status === "all"
        ? `SELECT * FROM identify_jobs ORDER BY created_at DESC LIMIT 50`
        : `SELECT * FROM identify_jobs WHERE status = ? ORDER BY created_at DESC LIMIT 50`;
    const stmt = env.NATURE_DB.prepare(sql);
    const result = status === "all" ? await stmt.all() : await stmt.bind(status).all();
    const jobs = (result.results || []).map((row) => jobView(row, { includeUsername: true }));
    return noStoreJson(origin, { ok: true, jobs });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Identify list failed", detail: msg }, 500);
  }
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
    return corsJson(origin, { ok: false, error: parsed.error }, 400);
  }

  const id = normalizePackageId(parsed.body.id || parsed.body.packageId);
  if (!id) {
    return corsJson(
      origin,
      { ok: false, error: "Job id must be a client packageId like log-<timestamp>." },
      400
    );
  }

  const photoId = String(parsed.body.photoId || parsed.body.photo_id || "").trim().slice(0, 80);
  if (!photoId) {
    return corsJson(origin, { ok: false, error: "photoId is required." }, 400);
  }

  const observedAt = String(parsed.body.observedAt || parsed.body.observed_at || "").trim().slice(0, 64) || null;
  const placeLabel = String(
    parsed.body.placeLabel ||
      parsed.body.place_label ||
      (parsed.body.place && parsed.body.place.label) ||
      ""
  ).trim().slice(0, 200) || null;
  const notes = String(parsed.body.notes || "").trim().slice(0, 1000) || null;
  const privacy = normalizePrivacy(parsed.body.privacy);
  const now = new Date().toISOString();

  try {
    await ensureIdentifySchema(env.NATURE_DB);

    const photo = await env.NATURE_DB.prepare(
      "SELECT id, username FROM photos WHERE id = ?"
    )
      .bind(photoId)
      .first();
    if (!photo || photo.username !== auth.username) {
      return corsJson(origin, { ok: false, error: "Photo not found" }, 404);
    }

    const existing = await env.NATURE_DB.prepare(
      "SELECT * FROM identify_jobs WHERE id = ?"
    )
      .bind(id)
      .first();

    if (existing) {
      if (existing.username !== auth.username) {
        return corsJson(origin, { ok: false, error: "Identify job id is already in use." }, 409);
      }
      await env.NATURE_DB.prepare(
        `UPDATE identify_jobs
         SET photo_id = ?, observed_at = ?, place_label = ?, notes = ?, privacy = ?, updated_at = ?
         WHERE id = ? AND username = ?`
      )
        .bind(photoId, observedAt, placeLabel, notes, privacy, now, id, auth.username)
        .run();
      const row = await env.NATURE_DB.prepare("SELECT * FROM identify_jobs WHERE id = ?")
        .bind(id)
        .first();
      return noStoreJson(origin, jobView(row));
    }

    await env.NATURE_DB.prepare(
      `INSERT INTO identify_jobs (
        id, username, photo_id, observed_at, place_label, notes, privacy,
        status, card_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`
    )
      .bind(id, auth.username, photoId, observedAt, placeLabel, notes, privacy, now, now)
      .run();

    const row = await env.NATURE_DB.prepare("SELECT * FROM identify_jobs WHERE id = ?")
      .bind(id)
      .first();
    return noStoreJson(origin, jobView(row), 201);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Identify job create failed", detail: msg }, 500);
  }
}
