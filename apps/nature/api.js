/**
 * Nature remote API client (Pages Functions + D1 + R2).
 * Falls back silently when bindings/secret missing (503) or offline.
 */
(function (global) {
  "use strict";

  const API_BASE = "/nature/api";
  const TOKEN_KEY = "nature-catalogue-token";
  const LONG_EDGE_MAX = 2400;
  const LONG_EDGE_MIN_NOTE = 1600; // Species Guide: don't crush below this
  const JPEG_QUALITY = 0.88;
  const MAX_BYTES = 6 * 1024 * 1024;

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  async function request(path, { method = "GET", body, headers = {}, formData } = {}) {
    const opts = { method, headers: { ...headers } };
    const token = getToken();
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (formData) {
      opts.body = formData;
    } else if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, opts);
    } catch (err) {
      return { ok: false, offline: true, error: String(err && err.message ? err.message : err) };
    }
    const ct = res.headers.get("Content-Type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      return { ...data, ok: !!data.ok && res.ok, status: res.status, httpOk: res.ok };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, response: res };
  }

  function apiAvailable(result) {
    if (!result) return false;
    if (result.offline) return false;
    if (result.status === 503 && result.missing) return false;
    return true;
  }

  /** Canvas re-encode: strips EXIF/GPS; caps long edge at 2400 (won't upscale). */
  function encodePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        reject(new Error("Use a jpeg, png, or webp photo"));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const long = Math.max(width, height);
        if (long > LONG_EDGE_MAX) {
          const scale = LONG_EDGE_MAX / long;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not encode photo"));
              return;
            }
            if (blob.size > MAX_BYTES) {
              reject(new Error("Photo still too large after encode (max 6 MB)"));
              return;
            }
            resolve({
              blob,
              width,
              height,
              contentType: "image/jpeg",
              longEdge: Math.max(width, height),
              belowGuideFloor: Math.max(width, height) < LONG_EDGE_MIN_NOTE,
            });
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read photo"));
      };
      img.src = url;
    });
  }

  async function register(username, password) {
    const result = await request("/register", {
      method: "POST",
      body: { username, password },
    });
    if (result.ok && result.token) setToken(result.token);
    return result;
  }

  async function login(username, password) {
    const result = await request("/login", {
      method: "POST",
      body: { username, password },
    });
    if (result.ok && result.token) setToken(result.token);
    return result;
  }

  async function me() {
    if (!getToken()) return { ok: false, error: "No token" };
    return request("/me");
  }

  async function putProgress(progress) {
    return request("/me", { method: "PUT", body: { progress } });
  }

  async function uploadPhoto(fileOrBlob, meta = {}) {
    const encoded =
      fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)
        ? {
            blob: fileOrBlob,
            width: meta.width || null,
            height: meta.height || null,
            contentType: fileOrBlob.type || "image/jpeg",
          }
        : await encodePhoto(fileOrBlob);
    const fd = new FormData();
    fd.append("photo", encoded.blob, "sighting.jpg");
    if (encoded.width) fd.append("width", String(encoded.width));
    if (encoded.height) fd.append("height", String(encoded.height));
    return request("/photos", { method: "POST", formData: fd });
  }

  async function createSighting(sighting) {
    return request("/sightings", { method: "POST", body: sighting });
  }

  function logout() {
    setToken("");
  }

  global.NatureApi = {
    getToken,
    setToken,
    apiAvailable,
    encodePhoto,
    register,
    login,
    me,
    putProgress,
    uploadPhoto,
    createSighting,
    logout,
    LONG_EDGE_MAX,
    LONG_EDGE_MIN_NOTE,
  };
})(window);
