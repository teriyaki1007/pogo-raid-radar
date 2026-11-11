/**
 * Shared helpers for Nature Ranked API (D1 NATURE_DB).
 * Auto-migrates ranked_* tables on first request.
 */

import {
  corsHeaders,
  json,
  randomId,
} from "../_lib.js";

export const ELO_START = 1000;
export const ELO_FLOOR = 100;
export const ELO_WIN_DELTA = 18;
export const ELO_LOSS_DELTA = -14;
export const ELO_RANGE = 100;
export const QUEUE_STALE_MS = 10 * 60 * 1000;
export const LEADERBOARD_LIMIT = 100;

export const HABITATS = new Set([
  "tree",
  "ocean",
  "grassland",
  "wetland",
  "urban",
  "mountain",
]);

const NON_ANIMAL = new Set([
  "plant",
  "plants",
  "plantae",
  "flora",
  "fungus",
  "fungi",
  "fungal",
  "mushroom",
  "mushrooms",
  "lichen",
  "algae",
  "bacteria",
  "mineral",
  "minerals",
  "rock",
  "other",
  "unknown",
]);

let schemaReady = false;

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS ranked_ratings (
    username TEXT PRIMARY KEY REFERENCES users(username),
    rating INTEGER NOT NULL DEFAULT 1000,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ranked_queue (
    username TEXT PRIMARY KEY REFERENCES users(username),
    rating INTEGER NOT NULL,
    habitat TEXT NOT NULL,
    enqueued_at TEXT NOT NULL,
    match_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ranked_matches (
    id TEXT PRIMARY KEY,
    player_a TEXT NOT NULL,
    player_b TEXT NOT NULL,
    rating_a INTEGER NOT NULL,
    rating_b INTEGER NOT NULL,
    habitat TEXT NOT NULL,
    party_a_json TEXT,
    party_b_json TEXT,
    status TEXT NOT NULL,
    winner TEXT,
    elo_applied INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ranked_ratings_board ON ranked_ratings(rating DESC, username)`,
  `CREATE INDEX IF NOT EXISTS idx_ranked_queue_open ON ranked_queue(match_id, rating)`,
];

export async function ensureRankedSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA_SQL.map((sql) => db.prepare(sql)));
  schemaReady = true;
}

export async function ensureRating(db, username, now = new Date().toISOString()) {
  await db
    .prepare(
      `INSERT INTO ranked_ratings (username, rating, wins, losses, updated_at)
       VALUES (?, ?, 0, 0, ?)
       ON CONFLICT(username) DO NOTHING`
    )
    .bind(username, ELO_START, now)
    .run();
  return db
    .prepare("SELECT username, rating, wins, losses, updated_at FROM ranked_ratings WHERE username = ?")
    .bind(username)
    .first();
}

export async function ratingRank(db, username, rating) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM ranked_ratings
       WHERE rating > ?
          OR (rating = ? AND username < ?)`
    )
    .bind(rating, rating, username)
    .first();
  return Number(row && row.n ? row.n : 0) + 1;
}

export function publicRating(row, rank) {
  return {
    username: row.username,
    rating: Number(row.rating) || ELO_START,
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    rank: rank ?? null,
    region: "—",
  };
}

export async function leaderboardPayload(db, username) {
  const youRow = await ensureRating(db, username);
  const youRank = await ratingRank(db, youRow.username, youRow.rating);
  const board = await db
    .prepare(
      `SELECT username, rating, wins, losses
       FROM ranked_ratings
       ORDER BY rating DESC, username ASC
       LIMIT ?`
    )
    .bind(LEADERBOARD_LIMIT)
    .all();
  const entries = (board.results || []).map((row, i) =>
    publicRating(row, i + 1)
  );
  return {
    ok: true,
    you: publicRating(youRow, youRank),
    entries,
  };
}

export function normalizeHabitat(raw) {
  const id = String(raw || "")
    .trim()
    .toLowerCase();
  return HABITATS.has(id) ? id : "";
}

function categoryValue(fighter) {
  const raw =
    fighter.kind ||
    fighter.kingdom ||
    fighter.category ||
    fighter.taxonKingdom ||
    "";
  return String(raw)
    .trim()
    .toLowerCase();
}

function isClearlyNonAnimal(fighter) {
  const cat = categoryValue(fighter);
  if (!cat) return false;
  if (cat === "animal" || cat === "animals" || cat === "animalia") return false;
  return NON_ANIMAL.has(cat);
}

export function sanitizeParty(raw) {
  if (!Array.isArray(raw) || raw.length !== 3) {
    return { error: "Party must be exactly 3 fighters." };
  }
  const party = [];
  for (const f of raw) {
    if (!f || typeof f !== "object" || Array.isArray(f)) {
      return { error: "Each fighter must be an object." };
    }
    if (isClearlyNonAnimal(f)) {
      return { error: "Ranked parties are animals only." };
    }
    const id = String(f.id || "").trim().slice(0, 80);
    const commonName = String(f.commonName || f.name || "").trim().slice(0, 80);
    if (!id || !commonName) {
      return { error: "Each fighter needs an id and commonName." };
    }
    const types = Array.isArray(f.types)
      ? f.types.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 4)
      : [];
    if (!types.length) {
      return { error: "Each fighter needs at least one type." };
    }
    const moves = Array.isArray(f.moves)
      ? f.moves
          .map((m) => (typeof m === "string" ? m.trim().slice(0, 64) : String(m && m.id ? m.id : "").trim().slice(0, 64)))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const level = Math.max(1, Math.min(50, Math.round(Number(f.level) || 1)));
    const habitatAffinity = Array.isArray(f.habitatAffinity)
      ? f.habitatAffinity
          .map((h) => String(h || "").trim().toLowerCase())
          .filter((h) => HABITATS.has(h))
          .slice(0, 3)
      : [];
    const rarity = String(f.rarity || "common").trim().slice(0, 24) || "common";
    let photo = null;
    const photoRaw = f.photo || f.photoRef || null;
    if (typeof photoRaw === "string" && photoRaw && !/^data:/i.test(photoRaw)) {
      photo = photoRaw.slice(0, 400);
    }
    const emoji = typeof f.emoji === "string" ? f.emoji.slice(0, 16) : undefined;
    const bp = Number(f.bp);
    party.push({
      id,
      commonName,
      types,
      moves,
      level,
      habitatAffinity,
      rarity,
      ...(photo ? { photo, photoRef: photo } : {}),
      ...(emoji ? { emoji } : {}),
      ...(Number.isFinite(bp) && bp > 0 ? { bp } : {}),
      kind: "animal",
    });
  }
  return { party };
}

