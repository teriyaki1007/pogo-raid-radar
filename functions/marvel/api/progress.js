/**
 * GET  /marvel/api/progress — load progress (Authorization: Bearer <token>)
 * PUT  /marvel/api/progress — upsert progress body
 * Env: MARVEL_DB, MARVEL_AUTH_SECRET (or AUTH_SECRET)
 */

import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireUser,
  rowToProgress,
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

  const row = await env.MARVEL_DB.prepare(
    "SELECT * FROM progress WHERE username = ?"
  )
    .bind(auth.username)
    .first();

  if (!row) {
    return json(
      { ok: false, error: "No progress row", username: auth.username },
      404,
      corsHeaders(origin)
    );
  }

  return json(
    { ok: true, username: auth.username, progress: rowToProgress(row) },
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

  const body = parsed.body;
  const progress = body.progress && typeof body.progress === "object" ? body.progress : body;

  const shards = Math.max(0, Math.floor(Number(progress.shards) || 0));
  const xp = Math.max(0, Math.floor(Number(progress.xp) || 0));
  const pullCount = Math.max(0, Math.floor(Number(progress.pullCount ?? progress.pull_count) || 0));

  let owned = progress.owned;
  if (typeof owned === "string") {
    try {
      owned = JSON.parse(owned);
    } catch {
      owned = {};
    }
  }
  if (!owned || typeof owned !== "object" || Array.isArray(owned)) owned = {};
  // Clamp ownership counts to non-negative ints; drop empty keys
  const ownedClean = {};
  Object.keys(owned).forEach((id) => {
    const n = Math.floor(Number(owned[id]) || 0);
    if (n > 0 && /^[a-z0-9_\-]+$/i.test(id) && id.length <= 64) {
      ownedClean[id] = Math.min(n, 9999);
    }
  });

  let battles = progress.battles;
  if (typeof battles === "string") {
    try {
      battles = JSON.parse(battles);
    } catch {
      battles = null;
    }
  }
  if (!battles || typeof battles !== "object") {
    battles = { arenaW: 0, arenaL: 0, partyW: 0, partyL: 0 };
  }
  const battlesClean = {
    arenaW: Math.max(0, Math.floor(Number(battles.arenaW) || 0)),
    arenaL: Math.max(0, Math.floor(Number(battles.arenaL) || 0)),
    partyW: Math.max(0, Math.floor(Number(battles.partyW) || 0)),
    partyL: Math.max(0, Math.floor(Number(battles.partyL) || 0)),
  };

  let lastParty =
    progress.lastPartyRewardId ?? progress.last_party_reward_id ?? null;
  if (lastParty != null) {
    lastParty = String(lastParty).slice(0, 128);
    if (!lastParty) lastParty = null;
  }

  const now = new Date().toISOString();
  const ownedJson = JSON.stringify(ownedClean);
  const battlesJson = JSON.stringify(battlesClean);

  try {
    await env.MARVEL_DB.prepare(
      `INSERT INTO progress (
        username, shards, xp, owned_json, pull_count, battles_json,
        last_party_reward_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        shards = excluded.shards,
        xp = excluded.xp,
        owned_json = excluded.owned_json,
        pull_count = excluded.pull_count,
        battles_json = excluded.battles_json,
        last_party_reward_id = excluded.last_party_reward_id,
        updated_at = excluded.updated_at`
    )
      .bind(
        auth.username,
        shards,
        xp,
        ownedJson,
        pullCount,
        battlesJson,
        lastParty,
        now,
        now
      )
      .run();
  } catch (err) {
    return json(
      {
        ok: false,
        error: "Database write failed",
        detail: String(err && err.message ? err.message : err),
      },
      500,
      corsHeaders(origin)
    );
  }

  const progressOut = {
    shards,
    xp,
    owned: ownedClean,
    pullCount,
    battles: battlesClean,
    lastPartyRewardId: lastParty,
    updatedAt: now,
  };

  return json(
    { ok: true, username: auth.username, progress: progressOut },
    200,
    corsHeaders(origin)
  );
}
