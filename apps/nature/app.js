/**
 * Project Nature — /nature/ demo mount (v0.1 UI + demo JSON)
 * Loads shared speciesCards from data/catalogue-demo.json.
 * Prefers /nature/api/* (D1+R2) when bound; falls back to localStorage.
 * SAMPLE facts only — Species Guide owns real packs later.
 * Design Critique v0.1 pass applied (UI clear for demo wire).
 * LIVE Pages publish intentionally held — not in package.json build / landing.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "nature-catalogue-v0";
  const DATA_URL = "data/catalogue-demo.json";
  const EMPTY_SLOTS_SHOWN = 3;

  const DEFAULT_XP = {
    confirm: 10,
    newSlot: 25,
    photo: 5,
    streakDay: 15,
    badge: 40,
  };

  const BADGE_DEFS = [
    { id: "first-find", label: "First find", icon: "🌱", needSlots: 1 },
    { id: "collector-3", label: "Trio", icon: "🍃", needSlots: 3 },
    { id: "half-dex", label: "Half dex", icon: "📗", needSlots: 6 },
    { id: "streak-3", label: "3-day streak", icon: "🔥", needStreak: 3 },
  ];

  /** Locked Catalogue chart: Strong ×1.6 / Weak ×0.6 */
  const TYPE_CHART = {
    Forest: { strong: ["Earth", "River"], weak: ["Fire", "Ice", "Bug"] },
    Ocean: { strong: ["Fire", "Earth"], weak: ["Storm", "Meadow", "River"] },
    Sky: { strong: ["Bug", "Meadow"], weak: ["Ice", "Storm", "Crystal"] },
    Earth: { strong: ["Fire", "Storm", "Crystal"], weak: ["Ocean", "Ice", "Forest"] },
    Fire: { strong: ["Forest", "Ice", "Bug"], weak: ["Ocean", "River", "Earth"] },
    Ice: { strong: ["Sky", "Forest", "Meadow"], weak: ["Fire", "Crystal", "Earth"] },
    Bug: { strong: ["Forest", "Meadow", "Shadow"], weak: ["Fire", "Sky", "Ice"] },
    Shadow: { strong: ["Sky", "Meadow", "Crystal"], weak: ["Bug", "Fire", "Storm"] },
    River: { strong: ["Fire", "Earth"], weak: ["Forest", "Meadow", "Ocean"] },
    Meadow: { strong: ["Earth", "River", "Ocean"], weak: ["Fire", "Ice", "Bug"] },
    Storm: { strong: ["Ocean", "Sky", "Bug"], weak: ["Earth", "Crystal"] },
    Crystal: { strong: ["Shadow", "Ice", "Storm"], weak: ["Earth", "Fire", "Bug"] },
  };

  const HABITATS = [
    { id: "tree", label: "Tree", icon: "🌳" },
    { id: "ocean", label: "Ocean", icon: "🌊" },
    { id: "grassland", label: "Grassland", icon: "🌾" },
    { id: "wetland", label: "Wetland", icon: "🪷" },
    { id: "urban", label: "Urban", icon: "🏙️" },
    { id: "mountain", label: "Mountain", icon: "⛰️" },
  ];

  const HABITAT_AFFINITY_ENUM = new Set(HABITATS.map((h) => h.id));

  /** Species Guide closed enum: 1–3 of tree|ocean|grassland|wetland|urban|mountain */
  function normalizeHabitatAffinity(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const v of raw) {
      const id = String(v || "").trim().toLowerCase();
      if (!HABITAT_AFFINITY_ENUM.has(id)) continue;
      if (!out.includes(id)) out.push(id);
      if (out.length >= 3) break;
    }
    return out;
  }


  const DEMO_FRIENDS_SEED = [
    { username: "trailfox", status: "online", pending: false },
    { username: "tidewalker", status: "offline", pending: false },
    { username: "meadowjay", status: "online", pending: false },
  ];

  const DEMO_REQUESTS_SEED = [
    { username: "crystalfern", status: "pending" },
  ];

  /** Demo combat seeds when speciesCards lack game-layer fields yet */
  const DEMO_FIGHTERS = [
    { id: "demo-european-robin", kind: "animal", types: ["Sky", "Meadow"], rarity: "common", bp: 140, habitatAffinity: ["urban", "tree"], emoji: "🐦" },
    { id: "demo-common-starfish", kind: "animal", types: ["Ocean"], rarity: "common", bp: 110, habitatAffinity: ["ocean", "wetland"], emoji: "🌊" },
    { id: "demo-monarch", kind: "animal", types: ["Bug", "Meadow"], rarity: "uncommon", bp: 180, habitatAffinity: ["grassland"], emoji: "🦋" },
    { id: "demo-woodpecker", kind: "animal", types: ["Forest", "Sky"], rarity: "rare", bp: 360, habitatAffinity: ["tree", "mountain"], emoji: "🪶",
      commonName: "SAMPLE: Forest woodpecker", scientificName: "Exemplar picus" },
    { id: "demo-fox", kind: "animal", types: ["Earth", "Meadow"], rarity: "uncommon", bp: 280, habitatAffinity: ["grassland", "urban"], emoji: "🦊",
      commonName: "SAMPLE: Meadow fox", scientificName: "Exemplar vulpes" },
    { id: "demo-otter", kind: "animal", types: ["River", "Earth"], rarity: "rare", bp: 410, habitatAffinity: ["wetland"], emoji: "🦦",
      commonName: "SAMPLE: River otter", scientificName: "Exemplar lutra" },
  ];

  let catalogue = null;
  let speciesCards = [];
  let SLOT_COUNT = 12;
  let XP = { ...DEFAULT_XP };

  let state = null;
  let pendingSighting = null;
  let photoDataUrl = null;
  let photoFile = null;
  let authMode = "login";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const screenAuth = $("#screen-auth");
  const screenApp = $("#screen-app");
  const authForm = $("#auth-form");
  const authSubmit = $("#auth-submit");
  const userChip = $("#user-chip");
  const toastEl = $("#toast");

  const photoDrop = $("#photo-drop");
  const photoInput = $("#photo-input");
  const photoPreview = $("#photo-preview");
  const btnIdentify = $("#btn-identify");
  const captureForm = $("#capture-form");
  const observedAt = $("#observed-at");

  let battle = {
    step: "lobby", // lobby | party | resolving | results
    mode: "casual",
    habitat: "tree",
    opponent: null,
    opponentRating: null,
    partyIds: [],
    foeParty: [],
    lastResult: null,
    searching: false,
    invitePending: false,
    inviteId: null,
  };

  const DEMO_LEADERBOARD = [
    { rank: 1, username: "apexkite", rating: 1842, region: "JP" },
    { rank: 2, username: "reefpulse", rating: 1795, region: "AU" },
    { rank: 3, username: "trailfox", rating: 1710, region: "HK" },
    { rank: 4, username: "meadowjay", rating: 1644, region: "UK" },
    { rank: 5, username: "crystalfern", rating: 1588, region: "US" },
    { rank: 6, username: "tidewalker", rating: 1520, region: "CA" },
    { rank: 7, username: "urbanotter", rating: 1462, region: "SG" },
    { rank: 8, username: "alpinejay", rating: 1398, region: "CH" },
  ];

  async function boot() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      catalogue = await res.json();
    } catch (err) {
      console.error("Failed to load catalogue-demo.json", err);
      showToast("Demo data failed to load");
      catalogue = { meta: { demo: true, slotCount: 12 }, speciesCards: [], demoUser: null };
    }

    speciesCards = (Array.isArray(catalogue.speciesCards) ? catalogue.speciesCards : []).map((c) => ({
      ...c,
      habitatAffinity: normalizeHabitatAffinity(c.habitatAffinity),
    }));
    SLOT_COUNT = catalogue.meta?.slotCount || 12;
    XP = { ...DEFAULT_XP, ...(catalogue.meta?.xp || {}) };

    state = loadState();
    setDefaultDatetime();
    bindAuth();
    bindCapture();
    bindConfirm();
    bindNav();
    bindFriends();
    bindLogout();

    if (window.NatureApi && window.NatureApi.getToken()) {
      try {
        const remote = await window.NatureApi.me();
        if (remote.ok && remote.username) {
          applyRemoteSession(remote.username, remote);
          saveState();
          enterApp();
          return;
        }
        if (remote.status === 401) window.NatureApi.logout();
      } catch (_) {
        /* keep local */
      }
    }

    if (state.user) {
      enterApp();
    } else {
      showScreen("auth");
    }
  }

  function setDefaultDatetime() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    observedAt.value = local.toISOString().slice(0, 16);
  }

  function emptySlots() {
    return Array.from({ length: SLOT_COUNT }, (_, i) => ({
      slotId: `slot-${i + 1}`,
      taxonId: null,
      status: "empty",
      firstSeenAt: null,
      photoRef: null,
      sightingId: null,
    }));
  }

  function emptyState() {
    return {
      user: null,
      slots: emptySlots(),
      sightings: [],
      progress: {
        xpTotal: 0,
        streakDays: 0,
        lastConfirmDay: null,
        badges: [],
      },
      friends: DEMO_FRIENDS_SEED.map((f) => ({ ...f })),
      friendRequests: DEMO_REQUESTS_SEED.map((r) => ({ ...r })),
      battleInvites: [
        {
          id: "inv-demo-1",
          from: "trailfox",
          to: "you",
          habitat: "tree",
          mode: "casual",
          status: "incoming",
          createdAt: new Date().toISOString(),
        },
      ],
      rating: 1000,
    };
  }

  function seedFromDemoUser() {
    const du = catalogue?.demoUser;
    if (!du) return emptyState();
    const slots =
      Array.isArray(du.slots) && du.slots.length === SLOT_COUNT
        ? du.slots.map((s) => ({ ...s }))
        : emptySlots();
    return {
      user: null,
      slots,
      sightings: Array.isArray(du.sightings) ? du.sightings.map((s) => ({ ...s })) : [],
      progress: {
        xpTotal: du.progress?.xpTotal ?? 0,
        streakDays: du.progress?.streakDays ?? 0,
        lastConfirmDay: du.progress?.lastConfirmDay ?? null,
        badges: Array.isArray(du.progress?.badges) ? [...du.progress.badges] : [],
      },
      friends: DEMO_FRIENDS_SEED.map((f) => ({ ...f })),
      friendRequests: DEMO_REQUESTS_SEED.map((r) => ({ ...r })),
      battleInvites: [],
      rating: 1000,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return normalizeState(parsed);
      }
    } catch (_) {
      /* ignore */
    }
    return emptyState();
  }

  function normalizeState(s) {
    const base = emptyState();
    return {
      ...base,
      ...s,
      slots: Array.isArray(s.slots) && s.slots.length === SLOT_COUNT ? s.slots : base.slots,
      sightings: Array.isArray(s.sightings) ? s.sightings : [],
      progress: { ...base.progress, ...(s.progress || {}) },
      friends: Array.isArray(s.friends) ? s.friends : base.friends,
      friendRequests: Array.isArray(s.friendRequests) ? s.friendRequests : base.friendRequests,
      battleInvites: Array.isArray(s.battleInvites) ? s.battleInvites : base.battleInvites,
      rating: typeof s.rating === "number" ? s.rating : base.rating,
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function showScreen(name) {
    screenAuth.classList.toggle("is-hidden", name !== "auth");
    screenApp.classList.toggle("is-hidden", name !== "app");
  }

  function showPanel(name) {
    $$(".panel").forEach((p) => {
      const on = p.dataset.panel === name;
      p.hidden = !on;
      p.classList.toggle("is-active", on);
    });
    $$(".tab").forEach((t) => {
      const activeNav = name === "confirm" ? "capture" : name === "detail" ? "dex" : name;
      const isActive = t.dataset.nav === activeNav;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function enterApp() {
    userChip.textContent = state.user.username;
    showScreen("app");
    renderProgress();
    renderDex();
    showPanel("capture");
  }

  function updateAuthSubmitLabel() {
    authSubmit.textContent = authMode === "signup" ? "Sign up" : "Log in";
  }

  function bindAuth() {
    $$(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        authMode = tab.dataset.authMode;
        $$(".auth-tab").forEach((t) => {
          const on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        updateAuthSubmitLabel();
      });
    });

    const pwdInput = $("#auth-password");
    const pwdToggle = $("#btn-password-toggle");
    if (pwdToggle && pwdInput) {
      pwdToggle.addEventListener("click", () => {
        const showing = pwdInput.type === "text";
        pwdInput.type = showing ? "password" : "text";
        pwdToggle.textContent = showing ? "Show" : "Hide";
        pwdToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        pwdToggle.setAttribute("aria-pressed", showing ? "false" : "true");
      });
    }

    updateAuthSubmitLabel();

    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = $("#auth-username").value.trim();
      const password = $("#auth-password").value;
      if (!username || password.length < 4) {
        showToast("Enter a username and password (4+ chars)");
        return;
      }

      authSubmit.disabled = true;
      try {
        const api = window.NatureApi;
        let remote = null;
        if (api) {
          remote =
            authMode === "signup"
              ? await api.register(username, password)
              : await api.login(username, password);
        }

        if (remote && remote.ok && remote.token) {
          applyRemoteSession(username, remote);
          showToast(
            authMode === "signup" ? `Welcome, ${username}` : `Logged in as ${username}`
          );
          saveState();
          enterApp();
          return;
        }

        if (remote && api && api.apiAvailable(remote) && remote.error) {
          showToast(remote.error);
          return;
        }

        // Fallback: local demo (API unbound / offline)
        const isFresh =
          !state.user &&
          state.sightings.length === 0 &&
          state.slots.every((s) => s.status === "empty");
        state.user = { username, demo: true, localOnly: true };

        if (isFresh && username.toLowerCase() === "demo" && catalogue?.demoUser) {
          const seeded = seedFromDemoUser();
          state.slots = seeded.slots;
          state.sightings = seeded.sightings;
          state.progress = seeded.progress;
          state.user = { username, demo: true, localOnly: true };
          showToast(`Logged in as ${username} (local demo)`);
        } else {
          showToast(
            authMode === "signup"
              ? `Welcome, ${username} (local — API not live yet)`
              : `Logged in as ${username} (local)`
          );
        }

        saveState();
        enterApp();
      } finally {
        authSubmit.disabled = false;
      }
    });
  }

  function applyRemoteSession(username, remote) {
    const progress = remote.progress || {};
    state.user = { username, demo: false, remote: true };
    if (Array.isArray(progress.slots) && progress.slots.length) {
      state.slots = progress.slots;
    }
    state.progress = {
      xpTotal: progress.xpTotal ?? 0,
      streakDays: progress.streakDays ?? 0,
      lastConfirmDay: progress.lastConfirmDay ?? null,
      badges: Array.isArray(progress.badges) ? [...progress.badges] : [],
    };
    if (Array.isArray(remote.sightings)) {
      state.sightings = remote.sightings;
    }
  }

  function bindLogout() {
    $("#btn-logout").addEventListener("click", () => {
      if (window.NatureApi) window.NatureApi.logout();
      state.user = null;
      saveState();
      pendingSighting = null;
      photoDataUrl = null;
      photoFile = null;
      resetCaptureForm();
      showScreen("auth");
      showToast("Logged out");
    });
  }

  function bindCapture() {
    photoDrop.addEventListener("click", () => photoInput.click());
    photoDrop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        photoInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((ev) => {
      photoDrop.addEventListener(ev, (e) => {
        e.preventDefault();
        photoDrop.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      photoDrop.addEventListener(ev, (e) => {
        e.preventDefault();
        photoDrop.classList.remove("is-dragover");
      });
    });
    photoDrop.addEventListener("drop", (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handlePhotoFile(file);
    });

    photoInput.addEventListener("change", () => {
      const file = photoInput.files?.[0];
      if (file) handlePhotoFile(file);
    });

    captureForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!photoDataUrl) {
        showToast("Add a photo first");
        photoDrop.focus();
        return;
      }
      runIdentify();
    });
  }

  function emptyPhotoMarkup() {
    return `
      <div class="photo-icon" aria-hidden="true">📷</div>
      <strong>Add a photo to identify</strong>
      <span class="muted small">Tap or drop an image — required</span>
      <span class="photo-cta-chip">Choose photo</span>`;
  }

  async function handlePhotoFile(file) {
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image");
      return;
    }
    try {
      if (window.NatureApi && window.NatureApi.readExifDateTime) {
        const exifWhen = await window.NatureApi.readExifDateTime(file);
        if (exifWhen && observedAt) {
          // datetime-local wants YYYY-MM-DDTHH:MM
          observedAt.value = exifWhen.slice(0, 16);
        }
      }
      if (window.NatureApi) {
        const encoded = await window.NatureApi.encodePhoto(file);
        const type = encoded.contentType || "image/jpeg";
        const name =
          type === "image/png" ? "sighting.png" : type === "image/webp" ? "sighting.webp" : "sighting.jpg";
        photoFile = new File([encoded.blob], name, { type });
        photoDataUrl = URL.createObjectURL(encoded.blob);
        if (encoded.belowGuideFloor) {
          showToast("Photo is soft for ID — try closer / sharper if you can");
        }
      } else {
        photoFile = file;
        photoDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      photoDrop.classList.add("has-photo");
      photoDrop.classList.remove("is-empty");
      photoPreview.innerHTML = `<img src="${photoDataUrl}" alt="Sighting photo preview" />`;
      btnIdentify.disabled = false;
    } catch (err) {
      photoFile = null;
      photoDataUrl = null;
      showToast(err.message || "Could not read photo");
    }
  }

  function resetCaptureForm() {
    captureForm.reset();
    setDefaultDatetime();
    photoDataUrl = null;
    photoFile = null;
    photoInput.value = "";
    photoDrop.classList.remove("has-photo");
    photoDrop.classList.add("is-empty");
    photoPreview.innerHTML = emptyPhotoMarkup();
    btnIdentify.disabled = true;
    const more = $("#more-details");
    if (more) more.open = false;
  }

  function cardSeason(card) {
    return card.seasonality || card.season || "—";
  }

  function unknownCard(extra) {
    return {
      id: "demo-unknown",
      commonName: "Unidentified from photo",
      scientificName: "— (needs Species Guide)",
      averageSize: "Not measured from photo",
      nativeRange: "Unknown until confirmed ID",
      habitat: "As logged by observer",
      seasonality: "—",
      lookalikes: ["Needs clearer photo", "Species Guide review"],
      caution: "Provisional visual read — not a field ID",
      emoji: "❓",
      _confidence: "unknown",
      _fromPhoto: true,
      ...(extra || {}),
    };
  }

  /** Score shared cards against a visual read of the uploaded photo (not random). */
  function scoreCardForVisual(card, visual) {
    let score = 0;
    const hay = `${card.commonName || ""} ${card.habitat || ""} ${card.scientificName || ""} ${(card.lookalikes || []).join(" ")}`.toLowerCase();
    (visual.keywords || []).forEach((k) => {
      if (hay.includes(k)) score += 3;
    });
    const aff = normalizeHabitatAffinity(card.habitatAffinity);
    if (visual.habitatGuess && aff.includes(visual.habitatGuess)) score += 4;
    if (visual.kind === "plant" && /tree|plant|fung|moss|leaf|wood|redwood|agaric/.test(hay)) score += 2;
    if (visual.kind === "animal" && /bird|fox|otter|butterfly|starfish|insect|robin|monarch|animal/.test(hay)) score += 2;
    if (visual.kind === "water" && /ocean|tide|star|fish|marine|water|wetland/.test(hay)) score += 2;
    return score;
  }

  function pickCardFromVisual(visual) {
    const pool = (speciesCards || []).filter((s) => s.id !== "demo-unknown");
    if (!pool.length) return unknownCard({ habitat: visual.habitatLabel || "As logged by observer" });

    let best = null;
    let bestScore = -1;
    pool.forEach((c) => {
      const s = scoreCardForVisual(c, visual);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    });

    if (!best || bestScore < 2) {
      return unknownCard({
        habitat: visual.habitatLabel || "As logged by observer",
        averageSize: visual.sizeHint || "Not measured from photo",
        lookalikes: visual.keywords.slice(0, 3).map((k) => `Photo cue: ${k}`),
      });
    }

    const conf = bestScore >= 6 ? "likely" : bestScore >= 3 ? "unsure" : "unknown";
    return {
      ...best,
      _confidence: conf,
      _fromPhoto: true,
      _visualScore: bestScore,
      habitat: best.habitat || visual.habitatLabel,
      caution:
        (best.caution ? `${best.caution} · ` : "") +
        "Matched from your photo cues — Species Guide still owns final facts.",
    };
  }

  function analyzePhotoDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const canvas = document.createElement("canvas");
        const maxEdge = 120;
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve({ kind: "unknown", keywords: [], habitatGuess: null, habitatLabel: "As logged", sizeHint: `${w}×${h}px frame` });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let r = 0, g = 0, b = 0, n = 0;
        let greenish = 0, blueish = 0, brownish = 0, bright = 0, dark = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2], pa = data[i + 3];
          if (pa < 20) continue;
          r += pr; g += pg; b += pb; n++;
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const lum = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
          if (lum > 200) bright++;
          if (lum < 50) dark++;
          if (pg > pr + 12 && pg > pb + 8) greenish++;
          if (pb > pr + 10 && pb >= pg) blueish++;
          if (pr > 70 && pg > 40 && pb < 70 && pr >= pg && (pr - pb) > 25) brownish++;
        }
        if (!n) {
          resolve({ kind: "unknown", keywords: ["empty"], habitatGuess: null, habitatLabel: "As logged", sizeHint: `${w}×${h}px frame` });
          return;
        }
        r /= n; g /= n; b /= n;
        const gShare = greenish / n;
        const bShare = blueish / n;
        const brShare = brownish / n;
        const keywords = [];
        let kind = "unknown";
        let habitatGuess = null;
        let habitatLabel = "Mixed / unclear from photo";

        if (bShare > 0.22 && b > g && b > r) {
          kind = "water";
          habitatGuess = "ocean";
          habitatLabel = "Blue / water-heavy frame — possible shore or wetland";
          keywords.push("water", "ocean", "tide", "blue");
        } else if (gShare > 0.2) {
          kind = "plant";
          habitatGuess = brShare > 0.12 ? "tree" : "grassland";
          habitatLabel = habitatGuess === "tree" ? "Green + woody tones — woodland / tree" : "Green open frame — meadow / grassland";
          keywords.push("green", "leaf", "plant", habitatGuess === "tree" ? "tree" : "meadow");
        } else if (brShare > 0.18) {
          kind = "animal";
          habitatGuess = "urban";
          habitatLabel = "Warm earth tones — possible animal / ground subject";
          keywords.push("brown", "animal", "fur", "ground");
        } else if (bright / n > 0.45) {
          kind = "animal";
          habitatGuess = "urban";
          habitatLabel = "Bright open frame — park / urban possible";
          keywords.push("bright", "open", "urban");
        } else if (dark / n > 0.4) {
          kind = "plant";
          habitatGuess = "tree";
          habitatLabel = "Dark canopy-like frame — forest / shade";
          keywords.push("dark", "shade", "forest");
        } else {
          keywords.push("subject", "field");
        }

        // Aspect: tall subjects vs wide landscapes
        if (h > w * 1.25) keywords.push("portrait");
        if (w > h * 1.35) keywords.push("wide");

        resolve({
          kind,
          keywords,
          habitatGuess,
          habitatLabel,
          sizeHint: `Photo frame ${w}×${h}px`,
          avgColor: { r: Math.round(r), g: Math.round(g), b: Math.round(b) },
        });
      };
      img.onerror = () =>
        resolve({ kind: "unknown", keywords: [], habitatGuess: null, habitatLabel: "As logged", sizeHint: "—" });
      img.src = dataUrl;
    });
  }

  async function runIdentify() {
    if (!photoDataUrl) {
      showToast("Add a photo first");
      return;
    }
    const place = $("#place-label").value.trim();
    const when = $("#observed-at").value;
    const notes = $("#notes").value.trim();
    const tagsRaw = $("#tags").value.trim();
    const privacy = $("#privacy").value || "private";

    const form = $("#capture-form");
    form?.classList.add("identify-busy");
    if (btnIdentify) {
      btnIdentify.disabled = true;
      const lab = btnIdentify.querySelector(".btn-identify-label");
      if (lab) lab.textContent = "Reading photo";
    }
    showToast("Generating card from your photo…");

    let sample;
    try {
      const visual = await analyzePhotoDataUrl(photoDataUrl);
      sample = pickCardFromVisual(visual);
      // Fold place notes into habitat line when visual is weak
      if (sample._confidence === "unknown" && place) {
        sample = {
          ...sample,
          habitat: `${sample.habitat} · logged at ${place}`,
        };
      }
    } catch (err) {
      console.error(err);
      sample = unknownCard();
    } finally {
      form?.classList.remove("identify-busy");
      if (btnIdentify) {
        const lab = btnIdentify.querySelector(".btn-identify-label");
        if (lab) lab.textContent = "Identify";
        btnIdentify.disabled = false;
      }
    }

    pendingSighting = {
      id: `sight-${Date.now()}`,
      photoRefs: [photoDataUrl],
      place: { label: place, lat: null, lng: null, precision: "label-only" },
      observedAt: when ? new Date(when).toISOString() : new Date().toISOString(),
      notes: notes || null,
      tags: tagsRaw
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      idConfidence: sample._confidence,
      speciesRef: sample.id,
      lookalikeRefs: (sample.lookalikes || []).slice(),
      privacy,
      sampleMeta: sample,
      habitatAffinity: normalizeHabitatAffinity(sample.habitatAffinity),
      confirmed: false,
      xpAwarded: 0,
      fromPhoto: true,
    };

    renderConfirm(pendingSighting);
    showPanel("confirm");
  }

  function bindConfirm() {
    $("#btn-confirm").addEventListener("click", () => commitSighting("confirmed"));
    $("#btn-unsure").addEventListener("click", () => {
      if (pendingSighting) {
        pendingSighting.idConfidence = "unsure";
        pendingSighting.sampleMeta = {
          ...pendingSighting.sampleMeta,
          _confidence: "unsure",
        };
      }
      commitSighting("uncertain");
    });
    $("#btn-edit").addEventListener("click", () => {
      showPanel("capture");
      showToast("Edit your log, then Identify again");
    });
    $("#btn-new-log").addEventListener("click", () => {
      resetCaptureForm();
      showPanel("capture");
    });
    $("#btn-detail-back").addEventListener("click", () => showPanel("dex"));
  }

  function renderLookalikesQuiet(container, lookalikes) {
    container.innerHTML = "";
    if (!lookalikes?.length) return;
    const lab = document.createElement("div");
    lab.className = "lookalike-label";
    lab.textContent = "Lookalikes";
    container.appendChild(lab);
    const ul = document.createElement("ul");
    ul.className = "lookalike-list";
    lookalikes.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  function formatPopulation(m) {
    const est = (m.populationEstimate || "").trim();
    if (!est) return { label: "Unknown", note: "", conf: "unknown" };
    const conf = m.populationConfidence || "unknown";
    const src = (m.populationSource || "").trim();
    const noteParts = [];
    if (conf && conf !== "unknown") noteParts.push(`Confidence: ${conf}`);
    if (src) noteParts.push(`Source: ${src}`);
    else noteParts.push("Sourced estimate — not a census headcount");
    return { label: est, note: noteParts.join(" · "), conf };
  }

  function renderPopulationFields(m) {
    const pop = formatPopulation(m || {});
    const dd = $("#confirm-population");
    const note = $("#confirm-population-note");
    if (dd) dd.textContent = pop.label;
    if (note) {
      if (pop.note) {
        note.hidden = false;
        note.textContent = pop.note;
      } else {
        note.hidden = true;
        note.textContent = "";
      }
    }
  }

  function populationDetailHtml(m) {
    const pop = formatPopulation(m || {});
    const note = pop.note
      ? `<p class="muted small pop-note">${escapeHtml(pop.note)}</p>`
      : "";
    return `<div class="fact-span"><dt>Est. population</dt><dd>${escapeHtml(pop.label)}</dd></div>${note}`;
  }

  function fighterThumb(f) {
    if (f.photoRef) {
      return `<div class="fighter-emoji has-photo"><img src="${f.photoRef}" alt="" /></div>`;
    }
    return `<div class="fighter-emoji">${escapeHtml(f.emoji || "🐾")}</div>`;
  }

  function habitatLabel(id) {
    const h = HABITATS.find((x) => x.id === id);
    return h ? `${h.icon} ${h.label}` : id || "—";
  }

  function renderConfirm(s) {
    const m = s.sampleMeta;
    const card = $("#confirm-card");
    card.classList.add("is-provisional");
    card.classList.remove("is-locked");

    const photoEl = $("#confirm-photo");
    if (s.photoRefs[0]) {
      photoEl.innerHTML = `<img src="${s.photoRefs[0]}" alt="Logged photo" />`;
    } else {
      photoEl.innerHTML = `<span class="ph-fallback">${m.emoji || "🌿"}</span>`;
    }
    $("#confirm-common").textContent = m.commonName;
    $("#confirm-scientific").textContent = m.scientificName;
    const badge = $("#confirm-confidence");
    badge.textContent = s.idConfidence;
    badge.dataset.level = s.idConfidence;
    $("#confirm-size").textContent = m.averageSize;
    $("#confirm-range").textContent = m.nativeRange || m.originRange || "—";
    $("#confirm-habitat").textContent = m.habitat;
    $("#confirm-season").textContent = cardSeason(m);
    renderPopulationFields(m);
    $("#confirm-place").textContent = `${s.place.label} · ${formatWhen(s.observedAt)}`;
    renderLookalikesQuiet($("#confirm-lookalikes"), m.lookalikes);
    const disc = $("#confirm-disclaimer");
    if (disc) {
      if (s.fromPhoto || m._fromPhoto) {
        disc.textContent = m.caution
          || "Generated from your photo cues — Species Guide confirms real taxon facts.";
      } else {
        disc.textContent = m.caution
          ? `SAMPLE facts · Caution: ${m.caution}`
          : "Facts above are SAMPLE placeholders for the prototype.";
      }
    }
  }

  function formatWhen(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  function commitSighting(status) {
    if (!pendingSighting) return;
    const s = { ...pendingSighting, confirmed: true, status };
    if (s.sampleMeta) {
      s.sampleMeta = {
        ...s.sampleMeta,
        habitatAffinity: normalizeHabitatAffinity(s.sampleMeta.habitatAffinity),
      };
    }
    s.habitatAffinity = normalizeHabitatAffinity(
      s.habitatAffinity || s.sampleMeta?.habitatAffinity || []
    );
    if (status === "uncertain") s.idConfidence = "unsure";
    if (status === "confirmed" && s.idConfidence !== "unknown" && s.idConfidence !== "unsure") {
      s.idConfidence = "confirmed";
    }

    let xpGain = XP.confirm + XP.photo;
    const existingSlot = state.slots.find((sl) => sl.taxonId === s.speciesRef && sl.status !== "empty");
    let filledNew = false;

    if (!existingSlot) {
      const empty = state.slots.find((sl) => sl.status === "empty");
      if (empty) {
        empty.taxonId = s.speciesRef;
        empty.status = status === "uncertain" ? "uncertain" : "filled";
        empty.firstSeenAt = s.observedAt;
        empty.photoRef = s.photoRefs[0];
        empty.sightingId = s.id;
        filledNew = true;
        xpGain += XP.newSlot;
      }
    }

    const streakGain = updateStreak();
    if (streakGain) xpGain += XP.streakDay;

    const newBadges = checkBadges();
    xpGain += newBadges.length * XP.badge;

    s.xpAwarded = xpGain;
    state.progress.xpTotal += xpGain;
    state.sightings.unshift(s);
    saveState();

    pendingSighting = null;
    const fileForUpload = photoFile;
    resetCaptureForm();
    renderProgress();
    renderDex();
    showPanel("dex");

    const parts = [`+${xpGain} XP`];
    if (filledNew) parts.push("new slot");
    if (streakGain) parts.push("streak");
    if (newBadges.length) parts.push(`badge ×${newBadges.length}`);
    showToast(`Collected · ${parts.join(" · ")}`);

    syncSightingRemote(s, fileForUpload);
  }

  async function syncSightingRemote(sighting, file) {
    const api = window.NatureApi;
    if (!api || !state.user || state.user.localOnly || !api.getToken()) return;
    try {
      let photoId = null;
      if (file) {
        const up = await api.uploadPhoto(file);
        if (up.ok && up.photoId) photoId = up.photoId;
        else if (up.error && api.apiAvailable(up)) {
          showToast(`Photo sync: ${up.error}`);
        }
      }
      const payload = {
        id: sighting.id,
        photoId,
        place: sighting.place,
        observedAt: sighting.observedAt,
        notes: sighting.notes,
        tags: sighting.tags,
        idConfidence: sighting.idConfidence,
        speciesRef: sighting.speciesRef,
        lookalikeRefs: sighting.lookalikeRefs,
        privacy: sighting.privacy || "private",
        status: sighting.status,
        xpAwarded: sighting.xpAwarded,
        sampleMeta: sighting.sampleMeta
          ? {
              id: sighting.sampleMeta.id,
              commonName: sighting.sampleMeta.commonName,
              scientificName: sighting.sampleMeta.scientificName,
              emoji: sighting.sampleMeta.emoji,
            }
          : null,
      };
      const created = await api.createSighting(payload);
      if (created.ok && created.sighting) {
        const idx = state.sightings.findIndex((x) => x.id === sighting.id);
        if (idx >= 0) state.sightings[idx] = { ...state.sightings[idx], ...created.sighting };
      }
      await api.putProgress({
        xpTotal: state.progress.xpTotal,
        streakDays: state.progress.streakDays,
        lastConfirmDay: state.progress.lastConfirmDay,
        badges: state.progress.badges,
        slots: state.slots,
      });
      saveState();
    } catch (err) {
      console.warn("Nature remote sync failed", err);
    }
  }

  function updateStreak() {
    const today = dayKey(new Date());
    const last = state.progress.lastConfirmDay;
    if (last === today) return false;
    if (last && isYesterday(last, today)) {
      state.progress.streakDays += 1;
    } else {
      state.progress.streakDays = 1;
    }
    state.progress.lastConfirmDay = today;
    return true;
  }

  function dayKey(d) {
    return d.toISOString().slice(0, 10);
  }

  function isYesterday(lastKey, todayKey) {
    const t = new Date(todayKey + "T12:00:00");
    const y = new Date(t);
    y.setDate(y.getDate() - 1);
    return dayKey(y) === lastKey;
  }

  function checkBadges() {
    const filled = state.slots.filter((s) => s.status !== "empty").length;
    const earned = [];
    BADGE_DEFS.forEach((b) => {
      if (state.progress.badges.includes(b.id)) return;
      if (b.needSlots && filled >= b.needSlots) {
        state.progress.badges.push(b.id);
        earned.push(b);
      }
      if (b.needStreak && state.progress.streakDays >= b.needStreak) {
        state.progress.badges.push(b.id);
        earned.push(b);
      }
    });
    return earned;
  }

  function findCard(id) {
    return speciesCards.find((s) => s.id === id) || speciesCards.find((s) => s.id === "demo-unknown") || null;
  }

  function renderProgress() {
    $("#stat-xp").textContent = String(state.progress.xpTotal);
    $("#stat-streak").textContent = String(state.progress.streakDays);
    const filled = state.slots.filter((s) => s.status !== "empty").length;
    $("#stat-slots").textContent = `${filled}/${SLOT_COUNT}`;

    const row = $("#badges-row");
    row.innerHTML = "";
    BADGE_DEFS.forEach((b) => {
      const el = document.createElement("span");
      el.className = "badge-pill" + (state.progress.badges.includes(b.id) ? "" : " is-empty");
      el.title = b.label;
      el.textContent = b.icon;
      row.appendChild(el);
    });
  }

  function renderDex() {
    const grid = $("#dex-grid");
    grid.innerHTML = "";

    const filledSlots = state.slots.filter((s) => s.status !== "empty");
    const emptyCount = state.slots.filter((s) => s.status === "empty").length;

    if (filledSlots.length === 0) {
      const hero = document.createElement("button");
      hero.type = "button";
      hero.className = "dex-hero";
      hero.innerHTML = `
        <span class="dex-hero-icon" aria-hidden="true">📷</span>
        <strong>Log your first sighting</strong>
        <span class="muted">Photo → Identify → Confirm to fill a slot</span>`;
      hero.addEventListener("click", () => {
        resetCaptureForm();
        showPanel("capture");
      });
      grid.appendChild(hero);

      for (let i = 0; i < EMPTY_SLOTS_SHOWN; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot is-empty";
        btn.disabled = true;
        btn.innerHTML = `
          <span class="slot-silhouette" aria-hidden="true">🌿</span>
          <span class="slot-num">#${String(i + 1).padStart(2, "0")}</span>`;
        grid.appendChild(btn);
      }
      const more = document.createElement("p");
      more.className = "dex-empty-more";
      more.textContent = `${SLOT_COUNT - EMPTY_SLOTS_SHOWN} more empty slots`;
      grid.appendChild(more);
      return;
    }

    filledSlots.forEach((slot) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.dataset.slotId = slot.slotId;

      const sample = findCard(slot.taxonId) || {
        commonName: "SAMPLE: Unknown",
        emoji: "❓",
      };
      const sight = state.sightings.find((x) => x.id === slot.sightingId);
      const conf = sight?.idConfidence || (slot.status === "uncertain" ? "unsure" : "likely");
      const thumb = slot.photoRef
        ? `<img class="slot-thumb" src="${slot.photoRef}" alt="" />`
        : `<div class="slot-thumb-ph">${sample.emoji || "🌿"}</div>`;
      btn.innerHTML = `
        <span class="slot-conf" data-level="${conf}" title="${conf}"></span>
        ${thumb}
        <span class="slot-name">${escapeHtml(shortName(sample.commonName))}</span>`;
      btn.addEventListener("click", () => openDetail(slot));
      grid.appendChild(btn);
    });

    const emptyToShow = Math.min(EMPTY_SLOTS_SHOWN, emptyCount);
    const emptySlots = state.slots.filter((s) => s.status === "empty");
    for (let i = 0; i < emptyToShow; i++) {
      const slot = emptySlots[i];
      const idx = state.slots.indexOf(slot);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot is-empty";
      btn.disabled = true;
      btn.innerHTML = `
        <span class="slot-silhouette" aria-hidden="true">🌿</span>
        <span class="slot-num">#${String(idx + 1).padStart(2, "0")}</span>`;
      grid.appendChild(btn);
    }

    const remaining = emptyCount - emptyToShow;
    if (remaining > 0) {
      const more = document.createElement("p");
      more.className = "dex-empty-more";
      more.textContent = `${remaining} empty`;
      grid.appendChild(more);
    }
  }

  function shortName(name) {
    return String(name).replace(/^SAMPLE:\s*/i, "").replace(/^Sample:\s*/i, "");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openDetail(slot) {
    const sample = findCard(slot.taxonId) || {
      commonName: "SAMPLE: Unknown",
      scientificName: "—",
      averageSize: "—",
      nativeRange: "—",
      habitat: "—",
      seasonality: "—",
      lookalikes: [],
      caution: "Demo",
      emoji: "❓",
    };
    const sight = state.sightings.find((x) => x.id === slot.sightingId);
    const conf = sight?.idConfidence || (slot.status === "uncertain" ? "unsure" : "likely");
    $("#detail-title").textContent = sample.commonName;

    const photoHtml = slot.photoRef
      ? `<img src="${slot.photoRef}" alt="Sighting photo" />`
      : `<span class="ph-fallback">${sample.emoji || "🌿"}</span>`;

    const lookList = (sample.lookalikes || [])
      .map((n) => `<li>${escapeHtml(n)}</li>`)
      .join("");

    $("#detail-card").className = "confirm-card detail-card is-locked";
    $("#detail-card").innerHTML = `
      <div class="confirm-photo">${photoHtml}</div>
      <div class="confirm-body">
        <div class="name-row">
          <div class="name-block">
            <h3>${escapeHtml(sample.commonName)}</h3>
            <p class="scientific">${escapeHtml(sample.scientificName)}</p>
          </div>
          <span class="confidence-badge" data-level="${conf}">${conf}</span>
        </div>
        <p class="sample-banner" style="margin-top:10px">Sample ID — not authoritative</p>
        <dl class="fact-grid">
          <div><dt>Avg. size</dt><dd>${escapeHtml(sample.averageSize || "—")}</dd></div>
          <div><dt>Native range</dt><dd>${escapeHtml(sample.nativeRange || sample.originRange || "—")}</dd></div>
          <div><dt>Habitat</dt><dd>${escapeHtml(sample.habitat || "—")}</dd></div>
          <div><dt>Season</dt><dd>${escapeHtml(cardSeason(sample))}</dd></div>
          ${populationDetailHtml(sample)}
        </dl>
        <div class="lookalikes quiet">
          <div class="lookalike-label">Lookalikes</div>
          <ul class="lookalike-list">${lookList}</ul>
        </div>
        ${sample.caution ? `<p class="muted small">Caution: ${escapeHtml(sample.caution)}</p>` : ""}
        <p class="place-logged">${escapeHtml(sight?.place?.label || "—")} · ${sight ? formatWhen(sight.observedAt) : "—"}</p>
        ${sight?.notes ? `<p class="muted small" style="margin-top:8px">Notes: ${escapeHtml(sight.notes)}</p>` : ""}
        <p class="muted small" style="margin-top:8px">XP from this log: +${sight?.xpAwarded ?? 0}</p>
      </div>`;
    showPanel("detail");
  }

  function bindNav() {
    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const nav = tab.dataset.nav;
        if (nav === "capture") {
          showPanel("capture");
        } else if (nav === "dex") {
          renderDex();
          showPanel("dex");
        } else if (nav === "friends") {
          renderFriends();
          showPanel("friends");
        } else if (nav === "battle") {
          battle.step = "lobby";
          renderBattle();
          showPanel("battle");
        }
      });
    });
  }


  function bindFriends() {
    const form = $("#friend-add-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#friend-username");
      const name = (input.value || "").trim().toLowerCase();
      if (name.length < 2) return;
      if (state.user && name === String(state.user.username).toLowerCase()) {
        showToast("That's you");
        return;
      }
      if ((state.friends || []).some((f) => f.username.toLowerCase() === name)) {
        showToast("Already friends");
        return;
      }
      state.friendRequests = (state.friendRequests || []).filter(
        (r) => r.username.toLowerCase() !== name
      );
      state.friends = state.friends || [];
      state.friends.push({ username: name, status: "offline", pending: false });
      saveState();
      input.value = "";
      renderFriends();
      showToast(`Added @${name} (demo)`);
    });
  }

  function renderFriends() {
    const reqEl = $("#friend-requests");
    const listEl = $("#friend-list");
    if (!reqEl || !listEl) return;

    const inbound = (state.friendRequests || []).filter((r) => r.status !== "outgoing");
    if (!inbound.length) {
      reqEl.innerHTML = `<li class="empty-hint">No open requests</li>`;
    } else {
      reqEl.innerHTML = inbound
        .map(
          (r) => `
        <li class="friend-row" data-user="${escapeHtml(r.username)}">
          <div class="friend-avatar">${escapeHtml(r.username.slice(0, 1).toUpperCase())}</div>
          <div class="friend-meta">
            <div class="friend-name">@${escapeHtml(r.username)}</div>
            <div class="friend-status">Wants to be friends</div>
          </div>
          <div class="friend-actions">
            <button type="button" class="btn-chip" data-friend-act="accept">Accept</button>
            <button type="button" class="btn-chip is-danger" data-friend-act="decline">Decline</button>
          </div>
        </li>`
        )
        .join("");
    }

    const friends = state.friends || [];
    if (!friends.length) {
      listEl.innerHTML = `<li class="empty-hint">No friends yet — add by exact username</li>`;
    } else {
      listEl.innerHTML = friends
        .map((f) => {
          const online = f.status === "online";
          return `
        <li class="friend-row" data-user="${escapeHtml(f.username)}">
          <div class="friend-avatar">${escapeHtml(f.username.slice(0, 1).toUpperCase())}</div>
          <div class="friend-meta">
            <div class="friend-name">@${escapeHtml(f.username)}</div>
            <div class="friend-status ${online ? "is-online" : ""}">${online ? "Online" : "Offline"}</div>
          </div>
          <div class="friend-actions">
            <button type="button" class="btn-chip" data-friend-act="challenge">Challenge</button>
          </div>
        </li>`;
        })
        .join("");
    }

    reqEl.querySelectorAll("[data-friend-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".friend-row");
        const user = row?.dataset.user;
        const act = btn.dataset.friendAct;
        if (!user) return;
        if (act === "accept") {
          state.friendRequests = (state.friendRequests || []).filter((r) => r.username !== user);
          if (!(state.friends || []).some((f) => f.username === user)) {
            state.friends = state.friends || [];
            state.friends.push({ username: user, status: "online", pending: false });
          }
          saveState();
          renderFriends();
          showToast(`Friends with @${user}`);
        } else if (act === "decline") {
          state.friendRequests = (state.friendRequests || []).filter((r) => r.username !== user);
          saveState();
          renderFriends();
        }
      });
    });

    listEl.querySelectorAll('[data-friend-act="challenge"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const user = btn.closest(".friend-row")?.dataset.user;
        if (!user) return;
        battle.opponent = user;
        battle.mode = "casual";
        battle.step = "lobby";
        battle.invitePending = false;
        renderBattle();
        showPanel("battle");
        showToast(`Pick biome, then send invite to @${user}`);
      });
    });

    renderBattleInvites();
  }

  function renderBattleInvites() {
    const el = $("#battle-invites");
    if (!el) return;
    const me = state.user?.username || "you";
    const invites = (state.battleInvites || []).filter(
      (i) => i.status === "incoming" || i.status === "outgoing" || i.status === "pending"
    );
    if (!invites.length) {
      el.innerHTML = `<li class="empty-hint">No invites — Casual challenges send a biome invite (local demo)</li>`;
      return;
    }
    el.innerHTML = invites
      .map((inv) => {
        const incoming = inv.status === "incoming" || (inv.to === me || inv.to === "you");
        const other = incoming ? inv.from : inv.to;
        const hab = habitatLabel(inv.habitat);
        return `<li class="friend-row invite-card" data-invite="${escapeHtml(inv.id)}">
          <div class="friend-row-top">
            <div class="friend-avatar">${escapeHtml(String(other).slice(0, 1).toUpperCase())}</div>
            <div class="friend-meta">
              <div class="friend-name">${incoming ? "From" : "To"} @${escapeHtml(other)}</div>
              <div class="invite-biome" title="Selected biome">${hab} · ${(inv.mode || "casual")}</div>
            </div>
          </div>
          <div class="friend-actions">
            ${
              incoming
                ? `<button type="button" class="btn-chip" data-invite-act="accept">Accept</button>
                   <button type="button" class="btn-chip is-danger" data-invite-act="decline">Decline</button>`
                : `<button type="button" class="btn-chip is-ghost" data-invite-act="cancel">Cancel</button>
                   <span class="friend-status">Waiting · they see ${hab}</span>`
            }
          </div>
        </li>`;
      })
      .join("");

    el.querySelectorAll("[data-invite-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest("[data-invite]")?.dataset.invite;
        const act = btn.dataset.inviteAct;
        const inv = (state.battleInvites || []).find((i) => i.id === id);
        if (!inv) return;
        if (act === "accept") {
          inv.status = "accepted";
          battle.mode = inv.mode || "casual";
          battle.habitat = inv.habitat || "tree";
          battle.opponent = inv.from;
          battle.inviteId = inv.id;
          battle.invitePending = false;
          battle.partyIds = [];
          battle.step = "party";
          saveState();
          renderBattleInvites();
          renderBattle();
          showPanel("battle");
          showToast(`Accepted · biome ${habitatLabel(battle.habitat)}`);
        } else if (act === "decline" || act === "cancel") {
          state.battleInvites = (state.battleInvites || []).filter((i) => i.id !== id);
          saveState();
          renderBattleInvites();
          showToast(act === "cancel" ? "Invite canceled" : "Invite declined");
        }
      });
    });
  }

  function enrichFighter(cardOrSeed) {
    const seed = DEMO_FIGHTERS.find((d) => d.id === cardOrSeed.id) || {};
    return {
      id: cardOrSeed.id,
      commonName: cardOrSeed.commonName || seed.commonName || cardOrSeed.id,
      scientificName: cardOrSeed.scientificName || seed.scientificName || "",
      emoji: cardOrSeed.emoji || seed.emoji || "🐾",
      photoRef: cardOrSeed.photoRef || seed.photoRef || null,
      kind: cardOrSeed.kind || seed.kind || "other",
      types: cardOrSeed.types || seed.types || [],
      rarity: cardOrSeed.rarity || seed.rarity || "common",
      bp: cardOrSeed.bp ?? seed.bp ?? 0,
      habitatAffinity: normalizeHabitatAffinity(cardOrSeed.habitatAffinity || seed.habitatAffinity || []),
      source: cardOrSeed.source || "card",
    };
  }

  function collectAnimalRoster() {
    const cards = Array.isArray(catalogue?.speciesCards) ? catalogue.speciesCards : [];
    const fromCards = cards.map((c) => enrichFighter({ ...c, source: "card" }));
    const seeds = DEMO_FIGHTERS.map((d) => enrichFighter({ ...d, source: "demo" }));
    const fromSlots = (state.slots || [])
      .filter((s) => s.status === "filled" || s.status === "uncertain")
      .map((s) => {
        const card = findCard(s.taxonId) || { id: s.taxonId };
        const sight = (state.sightings || []).find((x) => x.id === s.sightingId);
        const photo =
          s.photoRef ||
          (sight && sight.photoRefs && sight.photoRefs[0]) ||
          null;
        return enrichFighter({ ...card, source: "slot", photoRef: photo });
      });

    const seen = new Set();
    const out = [];
    [...fromSlots, ...fromCards, ...seeds].forEach((f) => {
      if (!f.id || seen.has(f.id)) return;
      if (f.kind !== "animal" || !(f.bp > 0)) return;
      seen.add(f.id);
      out.push(f);
    });
    return out;
  }

  function matchupChips(types) {
    const strong = new Set();
    const weak = new Set();
    (types || []).forEach((t) => {
      const row = TYPE_CHART[t];
      if (!row) return;
      row.strong.forEach((x) => strong.add(x));
      row.weak.forEach((x) => weak.add(x));
    });
    [...strong].forEach((t) => {
      if (weak.has(t)) weak.delete(t);
    });
    return { strong: [...strong], weak: [...weak] };
  }

  function effectiveBp(fighter, habitatId) {
    const base = fighter.bp || 0;
    const buff =
      Array.isArray(fighter.habitatAffinity) && fighter.habitatAffinity.includes(habitatId);
    return { bp: buff ? Math.round(base * 1.15) : base, buffed: buff };
  }

  function bestMultiplier(atkTypes, defTypes) {
    let maxM = 1;
    (atkTypes || []).forEach((a) => {
      const row = TYPE_CHART[a];
      if (!row) return;
      (defTypes || []).forEach((d) => {
        let m = 1;
        if (row.strong.includes(d)) m = 1.6;
        else if (row.weak.includes(d)) m = 0.6;
        if (m > maxM) maxM = m;
      });
    });
    return maxM;
  }

  function pickFoeParty(roster) {
    const pool = roster.slice().sort(() => Math.random() - 0.5);
    return pool.slice(0, 3).map((f) => ({ ...f }));
  }

  function scoreParty(party, foe, habitatId) {
    let score = 0;
    party.forEach((mine, i) => {
      const theirs = foe[i] || foe[0];
      const myBp = effectiveBp(mine, habitatId).bp;
      const theirBp = effectiveBp(theirs, habitatId).bp;
      const mult = bestMultiplier(mine.types, theirs.types);
      const theirMult = bestMultiplier(theirs.types, mine.types);
      score += myBp * mult - theirBp * theirMult;
    });
    return score;
  }

  function renderBattle() {
    const root = $("#battle-flow");
    if (!root) return;
    const myRating = state.rating || 1000;

    if (battle.step === "lobby") {
      const friends = state.friends || [];
      const habitatLocked = !!battle.invitePending;
      const habitats = HABITATS.map(
        (h) =>
          `<button type="button" class="habitat-chip ${battle.habitat === h.id ? "is-active" : ""} ${habitatLocked ? "is-locked" : ""}" data-hab="${h.id}" ${habitatLocked ? "disabled aria-disabled=\"true\"" : ""}>${h.icon}<br>${escapeHtml(h.label)}</button>`
      ).join("");

      let middle = "";
      let ctaLabel = "Pick party of 3";
      let ctaDisabled = true;

      if (battle.mode === "casual") {
        const oppOptions = friends.length
          ? friends
              .map(
                (f) =>
                  `<button type="button" class="fighter-card ${battle.opponent === f.username ? "is-selected" : ""}" data-opp="${escapeHtml(f.username)}">
                  <div class="fighter-emoji">👤</div>
                  <div>
                    <div class="fighter-name">@${escapeHtml(f.username)}</div>
                    <div class="fighter-sub">${f.status === "online" ? "Online" : "Offline"} · friend challenge</div>
                  </div>
                  <span class="bp-pill">VS</span>
                </button>`
              )
              .join("")
          : `<div class="empty-hint">Add a friend first to challenge</div>`;
        middle = `<h3 class="section-label">Opponent (friends)</h3>
          <p class="muted small" style="margin-bottom:8px">Sends an invite — they see your biome before accepting</p>
          <div class="opponent-pick">${oppOptions}</div>`;
        ctaDisabled = !battle.opponent;
        ctaLabel = "Send battle invite";
        if (battle.invitePending && battle.opponent) {
          middle += `<div class="matchmake-card is-found" style="margin-top:12px">
            <strong>Invite sent to @${escapeHtml(battle.opponent)}</strong>
            <p>Biome: <span class="invite-biome">${habitatLabel(battle.habitat)}</span></p>
            <p class="muted small">They must accept before party select · waiting (demo)</p>
            <button type="button" class="btn btn-secondary btn-block" id="btn-sim-accept" style="margin-top:10px">Simulate their accept</button>
          </div>`;
          ctaDisabled = true;
          ctaLabel = "Waiting for accept";
        }
      } else {
        const board = DEMO_LEADERBOARD.map((row) => {
          const you = state.user && row.username === state.user.username;
          return `<li class="lb-row ${you ? "is-you" : ""}">
            <span class="lb-rank">#${row.rank}</span>
            <span class="lb-name">@${escapeHtml(row.username)}${you ? " · you" : ""}</span>
            <span class="lb-region">${escapeHtml(row.region)}</span>
            <span class="lb-elo">${row.rating}</span>
          </li>`;
        }).join("");
        const youOnBoard = DEMO_LEADERBOARD.find(
          (r) => state.user && r.username === state.user.username
        );
        const youRank = youOnBoard?.rank || "—";
        const stickyYou = `<li class="lb-row is-you lb-you-sticky" aria-label="Your worldwide rank">
            <span class="lb-rank">#${youRank}</span>
            <span class="lb-name">@${escapeHtml(state.user?.username || "you")} · you</span>
            <span class="lb-region">YOU</span>
            <span class="lb-elo">${myRating}</span>
          </li>`;
        const searchBlock = battle.searching
          ? `<div class="matchmake-card is-searching">
              <strong>Finding opponent…</strong>
              <p class="muted small">Worldwide · ±100 Elo of ${myRating}</p>
              <div class="matchmake-pulse" aria-hidden="true"></div>
            </div>`
          : battle.opponent
            ? `<div class="matchmake-card is-found">
              <strong>Match found</strong>
              <p>@${escapeHtml(battle.opponent)} · Elo ${battle.opponentRating ?? "—"}</p>
              <p class="muted small">Near your rating · worldwide queue (demo)</p>
            </div>`
            : `<div class="matchmake-card">
              <strong>Ranked queue</strong>
              <p class="muted small">Real online matchmaking by Elo · worldwide</p>
              <button type="button" class="btn btn-secondary btn-block" id="btn-find-match">Find match</button>
            </div>`;
        middle = `
          <div class="ranked-elo-bar">
            <div><span class="muted small">Your Elo</span><strong class="elo-num">${myRating}</strong></div>
            <div><span class="muted small">World rank</span><strong class="elo-num">#${youRank}</strong></div>
          </div>
          ${searchBlock}
          <h3 class="section-label">Worldwide leaderboard</h3>
          <ol class="leaderboard">${board}</ol>${stickyYou ? `<ol class="leaderboard lb-sticky-wrap">${stickyYou}</ol>` : ""}`;
        ctaDisabled = !battle.opponent || battle.searching;
        ctaLabel = battle.opponent ? "Pick party of 3" : "Find a match first";
      }

      root.innerHTML = `
        <div class="battle-layout">
          <div class="battle-scroll">
            <div class="mode-toggle" role="group" aria-label="Mode">
              <button type="button" class="mode-btn ${battle.mode === "casual" ? "is-active" : ""}" data-mode="casual">
                <strong>Casual</strong><span>Friends · no Elo change</span>
              </button>
              <button type="button" class="mode-btn ${battle.mode === "ranked" ? "is-active" : ""}" data-mode="ranked">
                <strong>Ranked</strong><span>Online Elo · world board</span>
              </button>
            </div>
            <div class="battle-wide-split">
              <div>
                <h3 class="section-label">Habitat field</h3>
                <div class="habitat-grid">${habitats}</div>
              </div>
              <div>${middle}</div>
            </div>
          </div>
          <div class="battle-sticky">
            <button type="button" class="btn btn-primary btn-block" id="btn-battle-continue" ${ctaDisabled ? "disabled" : ""}>${ctaLabel}</button>
          </div>
        </div>`;

      root.querySelectorAll("[data-mode]").forEach((b) =>
        b.addEventListener("click", () => {
          battle.mode = b.dataset.mode;
          battle.opponent = null;
          battle.opponentRating = null;
          battle.searching = false;
          renderBattle();
        })
      );
      root.querySelectorAll("[data-hab]").forEach((b) =>
        b.addEventListener("click", () => {
          battle.habitat = b.dataset.hab;
          renderBattle();
        })
      );
      root.querySelectorAll("[data-opp]").forEach((b) =>
        b.addEventListener("click", () => {
          battle.opponent = b.dataset.opp;
          battle.opponentRating = null;
          renderBattle();
        })
      );
      $("#btn-find-match")?.addEventListener("click", () => {
        battle.searching = true;
        battle.opponent = null;
        battle.opponentRating = null;
        renderBattle();
        setTimeout(() => {
          if (!battle.searching) return;
          const pool = DEMO_LEADERBOARD.filter(
            (r) => !state.user || r.username !== state.user.username
          );
          // Prefer closest Elo
          pool.sort(
            (a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating)
          );
          const pick = pool[0] || { username: "wanderer", rating: myRating };
          battle.searching = false;
          battle.opponent = pick.username;
          battle.opponentRating = pick.rating;
          renderBattle();
          showToast(`Matched @${pick.username}`);
        }, 1100);
      });
      $("#btn-sim-accept")?.addEventListener("click", () => {
        battle.invitePending = false;
        const inv = (state.battleInvites || []).find((i) => i.id === battle.inviteId);
        if (inv) inv.status = "accepted";
        (state.battleInvites || []).forEach((i) => {
          if (i._demoMirror && i.habitat === battle.habitat) i.status = "accepted";
        });
        saveState();
        battle.partyIds = [];
        battle.step = "party";
        renderBattle();
        showToast("Opponent accepted · pick your 3");
      });
      $("#btn-battle-continue")?.addEventListener("click", () => {
        if (!battle.opponent || battle.searching) return;
        if (battle.mode === "casual") {
          const inv = {
            id: `inv-${Date.now()}`,
            from: state.user?.username || "you",
            to: battle.opponent,
            habitat: battle.habitat,
            mode: "casual",
            status: "outgoing",
            createdAt: new Date().toISOString(),
          };
          state.battleInvites = state.battleInvites || [];
          state.battleInvites.unshift(inv);
          // Demo mirror: also show as incoming for the challenged persona in this browser
          state.battleInvites.unshift({
            ...inv,
            id: `${inv.id}-in`,
            status: "incoming",
            from: inv.from,
            to: "you",
            _demoMirror: true,
            habitat: inv.habitat,
          });
          saveState();
          battle.invitePending = true;
          battle.inviteId = inv.id;
          showToast(`Invite sent to @${battle.opponent} · biome ${habitatLabel(battle.habitat)}`);
          renderFriends();
          renderBattle();
          return;
        }
        battle.partyIds = [];
        battle.step = "party";
        renderBattle();
      });
      return;
    }

    if (battle.step === "party") {
      const roster = collectAnimalRoster();
      const selected = new Set(battle.partyIds);
      const cards = roster
        .map((f) => {
          const on = selected.has(f.id);
          const disabled = !on && selected.size >= 3;
          const { bp, buffed } = effectiveBp(f, battle.habitat);
          const types = (f.types || [])
            .map((t) => `<span class="type-chip">${escapeHtml(t)}</span>`)
            .join("");
          const label = (f.commonName || "").replace(/^SAMPLE:\s*/i, "");
          return `
            <button type="button" class="fighter-card ${on ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}" data-fighter="${escapeHtml(f.id)}">
              ${fighterThumb(f)}
              <div>
                <div class="fighter-name">${escapeHtml(label)}</div>
                <div class="type-chips">${types}</div>
                <div class="fighter-sub">${escapeHtml(f.rarity)} · animals only</div>
              </div>
              <span class="bp-pill ${buffed ? "is-buffed" : ""}">${bp} BP${buffed ? " +15%" : ""}</span>
            </button>`;
        })
        .join("");

      root.innerHTML = `
        <div class="battle-layout">
          <div class="battle-scroll">
            <button type="button" class="btn-back" id="btn-party-back">← Lobby</button>
            <p class="party-count">${selected.size}/3 fighters · animals only · biome locked: ${habitatLabel(battle.habitat)}</p>
            <div class="party-picker">${cards || '<div class="empty-hint">No animal fighters yet</div>'}</div>
          </div>
          <div class="battle-sticky">
            <button type="button" class="btn btn-primary btn-block" id="btn-start-fight" ${selected.size === 3 ? "" : "disabled"}>Enter battle</button>
          </div>
        </div>`;

      $("#btn-party-back")?.addEventListener("click", () => {
        battle.step = "lobby";
        renderBattle();
      });
      root.querySelectorAll("[data-fighter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.fighter;
          const idx = battle.partyIds.indexOf(id);
          if (idx >= 0) battle.partyIds.splice(idx, 1);
          else if (battle.partyIds.length < 3) battle.partyIds.push(id);
          renderBattle();
        });
      });
      $("#btn-start-fight")?.addEventListener("click", () => {
        if (battle.partyIds.length !== 3) return;
        const rosterNow = collectAnimalRoster();
        const party = battle.partyIds.map((id) => rosterNow.find((r) => r.id === id)).filter(Boolean);
        let foePool = rosterNow.filter((r) => !battle.partyIds.includes(r.id));
        if (foePool.length < 3) foePool = rosterNow.slice();
        battle.foeParty = pickFoeParty(foePool);
        const score = scoreParty(party, battle.foeParty, battle.habitat);
        const won = score >= 0;
        let ratingDelta = 0;
        if (battle.mode === "ranked") {
          ratingDelta = won ? 18 : -14;
          state.rating = (state.rating || 1000) + ratingDelta;
          saveState();
        }
        battle.lastResult = {
          won,
          score,
          ratingDelta,
          party,
          foe: battle.foeParty,
          opponent: battle.opponent,
          opponentRating: battle.opponentRating,
        };
        battle.step = "resolving";
        renderBattle();
        setTimeout(() => {
          if (battle.step !== "resolving") return;
          battle.step = "results";
          renderBattle();
        }, 900);
      });
      return;
    }

    if (battle.step === "resolving") {
      root.innerHTML = `
        <div class="resolve-beat" role="status">
          <p class="resolve-title">Battling…</p>
          <p class="muted">Habitat buffs · type matchups resolving</p>
          <div class="matchmake-pulse" aria-hidden="true"></div>
        </div>`;
      return;
    }

    if (battle.step === "results") {
      const res = battle.lastResult;
      if (!res) {
        battle.step = "lobby";
        renderBattle();
        return;
      }
      const hab = HABITATS.find((h) => h.id === battle.habitat) || HABITATS[0];

      function sideHtml(label, party) {
        return `
          <div class="arena-side">
            <div class="arena-label">${escapeHtml(label)}</div>
            ${party
              .map((f) => {
                const { strong, weak } = matchupChips(f.types);
                const { bp, buffed } = effectiveBp(f, battle.habitat);
                const types = (f.types || [])
                  .map((t) => `<span class="type-chip">${escapeHtml(t)}</span>`)
                  .join("");
                const name = (f.commonName || "").replace(/^SAMPLE:\s*/i, "");
                return `
                <div class="fighter-card" style="margin-bottom:8px">
                  ${fighterThumb(f)}
                  <div>
                    <div class="fighter-name">${escapeHtml(name)}</div>
                    <div class="type-chips">${types}</div>
                    <div class="matchup-row">
                      ${strong.slice(0, 2).map((t) => `<span class="strong-chip">×1.6 ${escapeHtml(t)}</span>`).join("")}
                      ${weak.slice(0, 2).map((t) => `<span class="weak-chip">×0.6 ${escapeHtml(t)}</span>`).join("")}
                    </div>
                  </div>
                  <span class="bp-pill ${buffed ? "is-buffed" : ""}">${bp}${buffed ? " ▲" : ""}</span>
                </div>`;
              })
              .join("")}
          </div>`;
      }

      const oppLabel = res.opponent || battle.opponent || "foe";
      const oppElo =
        battle.mode === "ranked" && (res.opponentRating || battle.opponentRating)
          ? ` · Elo ${res.opponentRating || battle.opponentRating}`
          : "";

      root.innerHTML = `
        <div class="battle-layout">
          <div class="battle-scroll">
            <header class="panel-head">
              <h2>Results</h2>
              <p class="muted">${hab.icon} ${escapeHtml(hab.label)} field · +15% BP on affinity</p>
            </header>
            <div class="results-card">
              <h3>${res.won ? "Victory" : "Defeat"}</h3>
              <p class="muted">${
                battle.mode === "ranked"
                  ? `Ranked Elo ${res.ratingDelta >= 0 ? "+" : ""}${res.ratingDelta} → ${state.rating}`
                  : "Casual · Elo unchanged"
              }</p>
            </div>
            <div class="battle-arena">
              ${sideHtml("You", res.party)}
              ${sideHtml("@" + oppLabel + oppElo, res.foe)}
            </div>
          </div>
          <div class="battle-sticky">
            <button type="button" class="btn btn-primary btn-block" id="btn-battle-again">Back to lobby</button>
            <button type="button" class="btn btn-secondary btn-block" id="btn-battle-board">${battle.mode === "ranked" ? "Leaderboard" : "Friends"}</button>
          </div>
        </div>`;

      $("#btn-battle-again")?.addEventListener("click", () => {
        battle.step = "lobby";
        battle.partyIds = [];
        battle.lastResult = null;
        battle.invitePending = false;
        battle.inviteId = null;
        if (battle.mode === "ranked") {
          battle.opponent = null;
          battle.opponentRating = null;
        }
        renderBattle();
      });
      $("#btn-battle-board")?.addEventListener("click", () => {
        if (battle.mode === "ranked") {
          battle.step = "lobby";
          battle.lastResult = null;
          renderBattle();
        } else {
          renderFriends();
          showPanel("friends");
        }
      });
    }
  }

  let toastTimer = null;
  function showToast(msg) {
    toastEl.hidden = false;
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
      toastEl.classList.remove("is-show");
    }, 2800);
  }

  boot();
})();
