/**
 * POST /nature/api/ranked/matches/:id/result  { outcome: "win"|"loss"|"forfeit" }
 * First valid report stands and applies Elo once. Identical replay is
 * idempotent. A conflicting second report is 409.
 */

import {
  forbidOrigin,
  optionsResponse,
  requireDb,
  requireUser,
  readJson,
} from "../../../_lib.js";
import {
  applyElo,
  corsJson,
  ensureRankedSchema,
  impliedWinner,
  isParticipant,
  loadMatch,
} from "../../_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "POST, OPTIONS");
}

function resultPayload(match, username, settledOutcome) {
  const youAreA = match.player_a === username;
  const yourStart = youAreA ? Number(match.rating_a) : Number(match.rating_b);
  const oppStart = youAreA ? Number(match.rating_b) : Number(match.rating_a);
  const opponent = youAreA ? match.player_b : match.player_a;
  const forfeit = match.status === "forfeit" || settledOutcome === "forfeit";
  let yourOutcome = settledOutcome;
  if (!yourOutcome) {
    if (forfeit) yourOutcome = "forfeit";
    else if (match.winner === username) yourOutcome = "win";
    else if (match.winner) yourOutcome = "loss";
  }
  const yours = applyElo(yourStart, yourOutcome === "forfeit" ? "forfeit" : yourOutcome);
  const oppOutcome =
    yourOutcome === "forfeit" ? "forfeit" : yourOutcome === "win" ? "loss" : "win";
  const opp = applyElo(oppStart, oppOutcome);
  return {
    ok: true,
    outcome: yourOutcome,
    winner: match.winner || null,
    eloApplied: !!match.elo_applied,
    rating: yours.rating,
    ratingDelta: yours.delta,
    opponent,
    opponentRating: opp.rating,
    opponentDelta: opp.delta,
    you: { username, rating: yours.rating, delta: yours.delta },
    opponentStats: { username: opponent, rating: opp.rating, delta: opp.delta },
  };
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
  const outcome = String(parsed.body.outcome || "").trim().toLowerCase();
  if (outcome !== "win" && outcome !== "loss" && outcome !== "forfeit") {
    return corsJson(origin, { ok: false, error: "Outcome must be win, loss, or forfeit." }, 400);
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

    if (row.elo_applied || row.status === "completed" || row.status === "forfeit") {
      const settledForfeit = row.status === "forfeit" || !row.winner;
      const expectedWinner = impliedWinner(row, auth.username, outcome);
      if (outcome === "forfeit") {
        if (settledForfeit) {
          return corsJson(origin, resultPayload(row, auth.username, "forfeit"));
        }
        return corsJson(origin, { ok: false, error: "Conflicting result", winner: row.winner }, 409);
      }
      if (settledForfeit) {
        return corsJson(origin, { ok: false, error: "Conflicting result", winner: row.winner }, 409);
      }
      if (expectedWinner !== row.winner) {
        return corsJson(origin, { ok: false, error: "Conflicting result", winner: row.winner }, 409);
      }
      return corsJson(origin, resultPayload(row, auth.username, outcome));
    }

    const winner = impliedWinner(row, auth.username, outcome);
    const now = new Date().toISOString();
    const nextStatus = outcome === "forfeit" ? "forfeit" : "completed";

    // Claim the result once. If another request wins the race, re-read and reconcile.
    const claimed = await db
      .prepare(
        `UPDATE ranked_matches
         SET status = ?, winner = ?, elo_applied = 1, updated_at = ?
         WHERE id = ? AND elo_applied = 0`
      )
      .bind(nextStatus, winner, now, matchId)
      .run();
    const changes = Number(claimed && claimed.meta && claimed.meta.changes) || 0;
    if (changes !== 1) {
      const fresh = await loadMatch(db, matchId);
      if (!fresh) {
        return corsJson(origin, { ok: false, error: "Match not found" }, 404);
      }
      const settledForfeit = fresh.status === "forfeit" || !fresh.winner;
      const expectedWinner = impliedWinner(fresh, auth.username, outcome);
      if (outcome === "forfeit") {
        if (settledForfeit) return corsJson(origin, resultPayload(fresh, auth.username, "forfeit"));
        return corsJson(origin, { ok: false, error: "Conflicting result", winner: fresh.winner }, 409);
      }
      if (settledForfeit || expectedWinner !== fresh.winner) {
        return corsJson(origin, { ok: false, error: "Conflicting result", winner: fresh.winner }, 409);
      }
      return corsJson(origin, resultPayload(fresh, auth.username, outcome));
    }

    if (outcome !== "forfeit") {
      const aOutcome = winner === row.player_a ? "win" : "loss";
      const bOutcome = winner === row.player_b ? "win" : "loss";
      const aNext = applyElo(row.rating_a, aOutcome);
      const bNext = applyElo(row.rating_b, bOutcome);
      await db.batch([
        db
          .prepare(
            `UPDATE ranked_ratings
             SET rating = ?, wins = wins + ?, losses = losses + ?, updated_at = ?
             WHERE username = ?`
          )
          .bind(aNext.rating, aOutcome === "win" ? 1 : 0, aOutcome === "loss" ? 1 : 0, now, row.player_a),
        db
          .prepare(
            `UPDATE ranked_ratings
             SET rating = ?, wins = wins + ?, losses = losses + ?, updated_at = ?
             WHERE username = ?`
          )
          .bind(bNext.rating, bOutcome === "win" ? 1 : 0, bOutcome === "loss" ? 1 : 0, now, row.player_b),
      ]);
    }

    await db.prepare("DELETE FROM ranked_queue WHERE match_id = ?").bind(matchId).run();

    const fresh = await loadMatch(db, matchId);
    return corsJson(origin, resultPayload(fresh || row, auth.username, outcome));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Result failed", detail: msg }, 500);
  }
}
