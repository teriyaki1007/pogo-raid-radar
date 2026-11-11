/**
 * POST /nature/api/ranked/matches/:id/party  { party: [3 fighters] }
 */

import {
  forbidOrigin,
  optionsResponse,
  requireDb,
  requireUser,
  readJson,
} from "../../../_lib.js";
import {
  corsJson,
  ensureRankedSchema,
  isParticipant,
  loadMatch,
  matchView,
  sanitizeParty,
} from "../../_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "POST, OPTIONS");
}

export async function onRequestPost({ request, env, params }) {
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

  const parsed = await readJson(request);
  if (parsed.error) {
    return corsJson(origin, { ok: false, error: parsed.error }, 400);
  }

  const sanitized = sanitizeParty(parsed.body.party);
  if (sanitized.error) {
    return corsJson(origin, { ok: false, error: sanitized.error }, 400);
  }

  try {
    const db = env.NATURE_DB;
    await ensureRankedSchema(db);
    const row = await loadMatch(db, matchId);
    if (!row) {
      return corsJson(origin, { ok: false, error: "Match not found" }, 404);
    }
    if (!isParticipant(row, auth.username)) {
      return corsJson(origin, { ok: false, error: "Forbidden" }, 403);
    }
    if (row.status === "completed" || row.status === "forfeit") {
      return corsJson(origin, { ok: false, error: "Match already finished", ...matchView(row, auth.username) }, 409);
    }

    const youAreA = row.player_a === auth.username;
    const yourCol = youAreA ? "party_a_json" : "party_b_json";
    const otherCol = youAreA ? "party_b_json" : "party_a_json";
    const alreadyReady = !!(row.party_a_json && row.party_b_json);
    if (alreadyReady || row.status === "ready") {
      return corsJson(origin, matchView(row, auth.username));
    }

    const partyJson = JSON.stringify(sanitized.party);
    const otherPresent = youAreA ? row.party_b_json : row.party_a_json;
    const now = new Date().toISOString();
    const nextStatus = otherPresent ? "ready" : "awaiting_parties";

    await db
      .prepare(
        `UPDATE ranked_matches
         SET ${yourCol} = ?, status = ?, updated_at = ?
         WHERE id = ? AND (${otherCol} IS NOT NULL OR status != 'ready')`
      )
      .bind(partyJson, nextStatus, now, matchId)
      .run();

    const fresh = await loadMatch(db, matchId);
    return corsJson(origin, matchView(fresh, auth.username));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Party submit failed", detail: msg }, 500);
  }
}
