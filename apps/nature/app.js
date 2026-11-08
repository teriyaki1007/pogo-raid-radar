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
    step: "lobby",
    mode: "casual",
    habitat: "tree",
    opponent: null,
    partyIds: [],
    foeParty: [],
    lastResult: null,
  };

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

  function pickSampleCard() {
    if (!speciesCards.length) {
      return {
        id: "demo-unknown",
        commonName: "SAMPLE: Unidentified organism",
        scientificName: "—",
        averageSize: "Unknown (demo)",
        nativeRange: "Insufficient data (demo)",
        habitat: "As logged by observer",
        seasonality: "—",
        lookalikes: ["Needs clearer photo"],
        caution: "Demo unknown",
        emoji: "❓",
        _confidence: "unknown",
      };
    }
    const roll = Math.random();
    const unknown = speciesCards.find((s) => s.id === "demo-unknown");
    if (roll < 0.12 && unknown) return { ...unknown, _confidence: "unknown" };
    const pool = speciesCards.filter((s) => s.id !== "demo-unknown");
    const pick = pool[Math.floor(Math.random() * pool.length)] || unknown || speciesCards[0];
    const conf =
      pick.id === "demo-unknown"
        ? "unknown"
        : (pick.lookalikes || []).length > 2
          ? "unsure"
          : "likely";
    return { ...pick, _confidence: conf };
  }

  function runIdentify() {
    const sample = pickSampleCard();
    const place = $("#place-label").value.trim();
    const when = $("#observed-at").value;
    const notes = $("#notes").value.trim();
    const tagsRaw = $("#tags").value.trim();
    const privacy = $("#privacy").value || "private";

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
      confirmed: false,
      xpAwarded: 0,
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
    $("#confirm-range").textContent = m.nativeRange;
    $("#confirm-habitat").textContent = m.habitat;
    $("#confirm-season").textContent = cardSeason(m);
    $("#confirm-place").textContent = `${s.place.label} · ${formatWhen(s.observedAt)}`;
    renderLookalikesQuiet($("#confirm-lookalikes"), m.lookalikes);
    const disc = $("#confirm-disclaimer");
    if (disc) {
      disc.textContent = m.caution
        ? `SAMPLE facts · Caution: ${m.caution}`
        : "Facts above are SAMPLE placeholders for the prototype.";
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
          <div><dt>Avg. size</dt><dd>${escapeHtml(sample.averageSize)}</dd></div>
          <div><dt>Native range</dt><dd>${escapeHtml(sample.nativeRange)}</dd></div>
          <div><dt>Habitat</dt><dd>${escapeHtml(sample.habitat)}</dd></div>
          <div><dt>Season</dt><dd>${escapeHtml(cardSeason(sample))}</dd></div>
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
        renderBattle();
        showPanel("battle");
        showToast(`Challenge @${user}`);
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
        return enrichFighter({ ...card, source: "slot", photoRef: s.photoRef });
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

    if (battle.step === "lobby") {
      const friends = state.friends || [];
      const oppOptions = friends.length
        ? friends
            .map(
              (f) =>
                `<button type="button" class="fighter-card ${battle.opponent === f.username ? "is-selected" : ""}" data-opp="${escapeHtml(f.username)}">
                  <div class="fighter-emoji">👤</div>
                  <div>
                    <div class="fighter-name">@${escapeHtml(f.username)}</div>
                    <div class="fighter-sub">${f.status === "online" ? "Online" : "Offline"} · challenge</div>
                  </div>
                  <span class="bp-pill">VS</span>
                </button>`
            )
            .join("")
        : `<div class="empty-hint">Add a friend first to challenge</div>`;

      const habitats = HABITATS.map(
        (h) =>
          `<button type="button" class="habitat-chip ${battle.habitat === h.id ? "is-active" : ""}" data-hab="${h.id}">${h.icon}<br>${escapeHtml(h.label)}</button>`
      ).join("");

      root.innerHTML = `
        <div class="mode-toggle" role="group" aria-label="Mode">
          <button type="button" class="mode-btn ${battle.mode === "casual" ? "is-active" : ""}" data-mode="casual">
            <strong>Casual</strong><span>No rating change</span>
          </button>
          <button type="button" class="mode-btn ${battle.mode === "ranked" ? "is-active" : ""}" data-mode="ranked">
            <strong>Ranked</strong><span>Rating ${state.rating ?? 1000}</span>
          </button>
        </div>
        <h3 class="section-label">Habitat field</h3>
        <div class="habitat-grid">${habitats}</div>
        <h3 class="section-label">Opponent</h3>
        <div class="opponent-pick">${oppOptions}</div>
        <div class="battle-actions">
          <button type="button" class="btn btn-primary btn-block" id="btn-battle-continue" ${battle.opponent ? "" : "disabled"}>Pick party of 3</button>
        </div>`;

      root.querySelectorAll("[data-mode]").forEach((b) =>
        b.addEventListener("click", () => {
          battle.mode = b.dataset.mode;
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
          renderBattle();
        })
      );
      $("#btn-battle-continue")?.addEventListener("click", () => {
        if (!battle.opponent) return;
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
          const { strong, weak } = matchupChips(f.types);
          const { bp, buffed } = effectiveBp(f, battle.habitat);
          const types = (f.types || [])
            .map((t) => `<span class="type-chip">${escapeHtml(t)}</span>`)
            .join("");
          const strongHtml = strong
            .slice(0, 3)
            .map((t) => `<span class="strong-chip">Strong ${escapeHtml(t)}</span>`)
            .join("");
          const weakHtml = weak
            .slice(0, 3)
            .map((t) => `<span class="weak-chip">Weak ${escapeHtml(t)}</span>`)
            .join("");
          const label = (f.commonName || "").replace(/^SAMPLE:\\s*/i, "");
          return `
            <button type="button" class="fighter-card ${on ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}" data-fighter="${escapeHtml(f.id)}">
              <div class="fighter-emoji">${f.emoji || "🐾"}</div>
              <div>
                <div class="fighter-name">${escapeHtml(label)}</div>
                <div class="type-chips">${types}</div>
                <div class="matchup-row">${strongHtml}${weakHtml}</div>
                <div class="fighter-sub">${escapeHtml(f.rarity)} · animals only</div>
              </div>
              <span class="bp-pill ${buffed ? "is-buffed" : ""}">${bp} BP${buffed ? " +15%" : ""}</span>
            </button>`;
        })
        .join("");

      root.innerHTML = `
        <button type="button" class="btn-back" id="btn-party-back">← Lobby</button>
        <p class="party-count">${selected.size}/3 fighters · animals only</p>
        <div class="party-picker">${cards || '<div class="empty-hint">No animal fighters yet</div>'}</div>
        <div class="battle-actions">
          <button type="button" class="btn btn-primary btn-block" id="btn-start-fight" ${selected.size === 3 ? "" : "disabled"}>Enter battle</button>
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
        const roster = collectAnimalRoster();
        const party = battle.partyIds.map((id) => roster.find((r) => r.id === id)).filter(Boolean);
        let foePool = roster.filter((r) => !battle.partyIds.includes(r.id));
        if (foePool.length < 3) foePool = roster.slice();
        battle.foeParty = pickFoeParty(foePool);
        const score = scoreParty(party, battle.foeParty, battle.habitat);
        const won = score >= 0;
        let ratingDelta = 0;
        if (battle.mode === "ranked") {
          ratingDelta = won ? 18 : -14;
          state.rating = (state.rating || 1000) + ratingDelta;
          saveState();
        }
        battle.lastResult = { won, score, ratingDelta, party, foe: battle.foeParty };
        battle.step = "fight";
        renderBattle();
      });
      return;
    }

    if (battle.step === "fight" || battle.step === "results") {
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
                const name = (f.commonName || "").replace(/^SAMPLE:\\s*/i, "");
                return `
                <div class="fighter-card" style="margin-bottom:8px">
                  <div class="fighter-emoji">${f.emoji || "🐾"}</div>
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

      root.innerHTML = `
        <div class="habitat-banner"><span>${hab.icon} ${escapeHtml(hab.label)} field</span><span>+15% BP if affinity matches</span></div>
        <div class="battle-arena">
          ${sideHtml("You", res.party)}
          ${sideHtml("@" + (battle.opponent || "foe"), res.foe)}
        </div>
        <div class="results-card">
          <h3>${res.won ? "Victory" : "Defeat"}</h3>
          <p class="muted">${battle.mode === "ranked" ? `Ranked ${res.ratingDelta >= 0 ? "+" : ""}${res.ratingDelta} → ${state.rating}` : "Casual · rating unchanged"}</p>
          <p class="muted small" style="margin-top:6px">Strong ×1.6 · Weak ×0.6 · dual-type uses best multiplier</p>
        </div>
        <div class="battle-actions">
          <button type="button" class="btn btn-primary btn-block" id="btn-battle-again">Rematch lobby</button>
          <button type="button" class="btn btn-secondary btn-block" id="btn-battle-friends">Friends</button>
        </div>`;

      $("#btn-battle-again")?.addEventListener("click", () => {
        battle.step = "lobby";
        battle.partyIds = [];
        battle.lastResult = null;
        renderBattle();
      });
      $("#btn-battle-friends")?.addEventListener("click", () => {
        renderFriends();
        showPanel("friends");
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
