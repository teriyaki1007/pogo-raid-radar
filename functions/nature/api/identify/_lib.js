/**
 * Shared helpers for Nature Identify job API (D1 NATURE_DB).
 * Auto-migrates identify_jobs on first request (same pattern as Ranked).
 *
 * Write contract (Species Guide → live job, no repo/box folder drop):
 *   PUT /nature/api/identify/:id
 *   (also PUT /nature/api/identify/:id/species-card)
 *   Header: Authorization: Bearer <NATURE_IDENTIFY_SECRET>
 *           or Authorization: <NATURE_IDENTIFY_SECRET>
 *   Body: JSON object matching identify-handoff-contract-v1 species-card.json
 *         fields (or { card: { ...same fields } }). Combat types/bp/moves
 *         are omitted. After a successful write, GET becomes status=ready
 *         and the signed-in owner's poll picks it up without a Pages deploy.
 *
 *   If NATURE_IDENTIFY_SECRET is not bound, write endpoints return JSON 503
 *   ({ ok:false, error, missing:["NATURE_IDENTIFY_SECRET"] }) and do not crash.
 *
 * Read:
 *   POST /nature/api/identify — signed-in owner creates a job (id = client packageId)
 *   GET  /nature/api/identify — Guide secret lists recent jobs
 *   GET  /nature/api/identify/:id — owner or secret; Cache-Control: no-store
 *   GET  /nature/api/identify/:id/species-card — same card payload for the confirm poll
 *   GET  /nature/api/identify/:id/photo — photo bytes for the owner or Guide secret
 */
import {
  corsHeaders,
  json,
} from "../_lib.js";

export const PACKAGE_ID_RE = /^log-[A-Za-z0-9._-]{1,80}$/;

export const CARD_FIELDS = [
  "packageId",
  "provisional",
  "id",
  "taxonId",
  "commonName",
  "scientificName",
  "idTier",
  "idConfidence",
  "kind",
  "averageSize",
  "nativeRange",
  "originRange",
  "habitat",
  "habitatAffinity",
  "seasonality",
  "lookalikes",
  "caution",
  "populationEstimate",
  "populationSource",
  "populationConfidence",
  "sources",
  "uncertaintyNotes",
  "observedAt",
  "placeLabel",
];

const ID_TIERS = new Set(["species", "genus", "lookalike-set"]);
const ID_CONFIDENCE = new Set(["high", "medium", "low", "unknown", "likely", "unsure", "confirmed"]);
const KINDS = new Set(["animal", "plant", "fungus", "other"]);
const HABITATS = new Set(["tree", "ocean", "grassland", "wetland", "urban", "mountain"]);
const POP_CONFIDENCE = new Set(["high", "medium", "low", "unknown"]);
const PRIVACY = new Set(["private", "friends", "public"]);

