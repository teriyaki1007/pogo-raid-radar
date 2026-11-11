/**
 * GET /nature/api/identify/:id/species-card — pollable species-card for Confirm.
 * Cache-Control: no-store. Owner Bearer token or NATURE_IDENTIFY_SECRET.
 * Pending: { ok, status:"pending", card:null }. Ready: { ok, status:"ready", card }.
 *
 * PUT /nature/api/identify/:id/species-card — same write contract as PUT /identify/:id.
 */
import {
  forbidOrigin,
  optionsResponse,
  requireDb,
  requireUser,
  readJson,
} from "../../_lib.js";
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
} from "../_lib.js";

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
    const view = jobView(row, { includeUsername: authz.includeUsername });
    return noStoreJson(origin, {
      ok: true,
      status: view.status,
      id: view.id,
      packageId: view.id,
      card: view.card,
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Identify card lookup failed", detail: msg }, 500);
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
    const view = jobView(row, { includeUsername: true });
    return noStoreJson(origin, {
      ok: true,
      status: view.status,
      id: view.id,
      packageId: view.id,
      card: view.card,
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return corsJson(origin, { ok: false, error: "Identify card write failed", detail: msg }, 500);
  }
}
