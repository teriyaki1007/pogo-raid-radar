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
