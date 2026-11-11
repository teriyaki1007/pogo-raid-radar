/**
 * GET /nature/api/ranked/leaderboard — top 100 by rating, plus the caller's row/rank
 */

import {
  forbidOrigin,
  optionsResponse,
  requireDb,
  requireUser,
} from "../_lib.js";
import {
  corsJson,
  ensureRankedSchema,
  leaderboardPayload,
} from "./_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "GET, OPTIONS");
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  try {
    await ensureRankedSchema(env.NATURE_DB);
    const payload = await leaderboardPayload(env.NATURE_DB, auth.username);
    return corsJson(origin, payload);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Leaderboard failed", detail: msg }, 500);
  }
}
