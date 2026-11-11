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

  /**
   * Prefer original bytes so EXIF DateTime (and other tags) survive for Species Guide.
   * Canvas resize only when long edge > 2400 or file > 6MB — that path drops EXIF.
   * GPS may remain on originals; place is still collected on the form.
   */

  /** Read JPEG EXIF DateTimeOriginal / DateTime → ISO string (local wall time, no TZ). */
  function readExifDateTime(file) {
    return new Promise((resolve) => {
      if (!file || !/^image\/jpeg$/i.test(file.type || "")) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const view = new DataView(reader.result);
          if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
            resolve(null);
            return;
          }
          let offset = 2;
          while (offset + 4 <= view.byteLength) {
            const marker = view.getUint16(offset);
            offset += 2;
            if ((marker & 0xff00) !== 0xff00) break;
            if (marker === 0xffe1) {
              const len = view.getUint16(offset);
              if (offset + len > view.byteLength) break;
              // APP1 "Exif\0\0"
              if (
                len >= 8 &&
                view.getUint32(offset + 2) === 0x45786966 &&
                view.getUint16(offset + 6) === 0x0000
              ) {
                const tiff = offset + 8;
                const le = view.getUint16(tiff) === 0x4949;
                const u16 = (o) => (le ? view.getUint16(o, true) : view.getUint16(o, false));
                const u32 = (o) => (le ? view.getUint32(o, true) : view.getUint32(o, false));
                if (u16(tiff) !== 0x4949 && u16(tiff) !== 0x4d4d) break;
                const ifd0 = tiff + u32(tiff + 4);
                const readIFD = (ifd) => {
                  if (ifd + 2 > view.byteLength) return null;
                  const entries = u16(ifd);
                  let datetime = null;
                  let datetimeOriginal = null;
                  let exifOffset = null;
                  for (let i = 0; i < entries; i++) {
                    const e = ifd + 2 + i * 12;
                    if (e + 12 > view.byteLength) break;
                    const tag = u16(e);
                    const type = u16(e + 2);
                    const count = u32(e + 4);
                    const valOff = e + 8;
                    const size = type === 2 ? count : 0;
                    let dataPtr = valOff;
                    if (size > 4) dataPtr = tiff + u32(valOff);
                    if (tag === 0x8769) exifOffset = tiff + u32(valOff); // ExifIFD
                    if (tag === 0x0132 || tag === 0x9003) {
                      if (dataPtr + count <= view.byteLength) {
                        let s = "";
                        for (let j = 0; j < count; j++) {
                          const c = view.getUint8(dataPtr + j);
                          if (c === 0) break;
                          s += String.fromCharCode(c);
                        }
                        if (tag === 0x9003) datetimeOriginal = s;
                        else datetime = s;
                      }
                    }
                  }
                  return { datetime, datetimeOriginal, exifOffset };
                };
                const ifd0data = readIFD(ifd0);
                let raw = ifd0data && (ifd0data.datetimeOriginal || ifd0data.datetime);
                if (ifd0data && ifd0data.exifOffset) {
                  const exif = readIFD(ifd0data.exifOffset);
                  if (exif) raw = exif.datetimeOriginal || exif.datetime || raw;
                }
                if (!raw) {
                  resolve(null);
                  return;
                }
                // "YYYY:MM:DD HH:MM:SS" → ISO-ish local
                const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
                if (!m) {
                  resolve(null);
                  return;
                }
                resolve(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
                return;
              }
              offset += len;
              continue;
            }
            if (marker === 0xffda) break; // SOS
            const len = view.getUint16(offset);
            offset += len;
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file.slice(0, Math.min(file.size, 256 * 1024)));
    });
  }

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
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        const long = Math.max(srcW, srcH) || 0;
        const belowGuideFloor = long > 0 && long < LONG_EDGE_MIN_NOTE;
        const needsResize = long > LONG_EDGE_MAX || file.size > MAX_BYTES;

        if (!needsResize) {
          resolve({
            blob: file,
            width: srcW || null,
            height: srcH || null,
            contentType: file.type || "image/jpeg",
            longEdge: long || null,
            belowGuideFloor,
            exifPreserved: true,
          });
          return;
        }

        let width = srcW;
        let height = srcH;
        if (long > LONG_EDGE_MAX) {
          const scale = LONG_EDGE_MAX / long;
          width = Math.round(srcW * scale);
          height = Math.round(srcH * scale);
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
              reject(new Error("Photo still too large after resize (max 6 MB)"));
              return;
            }
            resolve({
              blob,
              width,
              height,
              contentType: "image/jpeg",
              longEdge: Math.max(width, height),
              belowGuideFloor: Math.max(width, height) < LONG_EDGE_MIN_NOTE,
              exifPreserved: false,
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
      fileOrBlob instanceof Blob && !(fileOrBlob instanceof File) && meta.skipEncode
        ? {
            blob: fileOrBlob,
            width: meta.width || null,
            height: meta.height || null,
            contentType: fileOrBlob.type || "image/jpeg",
            exifPreserved: true,
          }
        : await encodePhoto(fileOrBlob);
    const fd = new FormData();
    const name =
      encoded.contentType === "image/png"
        ? "sighting.png"
        : encoded.contentType === "image/webp"
          ? "sighting.webp"
          : "sighting.jpg";
    fd.append("photo", encoded.blob, name);
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

  async function rankedMe() {
    if (!getToken()) return { ok: false, error: "No token" };
    return request("/ranked/me");
  }

  async function rankedLeaderboard() {
    if (!getToken()) return { ok: false, error: "No token" };
    return request("/ranked/leaderboard");
  }

  async function rankedEnqueue(body = {}) {
    return request("/ranked/queue", { method: "POST", body });
  }

  async function rankedQueueStatus() {
    return request("/ranked/queue");
  }

  async function rankedCancel() {
    return request("/ranked/queue", { method: "DELETE" });
  }

  async function rankedMatch(matchId) {
    return request(`/ranked/matches/${encodeURIComponent(matchId)}`);
  }

  async function rankedSubmitParty(matchId, party) {
    return request(`/ranked/matches/${encodeURIComponent(matchId)}/party`, {
      method: "POST",
      body: { party },
    });
  }

  async function rankedResult(matchId, outcome) {
    return request(`/ranked/matches/${encodeURIComponent(matchId)}/result`, {
      method: "POST",
      body: { outcome },
    });
  }

  global.NatureApi = {
    getToken,
    setToken,
    apiAvailable,
    encodePhoto,
    readExifDateTime,
    register,
    login,
    me,
    putProgress,
    uploadPhoto,
    createSighting,
    logout,
    rankedMe,
    rankedLeaderboard,
    rankedEnqueue,
    rankedQueueStatus,
    rankedCancel,
    rankedMatch,
    rankedSubmitParty,
    rankedResult,
    LONG_EDGE_MAX,
    LONG_EDGE_MIN_NOTE,
  };
})(window);
