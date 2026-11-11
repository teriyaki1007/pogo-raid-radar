/**
 * GET /nature/api/identify/:id — job + card for the signed-in owner or Guide secret.
 * Cache-Control: no-store. Does not leak other users' jobs or photos.
 *
 * PUT /nature/api/identify/:id — Species Guide writes species-card.json fields.
 * Auth: Authorization: Bearer <NATURE_IDENTIFY_SECRET>
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
  noStoreJson,
  ensureIdentifySchema,
  normalizePackageId,
  requireIdentifySecret,
  hasIdentifySecret,
  sanitizeCard,
  jobView,
  loadJob,
} from "./_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "GET, PUT, POST, OPTIONS");
}

async function authorizeJobRead(request, env, origin, row) {
  if (hasIdentifySecret(request, env)) {
    return { row, includeUsername: true };
  }
  const auth = await requireUser(request, env, origin);
  if (auth.error) return { error: auth.error };
  if (!row || row.username !== auth.username) {
    return { error: noStoreJson(origin, { ok: false, error: "Identify job not found" }, 404) };
  }
  return { row, includeUsername: false };
}

export async function onRequestGet({ request, env, params }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const id = normalizePackageId(params.id);
  if (!id) {
    return noStoreJson(origin, { ok: false, error: "Invalid identify job id" }, 400);
  }

  try {
    await ensureIdentifySchema(env.NATURE_DB);
    const row = await loadJob(env.NATURE_DB, id);
    const authz = await authorizeJobRead(request, env, origin, row);
    if (authz.error) return authz.error;
    if (!row) {
      return noStoreJson(origin, { ok: false, error: "Identify job not found" }, 404);
    }
    return noStoreJson(origin, jobView(row, { includeUsername: authz.includeUsername }));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Identify job lookup failed", detail: msg }, 500);
  }
}

export async function onRequestPut({ request, env, params }) {
  return writeCard({ request, env, params });
}

export async function onRequestPost({ request, env, params }) {
  return writeCard({ request, env, params });
}

async function writeCard({ request, env, params }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const writer = requireIdentifySecret(request, env, origin);
  if (writer.error) return writer.error;

  const id = normalizePackageId(params.id);
  if (!id) {
    return corsJson(origin, { ok: false, error: "Invalid identify job id" }, 400);
  }

  const parsed = await readJson(request);
  if (parsed.error) {
    return corsJson(origin, { ok: false, error: parsed.error }, 400);
  }

  const raw =
    parsed.body.card && typeof parsed.body.card === "object" && !Array.isArray(parsed.body.card)
      ? parsed.body.card
      : parsed.body;
  const card = sanitizeCard(raw, id);
  if (!card.id) {
    return corsJson(
      origin,
      { ok: false, error: "species-card must include an id (taxon or lookalike-set id)." },
      400
    );
  }

  try {
    await ensureIdentifySchema(env.NATURE_DB);
    const existing = await loadJob(env.NATURE_DB, id);
    if (!existing) {
      return corsJson(origin, { ok: false, error: "Identify job not found" }, 404);
    }
    const now = new Date().toISOString();
    await env.NATURE_DB.prepare(
      `UPDATE identify_jobs
       SET status = 'ready', card_json = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(JSON.stringify(card), now, id)
      .run();
    const row = await loadJob(env.NATURE_DB, id);
    return noStoreJson(origin, jobView(row, { includeUsername: true }));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Identify card write failed", detail: msg }, 500);
  }
}