let schemaReady = false;

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS identify_jobs (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_identify_jobs_user ON identify_jobs(username, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_identify_jobs_status ON identify_jobs(status, created_at DESC)`,
];

export async function ensureIdentifySchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA_SQL.map((sql) => db.prepare(sql)));
  schemaReady = true;
}

export function corsJson(origin, data, status = 200, extraHeaders = {}) {
  return json(data, status, { ...corsHeaders(origin), ...extraHeaders });
}

export function noStoreJson(origin, data, status = 200) {
  return corsJson(origin, data, status, { "Cache-Control": "no-store" });
}

export function identifySecret(env) {
  return String(env.NATURE_IDENTIFY_SECRET || "").trim();
}

export function missingIdentifySecretResponse(origin) {
  return corsJson(
    origin,
    {
      ok: false,
      error: "Identify write secret not configured",
      missing: ["NATURE_IDENTIFY_SECRET"],
      hint: "Set NATURE_IDENTIFY_SECRET as a Production secret on the Cloudflare Pages project, then redeploy. Do not commit the secret.",
    },
    503
  );
}

function authorizationValue(request) {
  const raw = request.headers.get("Authorization") || "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function secureEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const n = Math.max(aa.length, bb.length);
  let out = aa.length ^ bb.length;
  for (let i = 0; i < n; i++) {
    out |= (aa[i] || 0) ^ (bb[i] || 0);
  }
  return out === 0;
}

export function hasIdentifySecret(request, env) {
  const secret = identifySecret(env);
  if (!secret) return false;
  const provided = authorizationValue(request);
  return !!provided && secureEqual(provided, secret);
}

/**
 * Auth for Species Guide writes (and Guide list/photo reads).
 * 503 if unbound, 401 if header missing, 403 if wrong secret.
 */
export function requireIdentifySecret(request, env, origin) {
  if (!identifySecret(env)) {
    return { error: missingIdentifySecretResponse(origin) };
  }
  const provided = authorizationValue(request);
  if (!provided) {
    return {
      error: corsJson(origin, { ok: false, error: "Missing Authorization secret" }, 401),
    };
  }
  if (!secureEqual(provided, identifySecret(env))) {
    return {
      error: corsJson(origin, { ok: false, error: "Invalid identify secret" }, 403),
    };
  }
  return { ok: true };
}

export function normalizePackageId(raw) {
  const id = String(raw || "").trim();
  if (!PACKAGE_ID_RE.test(id)) return "";
  return id;
}

export function normalizePrivacy(raw) {
  const v = String(raw || "private").trim().toLowerCase();
  return PRIVACY.has(v) ? v : "private";
}

function clip(value, max) {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

function stringList(raw, maxItems, maxLen) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => clip(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function sanitizeCard(raw, packageId) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const card = {};

  const id = clip(src.id || src.taxonId, 80);
  if (id) {
    card.id = id;
    card.taxonId = clip(src.taxonId, 80) || id;
  }
  card.packageId = packageId;
  card.provisional = src.provisional !== false;

  const commonName = clip(src.commonName, 120);
  const scientificName = clip(src.scientificName, 160);
  if (commonName) card.commonName = commonName;
  if (scientificName) card.scientificName = scientificName;

  const idTier = clip(src.idTier, 32).toLowerCase();
  if (ID_TIERS.has(idTier)) card.idTier = idTier;

  const idConfidence = clip(src.idConfidence, 32).toLowerCase();
  if (ID_CONFIDENCE.has(idConfidence)) card.idConfidence = idConfidence;

  const kind = clip(src.kind, 32).toLowerCase();
  if (KINDS.has(kind)) card.kind = kind;

  const averageSize = clip(src.averageSize, 240);
  if (averageSize) card.averageSize = averageSize;
  const nativeRange = clip(src.nativeRange, 800);
  if (nativeRange) card.nativeRange = nativeRange;
  const originRange = clip(src.originRange, 800);
  if (originRange) card.originRange = originRange;
  const habitat = clip(src.habitat, 800);
  if (habitat) card.habitat = habitat;
  const seasonality = clip(src.seasonality, 400);
  if (seasonality) card.seasonality = seasonality;
  const caution = clip(src.caution, 400);
  if (caution) card.caution = caution;
  const uncertaintyNotes = clip(src.uncertaintyNotes, 800);
  if (uncertaintyNotes) card.uncertaintyNotes = uncertaintyNotes;

  const popEst = clip(src.populationEstimate, 400);
  if (popEst) card.populationEstimate = popEst;
  const popSrc = clip(src.populationSource, 400);
  if (popSrc) card.populationSource = popSrc;
  const popConf = clip(src.populationConfidence, 32).toLowerCase();
  if (POP_CONFIDENCE.has(popConf)) card.populationConfidence = popConf;

  const affinity = Array.isArray(src.habitatAffinity)
    ? src.habitatAffinity
        .map((h) => String(h || "").trim().toLowerCase())
        .filter((h) => HABITATS.has(h))
        .slice(0, 3)
    : [];
  if (affinity.length) card.habitatAffinity = affinity;

  const lookalikes = stringList(src.lookalikes, 12, 200);
  if (lookalikes.length) card.lookalikes = lookalikes;

  const sources = stringList(src.sources, 12, 300);
  if (sources.length) card.sources = sources;

  const observedAt = clip(src.observedAt, 64);
  if (observedAt) card.observedAt = observedAt;
  const placeLabel = clip(src.placeLabel, 200);
  if (placeLabel) card.placeLabel = placeLabel;

  return card;
}

export function parseCardJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function jobView(row, { includeUsername = false } = {}) {
  const card = row.status === "ready" ? parseCardJson(row.card_json) : null;
  const view = {
    ok: true,
    id: row.id,
    status: row.status === "ready" ? "ready" : "pending",
    photoId: row.photo_id || null,
    photoUrl: row.photo_id ? `/nature/api/identify/${encodeURIComponent(row.id)}/photo` : null,
    observedAt: row.observed_at || null,
    placeLabel: row.place_label || null,
    notes: row.notes || null,
    privacy: row.privacy || "private",
    card: card,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeUsername) view.username = row.username;
  return view;
}

export async function loadJob(db, id) {
  return db.prepare("SELECT * FROM identify_jobs WHERE id = ?").bind(id).first();
}

export { CARD_FIELDS as SPECIES_CARD_FIELDS };
