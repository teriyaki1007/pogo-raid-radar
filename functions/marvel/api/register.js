/**
 * POST /marvel/api/register
 * Body: { username, password }
 * Env: MARVEL_DB, MARVEL_AUTH_SECRET (or AUTH_SECRET)
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
  defaultProgressRow,
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

  const existing = await env.MARVEL_DB.prepare(
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
  const prog = defaultProgressRow(username, now);

  try {
    await env.MARVEL_DB.batch([
      env.MARVEL_DB.prepare(
        "INSERT INTO users (username, salt, hash, created_at) VALUES (?, ?, ?, ?)"
      ).bind(username, salt, hash, now),
      env.MARVEL_DB.prepare(
        `INSERT INTO progress (
          username, shards, xp, owned_json, pull_count, battles_json,
          last_party_reward_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        prog.username,
        prog.shards,
        prog.xp,
        prog.owned_json,
        prog.pull_count,
        prog.battles_json,
        prog.last_party_reward_id,
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
    },
    201,
    corsHeaders(origin)
  );
}
