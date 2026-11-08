/**
 * GET  /nature/api/me — current user + progress + sightings
 * PUT  /nature/api/me — upsert progress (slots, xp, streak, badges)
 */

import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireUser,
  rowToProgress,
  rowToSighting,
  readJson,
} from "./_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "GET, PUT, OPTIONS");
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  const row = await env.NATURE_DB.prepare(
    "SELECT * FROM progress WHERE username = ?"
  )
    .bind(auth.username)
    .first();
  if (!row) {
    return json({ ok: false, error: "Progress missing" }, 404, corsHeaders(origin));
  }

  const sightingRows = await env.NATURE_DB.prepare(
    "SELECT * FROM sightings WHERE username = ? ORDER BY observed_at DESC LIMIT 200"
  )
    .bind(auth.username)
    .all();

  return json(
    {
      ok: true,
      username: auth.username,
      progress: rowToProgress(row),
      sightings: (sightingRows.results || []).map(rowToSighting),
    },
    200,
    corsHeaders(origin)
  );
}

export async function onRequestPut({ request, env }) {
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

  const body = parsed.body.progress || parsed.body;
  const now = new Date().toISOString();
  const xpTotal = Math.max(0, Number(body.xpTotal) || 0);
  const streakDays = Math.max(0, Number(body.streakDays) || 0);
  const lastConfirmDay =
    body.lastConfirmDay == null ? null : String(body.lastConfirmDay).slice(0, 10);
  const badges = Array.isArray(body.badges) ? body.badges.slice(0, 64) : [];
  const slots = Array.isArray(body.slots) ? body.slots.slice(0, 64) : [];

  await env.NATURE_DB.prepare(
    `UPDATE progress SET
      xp_total = ?, streak_days = ?, last_confirm_day = ?,
      badges_json = ?, slots_json = ?, updated_at = ?
     WHERE username = ?`
  )
    .bind(
      xpTotal,
      streakDays,
      lastConfirmDay,
      JSON.stringify(badges),
      JSON.stringify(slots),
      now,
      auth.username
    )
    .run();

  const row = await env.NATURE_DB.prepare(
    "SELECT * FROM progress WHERE username = ?"
  )
    .bind(auth.username)
    .first();

  return json(
    { ok: true, username: auth.username, progress: rowToProgress(row) },
    200,
    corsHeaders(origin)
  );
}
