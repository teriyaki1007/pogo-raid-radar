/**
 * GET /nature/api/ranked/me — current user's Elo, rank, and record
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
  ensureRating,
  publicRating,
  ratingRank,
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
    const row = await ensureRating(env.NATURE_DB, auth.username);
    const rank = await ratingRank(env.NATURE_DB, row.username, row.rating);
    return corsJson(origin, { ok: true, ...publicRating(row, rank) });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Ranked lookup failed", detail: msg }, 500);
  }
}
