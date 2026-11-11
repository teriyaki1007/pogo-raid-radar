/**
 * POST   /nature/api/ranked/queue  { habitat } — join worldwide queue
 * GET    /nature/api/ranked/queue            — poll search / match status
 * DELETE /nature/api/ranked/queue            — cancel if still searching
 */

import {
  forbidOrigin,
  optionsResponse,
  requireDb,
  requireUser,
  readJson,
} from "../_lib.js";
import {
  corsJson,
  ensureRankedSchema,
  ensureRating,
  normalizeHabitat,
  openMatchForUser,
  pruneStaleQueue,
  tryMatch,
  matchView,
  loadMatch,
} from "./_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "GET, POST, DELETE, OPTIONS");
}

function searchingPayload(row, rating) {
  return {
    ok: true,
    status: "searching",
    rating: rating ?? (row && row.rating) ?? null,
    habitat: row && row.habitat ? row.habitat : null,
  };
}

async function currentQueueView(db, username) {
  const open = await openMatchForUser(db, username);
  if (open) return matchView(open, username);

  const q = await db
    .prepare("SELECT username, rating, habitat, enqueued_at, match_id FROM ranked_queue WHERE username = ?")
    .bind(username)
    .first();
  if (!q) return { ok: true, status: "idle" };
  if (q.match_id) {
    const match = await loadMatch(db, q.match_id);
    if (match) return matchView(match, username);
  }
  return searchingPayload(q);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  const parsed = await readJson(request);
  if (parsed.error) {
    return corsJson(origin, { ok: false, error: parsed.error }, 400);
  }
  const habitat = normalizeHabitat(parsed.body.habitat);
  if (!habitat) {
    return corsJson(origin, { ok: false, error: "Valid habitat required." }, 400);
  }

  try {
    const db = env.NATURE_DB;
    await ensureRankedSchema(db);
    const now = new Date().toISOString();
    const ratingRow = await ensureRating(db, auth.username, now);
    await pruneStaleQueue(db, now);

    const existing = await openMatchForUser(db, auth.username);
    if (existing) {
      return corsJson(origin, matchView(existing, auth.username));
    }

    await db
      .prepare(
        `INSERT INTO ranked_queue (username, rating, habitat, enqueued_at, match_id)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(username) DO UPDATE SET
           rating = excluded.rating,
           habitat = excluded.habitat,
           enqueued_at = excluded.enqueued_at,
           match_id = CASE
             WHEN ranked_queue.match_id IS NULL THEN NULL
             ELSE ranked_queue.match_id
           END`
      )
      .bind(auth.username, Number(ratingRow.rating), habitat, now)
      .run();

    const matched = await tryMatch(db, auth.username, now);
    if (matched) return corsJson(origin, matchView(matched, auth.username));
    return corsJson(origin, searchingPayload({ habitat }, ratingRow.rating));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Queue failed", detail: msg }, 500);
  }
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
    const db = env.NATURE_DB;
    await ensureRankedSchema(db);
    return corsJson(origin, await currentQueueView(db, auth.username));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Queue status failed", detail: msg }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  try {
    const db = env.NATURE_DB;
    await ensureRankedSchema(db);

    const q = await db
      .prepare("SELECT username, match_id FROM ranked_queue WHERE username = ?")
      .bind(auth.username)
      .first();
    if (q && q.match_id) {
      const match = await loadMatch(db, q.match_id);
      if (match && match.status !== "completed" && match.status !== "forfeit") {
        return corsJson(
          origin,
          { ok: false, error: "Match already found", ...matchView(match, auth.username) },
          409
        );
      }
    }

    await db.prepare("DELETE FROM ranked_queue WHERE username = ? AND match_id IS NULL").bind(auth.username).run();
    if (q && q.match_id) {
      await db.prepare("DELETE FROM ranked_queue WHERE username = ?").bind(auth.username).run();
    }
    return corsJson(origin, { ok: true, status: "cancelled" });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Cancel failed", detail: msg }, 500);
  }
}
