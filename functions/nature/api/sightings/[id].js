/**
 * PATCH  /nature/api/sightings/:id
 * DELETE /nature/api/sightings/:id
 */

import {
  corsHeaders,
  forbidOrigin,
  optionsResponse,
  json,
  requireDb,
  requireUser,
  rowToSighting,
  readJson,
} from "../_lib.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request.headers.get("Origin") || "", "PATCH, DELETE, OPTIONS");
}

export async function onRequestPatch({ request, env, params }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  const id = String(params.id || "").trim();
  const existing = await env.NATURE_DB.prepare(
    "SELECT * FROM sightings WHERE id = ? AND username = ?"
  )
    .bind(id, auth.username)
    .first();
  if (!existing) {
    return json({ ok: false, error: "Sighting not found" }, 404, corsHeaders(origin));
  }

  const parsed = await readJson(request);
  if (parsed.error) {
    return json({ ok: false, error: parsed.error }, 400, corsHeaders(origin));
  }
  const body = parsed.body;
  const now = new Date().toISOString();

  const notes =
    body.notes === undefined
      ? existing.notes
      : body.notes == null
        ? null
        : String(body.notes).slice(0, 2000);
  const privacy =
    body.privacy === undefined
      ? existing.privacy
      : body.privacy === "shared"
        ? "shared"
        : "private";
  const status =
    body.status === undefined
      ? existing.status
      : body.status == null
        ? null
        : String(body.status).slice(0, 32);
  const idConfidence =
    body.idConfidence === undefined
      ? existing.id_confidence
      : body.idConfidence == null
        ? null
        : String(body.idConfidence).slice(0, 32);
  const taxonId =
    body.speciesRef !== undefined || body.taxonId !== undefined
      ? String(body.speciesRef || body.taxonId || "").slice(0, 64) || null
      : existing.taxon_id;
  const xpAwarded =
    body.xpAwarded === undefined
      ? existing.xp_awarded
      : Math.max(0, Number(body.xpAwarded) || 0);

  await env.NATURE_DB.prepare(
    `UPDATE sightings SET
      notes = ?, privacy = ?, status = ?, id_confidence = ?, taxon_id = ?,
      xp_awarded = ?, updated_at = ?
     WHERE id = ? AND username = ?`
  )
    .bind(notes, privacy, status, idConfidence, taxonId, xpAwarded, now, id, auth.username)
    .run();

  const row = await env.NATURE_DB.prepare("SELECT * FROM sightings WHERE id = ?")
    .bind(id)
    .first();

  return json({ ok: true, sighting: rowToSighting(row) }, 200, corsHeaders(origin));
}

export async function onRequestDelete({ request, env, params }) {
  const origin = request.headers.get("Origin") || "";
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  const noDb = requireDb(env, origin);
  if (noDb) return noDb;

  const auth = await requireUser(request, env, origin);
  if (auth.error) return auth.error;

  const id = String(params.id || "").trim();
  const existing = await env.NATURE_DB.prepare(
    "SELECT id FROM sightings WHERE id = ? AND username = ?"
  )
    .bind(id, auth.username)
    .first();
  if (!existing) {
    return json({ ok: false, error: "Sighting not found" }, 404, corsHeaders(origin));
  }

  await env.NATURE_DB.prepare(
    "DELETE FROM sightings WHERE id = ? AND username = ?"
  )
    .bind(id, auth.username)
    .run();

  return json({ ok: true, deleted: id }, 200, corsHeaders(origin));
}
