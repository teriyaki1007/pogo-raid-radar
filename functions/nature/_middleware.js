/**
 * Soft preview gate for /nature/* until CF auth E2E is live.
 * Cookie `nature_preview` must match SHA-256 of the preview password.
 * Not a hard security boundary — keeps casual visitors out.
 */
const COOKIE = "nature_preview";
const EXPECTED = "459a05eb9a5a719fff388569b50a6cb4c58ed5213ff0113a1aae159261e16c9b";

function getCookie(req, name) {
  const raw = req.headers.get("Cookie") || "";
  const parts = raw.split(/;\s*/);
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    if (p.slice(0, i) === name) return decodeURIComponent(p.slice(i + 1));
  }
  return null;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function gatePage(error) {
  const err = error ? `<p class="err">${error}</p>` : "";
  return new Response(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Nature Catalogue — locked</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:system-ui,sans-serif;
    background:#0b1020; color:#e8eefc; padding:1.5rem; }
  form { width:min(22rem,100%); background:#141c2e; border:1px solid #24304a; border-radius:1rem; padding:1.25rem; }
  h1 { margin:0 0 .35rem; font-size:1.15rem; }
  p { margin:0 0 1rem; color:#9aa8c7; font-size:.9rem; }
  input { width:100%; box-sizing:border-box; padding:.65rem .75rem; border-radius:.5rem; border:1px solid #24304a;
    background:#0b1020; color:#e8eefc; margin-bottom:.75rem; }
  button { width:100%; padding:.7rem; border:0; border-radius:.5rem; background:#3d8b6e; color:#fff; font-weight:600; cursor:pointer; }
  .err { color:#f5a8a8; margin-bottom:.75rem; }
</style></head><body>
<form method="POST" action="/nature/">
  <h1>Nature Catalogue</h1>
  <p>Preview locked until auth is finished.</p>
  ${err}
  <input type="password" name="password" placeholder="Preview password" required autofocus />
  <button type="submit">Unlock</button>
</form></body></html>`, {
    status: error ? 401 : 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // API routes: let existing handlers run (they enforce their own auth / 503)
  if (url.pathname.startsWith("/nature/api/")) {
    return next();
  }

  const existing = getCookie(request, COOKIE);
  if (existing && existing === EXPECTED) {
    return next();
  }

  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    let password = "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const form = await request.formData();
      password = String(form.get("password") || "");
    } else {
      password = (await request.text()).trim();
    }
    const got = await sha256Hex(password);
    if (got === EXPECTED) {
      const headers = new Headers({
        location: "/nature/",
        "set-cookie": `${COOKIE}=${EXPECTED}; Path=/nature; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        "cache-control": "no-store",
      });
      return new Response(null, { status: 303, headers });
    }
    return gatePage("Wrong password.");
  }

  return gatePage(null);
}
