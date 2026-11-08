/**
 * POST /nature/api/register
 * Body: { username, password }
 * Env: NATURE_DB, NATURE_AUTH_SECRET
 */

import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireSecret,
  normalizeUser,
  randomSaltHex,
  hashPassword,
  mintToken,
  defaultProgress,
  rowToProgress,
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
  if (username.length < 3) {
    return json(
      { ok: false, error: "Username needs at least 3 letters/numbers." },
      400,
      corsHeaders(origin)
    );
  }
  if (password.length < 4) {
    return json(
      { ok: false, error: "Password needs at least 4 characters." },
      400,
      corsHeaders(origin)
    );
  }

  const existing = await env.NATURE_DB.prepare(
    "SELECT username FROM users WHERE username = ?"
  )
    .bind(username)
    .first();
  if (existing) {
    return json({ ok: false, error: "That username is taken." }, 409, corsHeaders(origin));
  }

  const now = new Date().toISOString();
  const salt = randomSaltHex(16);
  const hash = await hashPassword(password, salt);
  const prog = defaultProgress(username, now);

  try {
    await env.NATURE_DB.batch([
      env.NATURE_DB.prepare(
        "INSERT INTO users (username, salt, hash, created_at) VALUES (?, ?, ?, ?)"
      ).bind(username, salt, hash, now),
      env.NATURE_DB.prepare(
        `INSERT INTO progress (
          username, xp_total, streak_days, last_confirm_day, badges_json, slots_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        prog.username,
        prog.xp_total,
        prog.streak_days,
        prog.last_confirm_day,
        prog.badges_json,
        prog.slots_json,
        prog.created_at,
        prog.updated_at
      ),
    ]);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/UNIQUE|constraint/i.test(msg)) {
      return json({ ok: false, error: "That username is taken." }, 409, corsHeaders(origin));
    }
    return json(
      { ok: false, error: "Database write failed", detail: msg },
      500,
      corsHeaders(origin)
    );
  }

  const token = await mintToken(username, env);
  return json(
    {
      ok: true,
      username,
      token,
      progress: rowToProgress(prog),
      sightings: [],
    },
    201,
    corsHeaders(origin)
  );
}
