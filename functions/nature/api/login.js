/**
 * POST /nature/api/login
 * Body: { username, password }
 */

import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireSecret,
  normalizeUser,
  hashPassword,
  mintToken,
  defaultProgress,
  rowToProgress,
  rowToSighting,
  readJson,
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
  const noSecret = requireSecret(env, origin);
  if (noSecret) return noSecret;

  const parsed = await readJson(request);
  if (parsed.error) {
    return json({ ok: false, error: parsed.error }, 400, corsHeaders(origin));
  }

  const username = normalizeUser(parsed.body.username);
  const password = String(parsed.body.password || "");
  if (!username || !password) {
    return json(
      { ok: false, error: "Username and password required." },
      400,
      corsHeaders(origin)
    );
  }

  const user = await env.NATURE_DB.prepare(
    "SELECT username, salt, hash FROM users WHERE username = ?"
  )
    .bind(username)
    .first();
  if (!user) {
    return json({ ok: false, error: "Unknown username." }, 401, corsHeaders(origin));
  }

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.hash) {
    return json({ ok: false, error: "Wrong password." }, 401, corsHeaders(origin));
  }

  let row = await env.NATURE_DB.prepare(
    "SELECT * FROM progress WHERE username = ?"
  )
    .bind(username)
    .first();

  if (!row) {
    const now = new Date().toISOString();
    const prog = defaultProgress(username, now);
    await env.NATURE_DB.prepare(
      `INSERT INTO progress (
        username, xp_total, streak_days, last_confirm_day, badges_json, slots_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        prog.username,
        prog.xp_total,
        prog.streak_days,
        prog.last_confirm_day,
        prog.badges_json,
        prog.slots_json,
        prog.created_at,
        prog.updated_at
      )
      .run();
    row = prog;
  }

  const sightingRows = await env.NATURE_DB.prepare(
    "SELECT * FROM sightings WHERE username = ? ORDER BY observed_at DESC LIMIT 200"
  )
    .bind(username)
    .all();

  const token = await mintToken(username, env);
  return json(
    {
      ok: true,
      username,
      token,
      progress: rowToProgress(row),
      sightings: (sightingRows.results || []).map(rowToSighting),
    },
    200,
    corsHeaders(origin)
  );
}
