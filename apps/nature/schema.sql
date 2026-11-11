-- Nature catalogue D1 schema (bind as NATURE_DB → database nature_accounts)
-- Apply once in Cloudflare D1 console / wrangler d1 execute

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  username TEXT PRIMARY KEY REFERENCES users(username),
  xp_total INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_confirm_day TEXT,
  badges_json TEXT NOT NULL DEFAULT '[]',
  slots_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sightings (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username),
  photo_id TEXT,
  place_label TEXT,
  place_lat REAL,
  place_lng REAL,
  place_precision TEXT DEFAULT 'label-only',
  observed_at TEXT NOT NULL,
  notes TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  id_confidence TEXT,
  taxon_id TEXT,
  lookalike_json TEXT NOT NULL DEFAULT '[]',
  privacy TEXT NOT NULL DEFAULT 'private',
  status TEXT,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sightings_user ON sightings(username, observed_at DESC);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username),
  r2_key TEXT NOT NULL,
  content_type TEXT,
  byte_size INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);

-- Ranked (auto-migrated on first /nature/api/ranked/* request as well)
CREATE TABLE IF NOT EXISTS ranked_ratings (
  username TEXT PRIMARY KEY REFERENCES users(username),
  rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ranked_queue (
  username TEXT PRIMARY KEY REFERENCES users(username),
  rating INTEGER NOT NULL,
  habitat TEXT NOT NULL,
  enqueued_at TEXT NOT NULL,
  match_id TEXT
);

CREATE TABLE IF NOT EXISTS ranked_matches (
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
);

CREATE INDEX IF NOT EXISTS idx_ranked_ratings_board ON ranked_ratings(rating DESC, username);
CREATE INDEX IF NOT EXISTS idx_ranked_queue_open ON ranked_queue(match_id, rating);

-- Identify jobs (auto-migrated on first /nature/api/identify/* request as well)
-- Live photo→profile fill: client packageId (log-<timestamp>) is the job id.
CREATE TABLE IF NOT EXISTS identify_jobs (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username),
  photo_id TEXT,
  observed_at TEXT,
  place_label TEXT,
  notes TEXT,
  privacy TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL,
  card_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_identify_jobs_user ON identify_jobs(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_identify_jobs_status ON identify_jobs(status, created_at DESC);
