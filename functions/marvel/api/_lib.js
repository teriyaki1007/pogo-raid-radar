/**
 * Shared helpers for Marvel account API (D1 bind MARVEL_DB).
 * Env: MARVEL_DB (D1), MARVEL_AUTH_SECRET or AUTH_SECRET (HMAC session).
 */

export const ALLOWED_ORIGIN = "https://groot.zynergy.studio";
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const PBKDF2_ITERATIONS = 100000;

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

export function corsHeaders(origin) {
  if (origin && origin !== ALLOWED_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin || ALLOWED_ORIGIN,
    Vary: "Origin",
  };
}

export function forbidOrigin(origin) {
  if (origin && origin !== ALLOWED_ORIGIN) {
    return json({ ok: false, error: "Forbidden origin" }, 403);
  }
  return null;
}

export function optionsResponse(origin, methods = "GET, POST, PUT, OPTIONS") {
  const bad = forbidOrigin(origin);
  if (bad) return bad;
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin || ALLOWED_ORIGIN),
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function authSecret(env) {
  return String(env.MARVEL_AUTH_SECRET || env.AUTH_SECRET || "").trim();
}

export function requireDb(env, origin) {
  if (!env.MARVEL_DB) {
    return json(
      {
        ok: false,
        error: "D1 not bound",
        missing: ["MARVEL_DB"],
        hint: "Bind D1 database marvel_accounts as MARVEL_DB on the Pages Production environment, then redeploy.",
      },
      503,
      corsHeaders(origin)
    );
  }
  return null;
}

export function requireSecret(env, origin) {
  if (!authSecret(env)) {
    return json(
      {
        ok: false,
        error: "Auth secret not configured",
        missing: ["MARVEL_AUTH_SECRET"],
        hint: "Set MARVEL_AUTH_SECRET (or AUTH_SECRET) as a Production secret on the Cloudflare Pages project for groot.zynergy.studio, then redeploy. Do not commit the secret.",
      },
      503,
      corsHeaders(origin)
    );
  }
  return null;
}

export function normalizeUser(u) {
  return String(u || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-.]/g, "")
    .slice(0, 24);
}

export function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => ("0" + b.toString(16)).slice(-2))
    .join("");
}

export function hexToBuf(hex) {
  const clean = String(hex || "").replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function randomSaltHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bufToHex(a);
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBuf(saltHex),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return bufToHex(bits);
}

function b64urlEncode(bytes) {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlEncode(sig);
}

export async function mintToken(username, env) {
  const secret = authSecret(env);
  const payload = {
    u: username,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

export async function verifyToken(token, env) {
  const secret = authSecret(env);
  if (!secret || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expect = await hmacSign(secret, body);
  if (sig.length !== expect.length) return null;
  let ok = 0;
  for (let i = 0; i < sig.length; i++) ok |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (ok !== 0) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (!payload || typeof payload.u !== "string" || typeof payload.exp !== "number") {
    return null;
  }
  if (Date.now() > payload.exp) return null;
  const u = normalizeUser(payload.u);
  if (!u || u !== payload.u) return null;
  return u;
}

export function bearerToken(request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

export async function requireUser(request, env, origin) {
  const missingSecret = requireSecret(env, origin);
  if (missingSecret) return { error: missingSecret };
  const token = bearerToken(request);
  if (!token) {
    return {
      error: json({ ok: false, error: "Missing Authorization Bearer token" }, 401, corsHeaders(origin)),
    };
  }
  const username = await verifyToken(token, env);
  if (!username) {
    return {
      error: json({ ok: false, error: "Invalid or expired token" }, 401, corsHeaders(origin)),
    };
  }
  return { username };
}

export const STARTER_SHARDS = 300;
export const STARTER_OWNED = ["hawkeye", "black-widow", "happy-hogan", "falcon", "ant-man"];

export function defaultProgressRow(username, now) {
  const owned = {};
  STARTER_OWNED.forEach((id) => {
    owned[id] = 1;
  });
  return {
    username,
    shards: STARTER_SHARDS,
    xp: 0,
    owned_json: JSON.stringify(owned),
    pull_count: 0,
    battles_json: JSON.stringify({ arenaW: 0, arenaL: 0, partyW: 0, partyL: 0 }),
    last_party_reward_id: null,
    created_at: now,
    updated_at: now,
  };
}

export function rowToProgress(row) {
  let owned = {};
  let battles = { arenaW: 0, arenaL: 0, partyW: 0, partyL: 0 };
  try {
    owned = row.owned_json ? JSON.parse(row.owned_json) : {};
  } catch {
    owned = {};
  }
  try {
    battles = row.battles_json ? JSON.parse(row.battles_json) : battles;
  } catch {
    /* keep default */
  }
  if (!owned || typeof owned !== "object" || Array.isArray(owned)) owned = {};
  if (!battles || typeof battles !== "object") {
    battles = { arenaW: 0, arenaL: 0, partyW: 0, partyL: 0 };
  }
  return {
    shards: Number(row.shards) || 0,
    xp: Number(row.xp) || 0,
    owned,
    pullCount: Number(row.pull_count) || 0,
    battles,
    lastPartyRewardId: row.last_party_reward_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: "Expected JSON object" };
    }
    return { body };
  } catch {
    return { error: "Invalid JSON" };
  }
}
