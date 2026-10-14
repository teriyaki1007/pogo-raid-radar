/**
 * POST /marvel/api/login
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
  hashPassword,
  mintToken,
  rowToProgress,
  defaultProgressRow,
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

  const user = await env.MARVEL_DB.prepare(
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

  let row = await env.MARVEL_DB.prepare(
    "SELECT * FROM progress WHERE username = ?"
  )
    .bind(username)
    .first();

  if (!row) {
    const now = new Date().toISOString();
    const prog = defaultProgressRow(username, now);
    await env.MARVEL_DB.prepare(
      `INSERT INTO progress (
        username, shards, xp, owned_json, pull_count, battles_json,
        last_party_reward_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        prog.username,
        prog.shards,
        prog.xp,
        prog.owned_json,
        prog.pull_count,
        prog.battles_json,
        prog.last_party_reward_id,
        prog.created_at,
        prog.updated_at
      )
      .run();
    row = prog;
  }

  const token = await mintToken(username, env);
  return json(
    {
      ok: true,
      username,
      token,
      progress: rowToProgress(row),
    },
    200,
    corsHeaders(origin)
  );
}
