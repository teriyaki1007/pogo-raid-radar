/**
 * GET /nature/api/ranked/matches/:id — match status + parties once both are ready
 */

import {
  forbidOrigin,
  optionsResponse,
  requireDb,
  requireUser,
} from "../../_lib.js";
import {
  corsJson,
  ensureRankedSchema,
  isParticipant,
  loadMatch,
  matchView,
} from "../_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "GET, OPTIONS");
}

export async function onRequestGet({ request, env, params }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  const matchId = String((params && params.id) || "").trim();
  if (!matchId) {
    return corsJson(origin, { ok: false, error: "Missing match id" }, 400);
  }

  try {
    await ensureRankedSchema(env.NATURE_DB);
    const row = await loadMatch(env.NATURE_DB, matchId);
    if (!row) {
      return corsJson(origin, { ok: false, error: "Match not found" }, 404);
    }
    if (!isParticipant(row, auth.username)) {
      return corsJson(origin, { ok: false, error: "Forbidden" }, 403);
    }
    return corsJson(origin, matchView(row, auth.username));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Match lookup failed", detail: msg }, 500);
  }
}