export function parsePartyJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export function matchView(row, username) {
  const youAreA = row.player_a === username;
  const opponent = youAreA ? row.player_b : row.player_a;
  const opponentRating = youAreA ? Number(row.rating_b) : Number(row.rating_a);
  const yourParty = parsePartyJson(youAreA ? row.party_a_json : row.party_b_json);
  const opponentParty = parsePartyJson(youAreA ? row.party_b_json : row.party_a_json);
  const bothReady = !!(yourParty && opponentParty);
  return {
    ok: true,
    status: row.status === "completed" || row.status === "forfeit" ? row.status : bothReady ? "ready" : row.status === "ready" ? "ready" : yourParty ? "waiting" : "matched",
    matchId: row.id,
    opponent,
    opponentRating,
    habitat: row.habitat,
    yourParty,
    opponentParty: bothReady ? opponentParty : null,
    winner: row.winner || null,
    eloApplied: !!row.elo_applied,
  };
}

export function isParticipant(row, username) {
  return row && (row.player_a === username || row.player_b === username);
}

export async function loadMatch(db, matchId) {
  return db.prepare("SELECT * FROM ranked_matches WHERE id = ?").bind(matchId).first();
}

export async function openMatchForUser(db, username) {
  return db
    .prepare(
      `SELECT * FROM ranked_matches
       WHERE (player_a = ? OR player_b = ?)
         AND status != 'completed'
         AND status != 'forfeit'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(username, username)
    .first();
}

export function staleCutoffIso(nowMs = Date.now()) {
  return new Date(nowMs - QUEUE_STALE_MS).toISOString();
}

export async function pruneStaleQueue(db, nowIso) {
  const cutoff = staleCutoffIso(Date.parse(nowIso) || Date.now());
  await db
    .prepare(
      `DELETE FROM ranked_queue
       WHERE match_id IS NULL AND enqueued_at < ?`
    )
    .bind(cutoff)
    .run();
}

/**
 * Try to pair `username` with the closest in-range waiting opponent.
 * Uses the first-enqueued player's habitat as the match field.
 * Returns the match row if paired (this request or a race winner), else null.
 */
export async function tryMatch(db, username, now = new Date().toISOString()) {
  const self = await db
    .prepare("SELECT username, rating, habitat, enqueued_at, match_id FROM ranked_queue WHERE username = ?")
    .bind(username)
    .first();
  if (!self) return null;
  if (self.match_id) {
    return loadMatch(db, self.match_id);
  }

  await pruneStaleQueue(db, now);

  const minR = Number(self.rating) - ELO_RANGE;
  const maxR = Number(self.rating) + ELO_RANGE;
  const candidate = await db
    .prepare(
      `SELECT username, rating, habitat, enqueued_at
       FROM ranked_queue
       WHERE username != ?
         AND match_id IS NULL
         AND rating BETWEEN ? AND ?
       ORDER BY ABS(rating - ?) ASC, enqueued_at ASC
       LIMIT 1`
    )
    .bind(username, minR, maxR, Number(self.rating))
    .first();
  if (!candidate) return null;

  const selfFirst = String(self.enqueued_at) <= String(candidate.enqueued_at);
  const playerA = selfFirst ? self.username : candidate.username;
  const playerB = selfFirst ? candidate.username : self.username;
  const ratingA = selfFirst ? Number(self.rating) : Number(candidate.rating);
  const ratingB = selfFirst ? Number(candidate.rating) : Number(self.rating);
  const habitat = selfFirst ? self.habitat : candidate.habitat;
  const matchId = randomId("rk");

  await db
    .prepare(
      `INSERT INTO ranked_matches (
        id, player_a, player_b, rating_a, rating_b, habitat,
        party_a_json, party_b_json, status, winner, elo_applied, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'awaiting_parties', NULL, 0, ?, ?)`
    )
    .bind(matchId, playerA, playerB, ratingA, ratingB, habitat, now, now)
    .run();

  const updated = await db
    .prepare(
      `UPDATE ranked_queue SET match_id = ?
       WHERE username IN (?, ?) AND match_id IS NULL`
    )
    .bind(matchId, playerA, playerB)
    .run();

  const changes = Number(updated && updated.meta && updated.meta.changes) || 0;
  if (changes !== 2) {
    await db.prepare("DELETE FROM ranked_matches WHERE id = ? AND elo_applied = 0 AND party_a_json IS NULL AND party_b_json IS NULL").bind(matchId).run();
    const mine = await db
      .prepare("SELECT match_id FROM ranked_queue WHERE username = ?")
      .bind(username)
      .first();
    if (mine && mine.match_id) return loadMatch(db, mine.match_id);
    return null;
  }
  return loadMatch(db, matchId);
}

export function applyElo(current, outcome) {
  const cur = Math.max(ELO_FLOOR, Number(current) || ELO_START);
  if (outcome === "forfeit") return { rating: cur, delta: 0 };
  const delta = outcome === "win" ? ELO_WIN_DELTA : ELO_LOSS_DELTA;
  const next = Math.max(ELO_FLOOR, cur + delta);
  return { rating: next, delta: next - cur };
}

export function corsJson(origin, data, status = 200) {
  return json(data, status, corsHeaders(origin));
}

export function impliedWinner(match, reporter, outcome) {
  const other = match.player_a === reporter ? match.player_b : match.player_a;
  if (outcome === "win") return reporter;
  if (outcome === "loss") return other;
  if (outcome === "forfeit") return null;
  return undefined;
}
