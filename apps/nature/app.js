/**
 * Project Nature — /nature/ demo mount (v0.1 UI + demo JSON)
 * Loads shared speciesCards from data/catalogue-demo.json.
 * Loads Species Guide Identify packages from data/identify/<id>/species-card.json
 * (meta.identifyPackages / identifyDemoPackage). Guide-owned cards preferred over SAMPLE.
 * Prefers /nature/api/* (D1+R2) when bound; falls back to localStorage.
 * Design Critique v0.1 pass applied (UI clear for demo wire).
 * Soft-gated live at /nature/ (preview cookie) until CF auth E2E.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "nature-catalogue-v0";
  const DATA_URL = "data/catalogue-demo.json";

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

  /**
   * Catalogue game-layer move pools (Product Skeleton).
   * Source of truth: apps/nature/data/moves.json — boot may overwrite MOVE_DEFS from that file.
   * Not Species Guide facts.
   */
  const MOVES_URL = "data/moves.json";
  let MOVE_DEFS = {
    Forest: [
      { id: "canopy-strike", name: "Canopy Strike", power: 40 },
      { id: "root-bind", name: "Root Bind", power: 25, kind: "status" },
      { id: "leaf-barrage", name: "Leaf Barrage", power: 55 },
    ],
    Ocean: [
      { id: "tide-crash", name: "Tide Crash", power: 45 },
      { id: "spray-jet", name: "Spray Jet", power: 35 },
      { id: "undertow", name: "Undertow", power: 30 },
    ],
    Sky: [
      { id: "dive-peck", name: "Dive Peck", power: 40 },
      { id: "gale-cut", name: "Gale Cut", power: 50 },
      { id: "wing-guard", name: "Wing Guard", power: 20, kind: "status" },
    ],
    Earth: [
      { id: "quake-stomp", name: "Quake Stomp", power: 55 },
      { id: "stone-toss", name: "Stone Toss", power: 35 },
      { id: "burrow-guard", name: "Burrow Guard", power: 25 },
    ],
    Fire: [
      { id: "ember-snap", name: "Ember Snap", power: 40 },
      { id: "blaze-rush", name: "Blaze Rush", power: 60 },
      { id: "smoke-veil", name: "Smoke Veil", power: 20 },
    ],
    Ice: [
      { id: "frost-bite", name: "Frost Bite", power: 45 },
      { id: "chill-gust", name: "Chill Gust", power: 35 },
      { id: "freeze-latch", name: "Freeze Latch", power: 30 },
    ],
    Bug: [
      { id: "swarm-needle", name: "Swarm Needle", power: 40 },
      { id: "silk-trap", name: "Silk Trap", power: 25 },
      { id: "mandible-crush", name: "Mandible Crush", power: 50 },
    ],
    Shadow: [
      { id: "night-slash", name: "Night Slash", power: 50 },
      { id: "haunt-pulse", name: "Haunt Pulse", power: 35 },
      { id: "fade-step", name: "Fade Step", power: 20 },
    ],
    River: [
      { id: "rapid-strike", name: "Rapid Strike", power: 45 },
      { id: "silt-cloud", name: "Silt Cloud", power: 25 },
      { id: "current-pull", name: "Current Pull", power: 35 },
    ],
    Meadow: [
      { id: "pollen-burst", name: "Pollen Burst", power: 35 },
      { id: "thorn-lash", name: "Thorn Lash", power: 45 },
      { id: "bloom-guard", name: "Bloom Guard", power: 20 },
    ],
    Storm: [
      { id: "thunder-crack", name: "Thunder Crack", power: 60 },
      { id: "wind-shear", name: "Wind Shear", power: 40 },
      { id: "static-cling", name: "Static Cling", power: 30 },
    ],
    Crystal: [
      { id: "shard-volley", name: "Shard Volley", power: 50 },
      { id: "prism-guard", name: "Prism Guard", power: 25 },
      { id: "refract-beam", name: "Refract Beam", power: 55 },
    ],
  };

  const MOVE_SLOTS = 4;
  const MAX_FIGHTER_LEVEL = 50;
  /** Soft curve: 100 XP → Lv2, then ×1.25 each level (Catalogue). */
  const XP_TO_LEVEL_2 = 100;
  const XP_LEVEL_GROWTH = 1.25;
  const BATTLE_XP_WIN = 30;
  const BATTLE_XP_LOSS = 12;
  const BATTLE_XP_FORFEIT = 0;
  /** STAB then Strong/Weak (Catalogue combat order). */
  const STAB_MULT = 1.2;
  const STRONG_MULT = 1.6;
  const WEAK_MULT = 0.6;
  /** leveledBp = round(baseBp * (1 + 0.02*(level-1))); habitat affinity → ×1.15 */
  const BP_PER_LEVEL = 0.02;

  let pendingMoves = [];

  function learnsetForTypes(types) {
    const seen = new Set();
    const out = [];
    (types || []).forEach((t) => {
      (MOVE_DEFS[t] || []).forEach((m) => {
        if (seen.has(m.id)) return;
        seen.add(m.id);
        out.push({ ...m, type: t });
      });
    });
    return out;
  }

  function requiredMoveCount(types) {
    const n = learnsetForTypes(types).length;
    return Math.min(MOVE_SLOTS, Math.max(0, n));
  }

  function moveById(id) {
    for (const [type, list] of Object.entries(MOVE_DEFS)) {
      const hit = list.find((m) => m.id === id);
      if (hit) return { ...hit, type };
    }
    return null;
  }

  function normalizeMoves(raw, types) {
    const learn = learnsetForTypes(types);
    const need = requiredMoveCount(types);
    const ids = Array.isArray(raw) ? raw.filter((id) => learn.some((m) => m.id === id)) : [];
    const uniq = [...new Set(ids)].slice(0, need || MOVE_SLOTS);
    while (uniq.length < need) {
      const fill = learn.find((m) => !uniq.includes(m.id));
      if (!fill) break;
      uniq.push(fill.id);
    }
    return uniq.slice(0, need || MOVE_SLOTS);
  }

  /** Total XP required to reach `level` from Lv1 (Catalogue soft curve). */
  function xpThresholdForLevel(level) {
    const lv = Math.max(1, Math.min(MAX_FIGHTER_LEVEL, level | 0));
    if (lv <= 1) return 0;
    let total = 0;
    let need = XP_TO_LEVEL_2;
    for (let L = 1; L < lv; L++) {
      total += need;
      need *= XP_LEVEL_GROWTH;
    }
    return total;
  }

  function levelFromXp(xp) {
    const x = Math.max(0, xp || 0);
    let lv = 1;
    while (lv < MAX_FIGHTER_LEVEL && x >= xpThresholdForLevel(lv + 1)) lv++;
    return lv;
  }

  function xpProgress(xp) {
    const x = Math.max(0, xp || 0);
    const lv = levelFromXp(x);
    if (lv >= MAX_FIGHTER_LEVEL) {
      return { level: lv, into: 0, need: 0, atCap: true };
    }
    const floor = xpThresholdForLevel(lv);
    const next = xpThresholdForLevel(lv + 1);
    return { level: lv, into: Math.round(x - floor), need: Math.round(next - floor), atCap: false };
  }

  /** @deprecated use xpProgress — kept for callers expecting a number */
  function xpIntoLevel(xp) {
    return xpProgress(xp).into;
  }

  /**
   * Award fight XP to used party members.
   * @param {string[]} partyIds
   * @param {"win"|"loss"|"forfeit"|boolean} outcome — true=win, false=loss
   */
  function applyBattleXpToSlots(partyIds, outcome) {
    let gain = BATTLE_XP_LOSS;
    if (outcome === true || outcome === "win") gain = BATTLE_XP_WIN;
    else if (outcome === "forfeit") gain = BATTLE_XP_FORFEIT;
    else if (outcome === false || outcome === "loss") gain = BATTLE_XP_LOSS;
    const leveled = [];
    if (gain <= 0) return { gain: 0, leveled };
    (partyIds || []).forEach((taxonId) => {
      const slot = (state.slots || []).find((s) => s.taxonId === taxonId && s.status !== "empty");
      if (!slot) return;
      const before = levelFromXp(slot.battleXp || 0);
      slot.battleXp = (slot.battleXp || 0) + gain;
      slot.level = levelFromXp(slot.battleXp);
      if (slot.level > before) leveled.push({ id: taxonId, level: slot.level });
    });
    return { gain, leveled };
  }

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
  /** Unbounded dex — Catalogue lock; battle party still max 3 */
  let SLOT_COUNT = Infinity;
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
      catalogue = { meta: { demo: true, slotCount: null }, speciesCards: [], demoUser: null };
    }

    try {
      const mvRes = await fetch(MOVES_URL);
      if (mvRes.ok) {
        const mvJson = await mvRes.json();
        if (mvJson && mvJson.pools && typeof mvJson.pools === "object") {
          MOVE_DEFS = mvJson.pools;
        }
      }
    } catch (err) {
      console.warn("moves.json missing — using inline Catalogue stub", err);
    }

    speciesCards = (Array.isArray(catalogue.speciesCards) ? catalogue.speciesCards : []).map((c) => ({
      ...c,
      habitatAffinity: normalizeHabitatAffinity(c.habitatAffinity),
    }));
    await loadIdentifyPackages();
    syncCaptureIdentifyCopy();
    SLOT_COUNT = catalogue.meta?.slotCount == null || catalogue.meta?.slotCount === 0
      ? Infinity
      : Number(catalogue.meta.slotCount) || Infinity;
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

  function makeSlot(partial = {}) {
    const n = (state?.slots?.length || 0) + 1;
    return normalizeSlot({
      slotId: partial.slotId || `slot-${Date.now()}-${n}`,
      taxonId: null,
      status: "empty",
      firstSeenAt: null,
      photoRef: null,
      sightingId: null,
      level: 1,
      battleXp: 0,
      moves: [],
      ...partial,
    });
  }

  function emptySlots() {
    return [];
  }

  function normalizeSlot(s) {
    if (!s || typeof s !== "object") return s;
    return {
      ...s,
      level: typeof s.level === "number" ? s.level : levelFromXp(s.battleXp || 0),
      battleXp: typeof s.battleXp === "number" ? s.battleXp : 0,
      moves: Array.isArray(s.moves) ? s.moves : [],
    };
  }

  /** Drop leftover empty placeholders from the old fixed-12 grid */
  function compactSlots(slots) {
    return (Array.isArray(slots) ? slots : [])
      .map(normalizeSlot)
      .filter((s) => s && s.status !== "empty");
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
      Array.isArray(du.slots)
        ? compactSlots(du.slots.map((s) => ({ ...s })))
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
      slots: compactSlots(Array.isArray(s.slots) ? s.slots : base.slots),
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

  /**
   * Load Species Guide Identify packages bundled under data/identify/<id>/.
   * Merges Guide fields onto speciesCards with guideOwned:true.
   * Combat types/bp/rarity/emoji stay from catalogue when present; otherwise interim stubs
   * (Catalogue owns combat — mark combatInterim for retune).
   * identifyDemoPackage in catalogue.meta (e.g. "demo-001") drives the demo photo→card path:
   * when the user Identifies any uploaded photo, pickCardFromVisual prefers that Guide card
   * if visual leans animal/urban/tree or SAMPLE match is weak.
   */
  const GUIDE_COMBAT_INTERIM = {
    animal: { types: ["Sky", "Meadow"], bp: 135, rarity: "common", emoji: "🐦" },
    plant: { types: ["Forest"], bp: 0, rarity: "common", emoji: "🌿" },
    other: { types: [], bp: 0, rarity: "common", emoji: "🌿" },
  };

  function mapGuideConfidence(card) {
    const g = String(card?.idConfidence || "").toLowerCase();
    if (g === "high" || g === "medium") return "likely";
    if (g === "low") return "unsure";
    if (g === "likely" || g === "unsure" || g === "unknown" || g === "confirmed") return g;
    return "likely";
  }

  function isGuideCard(card) {
    if (!card) return false;
    if (card.guideOwned || card._guideOwned) return true;
    if (card.provisional && card.packageId) return true;
    const name = String(card.commonName || "");
    return !/^SAMPLE:\s*/i.test(name) && !!card.scientificName && card.idTier;
  }

  async function loadIdentifyPackages() {
    const listed = Array.isArray(catalogue?.meta?.identifyPackages)
      ? catalogue.meta.identifyPackages.slice()
      : [];
    const demo = catalogue?.meta?.identifyDemoPackage;
    if (demo && !listed.includes(demo)) listed.push(demo);
    if (!listed.length) listed.push("demo-001");

    for (const pkgId of listed) {
      try {
        const res = await fetch(`data/identify/${encodeURIComponent(pkgId)}/species-card.json`);
        if (!res.ok) continue;
        const guide = await res.json();
        if (!guide || !guide.id) continue;
        const existingIdx = speciesCards.findIndex((c) => c.id === guide.id);
        const existing = existingIdx >= 0 ? speciesCards[existingIdx] : null;
        const stub = GUIDE_COMBAT_INTERIM[guide.kind] || GUIDE_COMBAT_INTERIM.other;
        const merged = {
          ...(existing || {}),
          ...guide,
          habitatAffinity: normalizeHabitatAffinity(guide.habitatAffinity),
          guideOwned: true,
          packageId: guide.packageId || pkgId,
          types: (existing && existing.types && existing.types.length ? existing.types : null) || stub.types,
          bp: existing && existing.bp != null ? existing.bp : stub.bp,
          rarity: (existing && existing.rarity) || stub.rarity,
          emoji: (existing && existing.emoji) || stub.emoji,
          combatInterim: existing && existing.combatInterim != null ? existing.combatInterim : true,
        };
        if (existingIdx >= 0) speciesCards[existingIdx] = merged;
        else speciesCards.push(merged);
        if (catalogue) {
          if (!Array.isArray(catalogue.speciesCards)) catalogue.speciesCards = [];
          const ci = catalogue.speciesCards.findIndex((c) => c.id === merged.id);
          if (ci >= 0) catalogue.speciesCards[ci] = { ...catalogue.speciesCards[ci], ...merged };
          else catalogue.speciesCards.push(merged);
        }
      } catch (err) {
        console.warn("Identify package load failed", pkgId, err);
      }
    }
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
    const hay = `${card.commonName || ""} ${card.habitat || ""} ${card.scientificName || ""} ${(card.lookalikes || []).join(" ")} ${card.id || ""}`.toLowerCase();
    (visual.keywords || []).forEach((k) => {
      if (hay.includes(k)) score += 3;
    });
    const aff = normalizeHabitatAffinity(card.habitatAffinity);
    if (visual.habitatGuess && aff.includes(visual.habitatGuess)) score += 4;
    if (visual.kind === "plant" && /tree|plant|fung|moss|leaf|wood|redwood|agaric/.test(hay)) score += 2;
    if (visual.kind === "animal" && /bird|fox|otter|butterfly|starfish|insect|robin|monarch|sparrow|passer|animal/.test(hay)) score += 2;
    if (visual.kind === "water" && /ocean|tide|star|fish|marine|water|wetland/.test(hay)) score += 2;
    // Strongly prefer Species Guide packages over SAMPLE placeholders
    if (card.guideOwned) {
      score += 8;
      const conf = String(card.idConfidence || "").toLowerCase();
      if (conf === "high") score += 4;
      else if (conf === "medium") score += 2;
    }
    return score;
  }

  function wrapIdentifiedCard(best, visual, conf, score) {
    const guide = isGuideCard(best);
    return {
      ...best,
      _confidence: conf,
      _fromPhoto: true,
      _visualScore: score,
      _guideOwned: guide,
      habitat: best.habitat || visual.habitatLabel,
      caution: guide
        ? best.caution || "Species Guide provisional ID — Confirm to log."
        : (best.caution ? `${best.caution} · ` : "") +
          "Matched from your photo cues — Species Guide still owns final facts.",
    };
  }

  function pickCardFromVisual(visual) {
    const pool = (speciesCards || []).filter((s) => s.id !== "demo-unknown");
    if (!pool.length) return unknownCard({ habitat: visual.habitatLabel || "As logged by observer" });

    const scored = pool.map((c) => ({ c, s: scoreCardForVisual(c, visual) }));
    scored.sort((a, b) => b.s - a.s);

    // Demo UX: meta.identifyDemoPackage (e.g. demo-001) — when user uploaded a photo,
    // prefer that Guide card if visual leans animal/urban/tree OR SAMPLE match is weak.
    const demoPkg = catalogue?.meta?.identifyDemoPackage;
    if (demoPkg) {
      const demo = pool.find((c) => c.guideOwned && (c.packageId === demoPkg || c.id === demoPkg));
      if (demo) {
        const sampleBest = Math.max(
          0,
          ...scored.filter((x) => !x.c.guideOwned).map((x) => x.s)
        );
        const aff = normalizeHabitatAffinity(demo.habitatAffinity);
        const habitatHit = !!(visual.habitatGuess && aff.includes(visual.habitatGuess));
        const animalish = visual.kind === "animal" || visual.kind === "unknown";
        const urbanTree =
          habitatHit ||
          aff.includes("urban") ||
          aff.includes("tree") ||
          visual.habitatGuess === "urban" ||
          visual.habitatGuess === "tree";
        if ((animalish && urbanTree) || sampleBest < 6) {
          const demoScore = scoreCardForVisual(demo, visual);
          return wrapIdentifiedCard(demo, visual, mapGuideConfidence(demo), demoScore);
        }
      }
    }

    let best = scored[0]?.c || null;
    let bestScore = scored[0]?.s ?? -1;

    // Prefer top guideOwned over SAMPLE even on ties / near-ties
    const topGuide = scored.find((x) => x.c.guideOwned);
    if (topGuide && (!best || !best.guideOwned || topGuide.s >= bestScore - 2)) {
      best = topGuide.c;
      bestScore = topGuide.s;
    }

    if (!best || bestScore < 2) {
      // Last resort: still surface high-confidence Guide demo card if any
      const guideFallback = pool.find(
        (c) => c.guideOwned && String(c.idConfidence || "").toLowerCase() === "high"
      );
      if (guideFallback) {
        return wrapIdentifiedCard(
          guideFallback,
          visual,
          mapGuideConfidence(guideFallback),
          scoreCardForVisual(guideFallback, visual)
        );
      }
      return unknownCard({
        habitat: visual.habitatLabel || "As logged by observer",
        averageSize: visual.sizeHint || "Not measured from photo",
        lookalikes: visual.keywords.slice(0, 3).map((k) => `Photo cue: ${k}`),
      });
    }

    const conf = isGuideCard(best)
      ? mapGuideConfidence(best)
      : bestScore >= 6
        ? "likely"
        : bestScore >= 3
          ? "unsure"
          : "unknown";
    return wrapIdentifiedCard(best, visual, conf, bestScore);
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


  async function ensurePersistentPhotoRef(url) {
    if (!url || typeof url !== "string") return url;
    if (!url.startsWith("blob:")) return url;
    const blob = await fetch(url).then((r) => r.blob());
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    try {
      URL.revokeObjectURL(url);
    } catch (_) {
      /* ignore */
    }
    return dataUrl;
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

    let persistentPhoto = photoDataUrl;
    try {
      persistentPhoto = await ensurePersistentPhotoRef(photoDataUrl);
      if (persistentPhoto && persistentPhoto !== photoDataUrl) {
        photoDataUrl = persistentPhoto;
      }
    } catch (err) {
      console.warn("Could not persist photo ref; keeping original URL", err);
      persistentPhoto = photoDataUrl;
    }

    pendingSighting = {
      id: `sight-${Date.now()}`,
      photoRefs: [persistentPhoto],
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
    $("#btn-confirm").addEventListener("click", () => {
      if ($("#btn-confirm")?.disabled) return;
      commitSighting("confirmed");
    });
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
    const label = (f.commonName || "fighter").replace(/^SAMPLE:\s*/i, "");
    if (f.photoRef) {
      return `<div class="fighter-emoji has-photo"><img src="${f.photoRef}" alt="${escapeHtml(label)}" /></div>`;
    }
    return `<div class="fighter-emoji" role="img" aria-label="${escapeHtml(label)}">${escapeHtml(f.emoji || "🐾")}</div>`;
  }

  function habitatLabel(id) {
    const h = HABITATS.find((x) => x.id === id);
    return h ? `${h.icon} ${h.label}` : id || "—";
  }

  function affinityChipsHtml(raw) {
    const ids = normalizeHabitatAffinity(raw);
    if (!ids.length) return "";
    return ids
      .map((id) => {
        const h = HABITATS.find((x) => x.id === id);
        const label = h ? h.label : id;
        const icon = h ? h.icon : "";
        return `<span class="chip affinity-chip">${icon ? `${icon} ` : ""}${escapeHtml(label)}</span>`;
      })
      .join("");
  }

  function renderConfirmAffinity(m) {
    const wrap = $("#confirm-affinity-wrap");
    const dd = $("#confirm-affinity");
    const html = affinityChipsHtml(m && m.habitatAffinity);
    if (dd) dd.innerHTML = html;
    if (wrap) wrap.hidden = !html;
  }

  function affinityDetailHtml(m) {
    const html = affinityChipsHtml(m && m.habitatAffinity);
    if (!html) return "";
    return `<div class="fact-span"><dt>Habitat affinity</dt><dd class="affinity-chips" aria-label="Habitat affinity">${html}</dd></div>`;
  }

  /** Swap SAMPLE vs Species Guide provisional framing on Confirm / Detail banners. */
  function syncIdBanner(el, card, variant) {
    if (!el) return;
    const guide = isGuideCard(card);
    if (guide) {
      el.textContent =
        variant === "detail"
          ? "Species Guide provisional — not authoritative"
          : "Species Guide provisional — awaiting your confirm";
      el.classList.add("is-guide");
      el.classList.remove("is-sample");
    } else {
      el.textContent =
        variant === "detail"
          ? "Sample ID — not authoritative"
          : "Sample ID — not a real species determination";
      el.classList.add("is-sample");
      el.classList.remove("is-guide");
    }
  }

  function syncCaptureIdentifyCopy() {
    const el = $("#capture-identify-hint");
    if (!el) return;
    const hasGuide = speciesCards.some((c) => c.guideOwned || c._guideOwned);
    el.textContent = hasGuide
      ? "Photo + place + time → Identify (Species Guide)"
      : "Photo + place + time → Identify (sample ID)";
  }

  function fighterTypesFromMeta(m) {
    const seed = DEMO_FIGHTERS.find((d) => d.id === (m && m.id));
    return (m && m.types) || (seed && seed.types) || [];
  }

  function isCombatAnimal(m) {
    const seed = DEMO_FIGHTERS.find((d) => d.id === (m && m.id));
    const kind = (m && m.kind) || (seed && seed.kind) || "";
    const bp = (m && m.bp) ?? (seed && seed.bp) ?? 0;
    return kind === "animal" && bp > 0;
  }

  function syncConfirmButton(m) {
    const btn = $("#btn-confirm");
    if (!btn) return;
    const combat = isCombatAnimal(m);
    const types = fighterTypesFromMeta(m || {});
    const need = combat ? requiredMoveCount(types) || MOVE_SLOTS : 0;
    const ready = !combat || (need > 0 && pendingMoves.length === need);
    btn.disabled = !ready;
    btn.setAttribute("aria-disabled", ready ? "false" : "true");
    if (!ready && combat) {
      btn.title = `Pick ${need} moves to confirm`;
    } else {
      btn.removeAttribute("title");
    }
  }

  function renderConfirmMoves(s, m) {
    const wrap = $("#confirm-moves");
    const grid = $("#confirm-move-grid");
    const countEl = $("#confirm-move-count");
    const hint = $("#confirm-move-hint");
    if (!wrap || !grid) return;
    if (!isCombatAnimal(m)) {
      wrap.hidden = true;
      pendingMoves = [];
      grid.innerHTML = "";
      syncConfirmButton(m);
      return;
    }
    wrap.hidden = false;
    const types = fighterTypesFromMeta(m);
    const learn = learnsetForTypes(types);
    const need = requiredMoveCount(types) || MOVE_SLOTS;
    pendingMoves = pendingMoves.filter((id) => learn.some((mv) => mv.id === id)).slice(0, need);
    if (hint) {
      hint.textContent =
        need === 1
          ? "Pick 1 move from this animal’s typed pool before it locks into your dex (editable later)"
          : `Pick ${need} moves from this animal’s typed pool before it locks into your dex (editable later)`;
    }
    grid.innerHTML = learn
      .map((mv) => {
        const on = pendingMoves.includes(mv.id);
        const kind = mv.kind === "status" ? " · status" : "";
        return `<button type="button" class="move-chip ${on ? "is-selected" : ""}" data-move="${escapeHtml(mv.id)}" aria-pressed="${on}">
          <span class="move-name">${escapeHtml(mv.name)}</span>
          <span class="move-meta">${escapeHtml(mv.type)} · PWR ${mv.power}${kind}</span>
        </button>`;
      })
      .join("");
    if (countEl) {
      countEl.textContent = `${pendingMoves.length}/${need} selected · pool ${learn.length}`;
    }
    const group = $("#confirm-move-grid");
    if (group) group.setAttribute("aria-label", `Choose ${need} battle moves`);
    grid.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.move;
        const idx = pendingMoves.indexOf(id);
        if (idx >= 0) pendingMoves.splice(idx, 1);
        else if (pendingMoves.length < need) pendingMoves.push(id);
        renderConfirmMoves(s, m);
      });
    });
    syncConfirmButton(m);
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
    renderConfirmAffinity(m);
    $("#confirm-season").textContent = cardSeason(m);
    renderPopulationFields(m);
    renderConfirmMoves(s, m);
    $("#confirm-place").textContent = `${s.place.label} · ${formatWhen(s.observedAt)}`;
    renderLookalikesQuiet($("#confirm-lookalikes"), m.lookalikes);
    syncIdBanner($("#confirm-id-banner"), m, "confirm");
    const disc = $("#confirm-disclaimer");
    if (disc) {
      if (isGuideCard(m)) {
        disc.textContent = m.caution
          ? `Species Guide provisional · Confirm to log · ${m.caution}`
          : "Species Guide provisional · Confirm to log";
      } else if (s.fromPhoto || m._fromPhoto) {
        disc.textContent = m.caution
          || "Generated from your photo cues — Species Guide confirms real taxon facts.";
      } else {
        disc.textContent = m.caution
          ? `SAMPLE facts · Caution: ${m.caution}`
          : "Facts above are SAMPLE placeholders for the prototype.";
      }
    }
    syncConfirmButton(m);
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

    const meta = s.sampleMeta || {};
    const moveNeed = isCombatAnimal(meta)
      ? requiredMoveCount(fighterTypesFromMeta(meta)) || MOVE_SLOTS
      : 0;
    if (status === "confirmed" && isCombatAnimal(meta) && pendingMoves.length !== moveNeed) {
      showToast(`Pick ${moveNeed} battle moves before collecting`);
      return;
    }

    let xpGain = XP.confirm + XP.photo;
    const existingSlot = state.slots.find((sl) => sl.taxonId === s.speciesRef && sl.status !== "empty");
    let filledNew = false;

    if (!existingSlot) {
      state.slots.push(
        makeSlot({
          taxonId: s.speciesRef,
          status: status === "uncertain" ? "uncertain" : "filled",
          firstSeenAt: s.observedAt,
          photoRef: s.photoRefs[0],
          sightingId: s.id,
          level: 1,
          battleXp: 0,
          moves: isCombatAnimal(meta)
            ? normalizeMoves(pendingMoves, fighterTypesFromMeta(meta))
            : [],
        })
      );
      filledNew = true;
      xpGain += XP.newSlot;
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
    pendingMoves = [];
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
    $("#stat-slots").textContent = String(filled);

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

    if (filledSlots.length === 0) {
      const hero = document.createElement("button");
      hero.type = "button";
      hero.className = "dex-hero";
      hero.innerHTML = `
        <span class="dex-hero-icon" aria-hidden="true">📷</span>
        <strong>Log your first sighting</strong>
        <span class="muted">Photo → Identify → Confirm · unlimited logs</span>`;
      hero.addEventListener("click", () => {
        resetCaptureForm();
        showPanel("capture");
      });
      grid.appendChild(hero);
      return;
    }

    filledSlots.forEach((slot, i) => {
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
      const nameShort = shortName(sample.commonName);
      const thumb = slot.photoRef
        ? `<img class="slot-thumb" src="${slot.photoRef}" alt="${escapeHtml(nameShort)}" />`
        : `<div class="slot-thumb-ph">${sample.emoji || "🌿"}</div>`;
      const lv = slot.level || levelFromXp(slot.battleXp || 0);
      const lvHtml =
        sample.kind === "animal" || (slot.moves && slot.moves.length)
          ? `<span class="lv-pill slot-lv">Lv ${lv}</span>`
          : "";
      btn.innerHTML = `
        <span class="slot-conf" data-level="${conf}" title="${conf}"></span>
        ${thumb}
        ${lvHtml}
        <span class="slot-name">${escapeHtml(nameShort)}</span>`;
      btn.addEventListener("click", () => openDetail(slot));
      grid.appendChild(btn);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "slot is-empty";
    add.innerHTML = `
      <span class="slot-silhouette" aria-hidden="true">＋</span>
      <span class="slot-num">Log</span>`;
    add.addEventListener("click", () => {
      resetCaptureForm();
      showPanel("capture");
    });
    grid.appendChild(add);
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
    const base = findCard(slot.taxonId) || {
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
    const meta = sight?.sampleMeta || {};
    const sample = {
      ...base,
      ...meta,
      // Prefer live Guide catalogue fields for ownership + affinity display
      guideOwned: !!(base.guideOwned || base._guideOwned || meta.guideOwned || meta._guideOwned),
      habitatAffinity: normalizeHabitatAffinity(
        base.habitatAffinity || meta.habitatAffinity || sight?.habitatAffinity || []
      ),
      commonName: base.commonName || meta.commonName,
      scientificName: base.scientificName || meta.scientificName,
      habitat: base.habitat || meta.habitat,
      lookalikes: (base.lookalikes && base.lookalikes.length ? base.lookalikes : meta.lookalikes) || [],
    };
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
        <p class="sample-banner ${isGuideCard(sample) ? "is-guide" : "is-sample"}" id="detail-id-banner" role="status" style="margin-top:10px">${
          isGuideCard(sample)
            ? "Species Guide provisional — not authoritative"
            : "Sample ID — not authoritative"
        }</p>
        <dl class="fact-grid">
          <div><dt>Avg. size</dt><dd>${escapeHtml(sample.averageSize || "—")}</dd></div>
          <div><dt>Native range</dt><dd>${escapeHtml(sample.nativeRange || sample.originRange || "—")}</dd></div>
          <div><dt>Habitat</dt><dd>${escapeHtml(sample.habitat || "—")}</dd></div>
          ${affinityDetailHtml(sample)}
          <div><dt>Season</dt><dd>${escapeHtml(cardSeason(sample))}</dd></div>
          ${populationDetailHtml(sample)}
          ${
            (slot.moves && slot.moves.length) || sample.kind === "animal"
              ? `<div><dt>Battle level</dt><dd>Lv ${slot.level || levelFromXp(slot.battleXp || 0)} · ${(() => {
                     const p = xpProgress(slot.battleXp || 0);
                     return p.atCap ? "MAX" : `${p.into}/${p.need} XP`;
                   })()}</dd></div>
                 <div class="fact-span"><dt>Moves</dt><dd>${
                   (slot.moves || []).length
                     ? (slot.moves || [])
                         .map((id) => {
                           const mv = moveById(id);
                           return mv ? escapeHtml(mv.name) : escapeHtml(id);
                         })
                         .join(" · ")
                     : "—"
                 }</dd></div>`
              : ""
          }
        </dl>
        <div class="lookalikes quiet">
          <div class="lookalike-label">Lookalikes</div>
          <ul class="lookalike-list">${lookList}</ul>
        </div>
        ${sample.caution ? `<p class="muted small">Caution: ${escapeHtml(sample.caution)}</p>` : ""}
        <p class="place-logged">${escapeHtml(sight?.place?.label || "—")} · ${sight ? formatWhen(sight.observedAt) : "—"}</p>
        ${sight?.notes ? `<p class="muted small" style="margin-top:8px">Notes: ${escapeHtml(sight.notes)}</p>` : ""}
        <p class="muted small" style="margin-top:8px">XP from this log: +${sight?.xpAwarded ?? 0}</p>
        ${
          isCombatAnimal(sample) || (slot.moves && slot.moves.length)
            ? `<div class="move-picker" id="detail-moves" style="margin-top:12px">
                <h4 class="section-label">Edit moves</h4>
                <p class="muted small">Change outside of fights · pick ${requiredMoveCount(fighterTypesFromMeta(sample)) || MOVE_SLOTS} from typed pool</p>
                <div class="move-grid" id="detail-move-grid"></div>
                <p class="muted small" id="detail-move-count"></p>
                <button type="button" class="btn btn-secondary btn-block" id="btn-save-moves" style="margin-top:8px">Save moves</button>
              </div>`
            : ""
        }
      </div>`;
    showPanel("detail");
    bindDetailMoves(slot, sample);
  }

  function bindDetailMoves(slot, sample) {
    const grid = $("#detail-move-grid");
    const countEl = $("#detail-move-count");
    const saveBtn = $("#btn-save-moves");
    if (!grid || !saveBtn) return;
    const types0 = fighterTypesFromMeta(sample);
    const need0 = requiredMoveCount(types0) || MOVE_SLOTS;
    let draft = normalizeMoves(slot.moves || [], types0);
    function paint() {
      const learn = learnsetForTypes(fighterTypesFromMeta(sample));
      const need = requiredMoveCount(fighterTypesFromMeta(sample)) || MOVE_SLOTS;
      grid.innerHTML = learn
        .map((mv) => {
          const on = draft.includes(mv.id);
          const kind = mv.kind === "status" ? " · status" : "";
          return `<button type="button" class="move-chip ${on ? "is-selected" : ""}" data-move="${escapeHtml(mv.id)}" aria-pressed="${on}">
            <span class="move-name">${escapeHtml(mv.name)}</span>
            <span class="move-meta">${escapeHtml(mv.type)} · PWR ${mv.power}${kind}</span>
          </button>`;
        })
        .join("");
      if (countEl) countEl.textContent = `${draft.length}/${need} selected`;
      grid.querySelectorAll("[data-move]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.move;
          const idx = draft.indexOf(id);
          if (idx >= 0) draft.splice(idx, 1);
          else if (draft.length < need) draft.push(id);
          paint();
        });
      });
    }
    paint();
    saveBtn.onclick = () => {
      const needSave = requiredMoveCount(fighterTypesFromMeta(sample)) || MOVE_SLOTS;
      if (draft.length !== needSave) {
        showToast(`Pick exactly ${needSave} moves`);
        return;
      }
      const live = state.slots.find((s) => s.slotId === slot.slotId);
      if (!live) return;
      live.moves = [...draft];
      saveState();
      showToast("Moves updated");
      openDetail(live);
    };
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
    const types = cardOrSeed.types || seed.types || [];
    const moves = normalizeMoves(cardOrSeed.moves || seed.moves || [], types);
    const battleXp = cardOrSeed.battleXp ?? seed.battleXp ?? 0;
    const level = cardOrSeed.level ?? levelFromXp(battleXp);
    return {
      id: cardOrSeed.id,
      commonName: cardOrSeed.commonName || seed.commonName || cardOrSeed.id,
      scientificName: cardOrSeed.scientificName || seed.scientificName || "",
      emoji: cardOrSeed.emoji || seed.emoji || "🐾",
      photoRef: cardOrSeed.photoRef || seed.photoRef || null,
      kind: cardOrSeed.kind || seed.kind || "other",
      types,
      rarity: cardOrSeed.rarity || seed.rarity || "common",
      bp: cardOrSeed.bp ?? seed.bp ?? 0,
      level,
      battleXp,
      moves,
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
        return enrichFighter({
          ...card,
          source: "slot",
          photoRef: photo,
          level: s.level || 1,
          battleXp: s.battleXp || 0,
          moves: s.moves || [],
        });
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

  /**
   * Catalogue BP: rarity-banded base scaled by level inside band.
   * leveledBp = round(baseBp * (1 + 0.02*(level-1))); habitat affinity overlap → ×1.15.
   */
  function effectiveBp(fighter, habitatId) {
    const base = fighter.bp || 0;
    const lv = Math.max(1, Math.min(MAX_FIGHTER_LEVEL, fighter.level || 1));
    const leveled = Math.round(base * (1 + (lv - 1) * BP_PER_LEVEL));
    const buff =
      Array.isArray(fighter.habitatAffinity) && fighter.habitatAffinity.includes(habitatId);
    return { bp: buff ? Math.round(leveled * 1.15) : leveled, buffed: buff, level: lv };
  }

  function bestMultiplier(atkTypes, defTypes) {
    let maxM = 1;
    (atkTypes || []).forEach((a) => {
      const row = TYPE_CHART[a];
      if (!row) return;
      (defTypes || []).forEach((d) => {
        let m = 1;
        if (row.strong.includes(d)) m = STRONG_MULT;
        else if (row.weak.includes(d)) m = WEAK_MULT;
        if (m > maxM) maxM = m;
      });
    });
    return maxM;
  }

  function pickFoeParty(roster) {
    const pool = roster.slice().sort(() => Math.random() - 0.5);
    return pool.slice(0, 3).map((f) => ({ ...f }));
  }

  /** Catalogue: STAB ×1.2 then Strong/Weak ×1.6/×0.6 on move power. */
  function moveEffectivePower(move, fighter, defTypes) {
    if (!move) return 0;
    let p = move.power || 0;
    if ((fighter.types || []).includes(move.type)) p *= STAB_MULT;
    p *= bestMultiplier([move.type], defTypes);
    return p;
  }

  function bestMovePower(fighter, defTypes) {
    const moves = (fighter.moves || []).map((id) => moveById(id)).filter(Boolean);
    if (!moves.length) {
      // Fallback: treat primary type as a basic strike at power 40
      const t = (fighter.types || [])[0];
      if (!t) return 0;
      return moveEffectivePower({ power: 40, type: t }, fighter, defTypes);
    }
    let best = 0;
    moves.forEach((mv) => {
      const p = moveEffectivePower(mv, fighter, defTypes);
      if (p > best) best = p;
    });
    return best;
  }

  function scoreParty(party, foe, habitatId) {
    let score = 0;
    party.forEach((mine, i) => {
      const theirs = foe[i] || foe[0];
      const myBp = effectiveBp(mine, habitatId).bp;
      const theirBp = effectiveBp(theirs, habitatId).bp;
      const myAtk = bestMovePower(mine, theirs.types);
      const theirAtk = bestMovePower(theirs, mine.types);
      score += myBp + myAtk - (theirBp + theirAtk);
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
          const moveTags = (f.moves || [])
            .slice(0, 4)
            .map((id) => {
              const mv = moveById(id);
              return mv ? `<span class="move-tag">${escapeHtml(mv.name)}</span>` : "";
            })
            .join("");
          return `
            <button type="button" class="fighter-card ${on ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}" data-fighter="${escapeHtml(f.id)}">
              ${fighterThumb(f)}
              <div>
                <div class="fighter-name">${escapeHtml(label)}</div>
                <div class="type-chips">${types}</div>
                <div class="fighter-sub"><span class="lv-pill">Lv ${f.level || 1}</span> ${escapeHtml(f.rarity)}</div>
                <div class="move-tags">${moveTags}</div>
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
        const xpOut = applyBattleXpToSlots(battle.partyIds, won);
        saveState();
        battle.lastResult = {
          won,
          score,
          ratingDelta,
          party,
          foe: battle.foeParty,
          opponent: battle.opponent,
          opponentRating: battle.opponentRating,
          fighterXp: xpOut.gain,
          leveled: xpOut.leveled,
        };
        battle.step = "resolving";
        renderBattle();
        setTimeout(() => {
          if (battle.step !== "resolving") return;
          battle.step = "results";
          renderBattle();
          if (xpOut.leveled.length) {
            showToast(xpOut.leveled.map((x) => `Level up → Lv ${x.level}`).join(" · "));
          }
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
                const live = (state.slots || []).find((s) => s.taxonId === f.id);
                const lv = live ? live.level || levelFromXp(live.battleXp || 0) : f.level || 1;
                const fLive = { ...f, level: lv };
                const { bp, buffed } = effectiveBp(fLive, battle.habitat);
                const types = (f.types || [])
                  .map((t) => `<span class="type-chip">${escapeHtml(t)}</span>`)
                  .join("");
                const name = (f.commonName || "").replace(/^SAMPLE:\s*/i, "");
                const moveTags = (f.moves || [])
                  .slice(0, 4)
                  .map((id) => {
                    const mv = moveById(id);
                    return mv ? `<span class="move-tag">${escapeHtml(mv.name)}</span>` : "";
                  })
                  .join("");
                return `
                <div class="fighter-card" style="margin-bottom:8px">
                  ${fighterThumb(f)}
                  <div>
                    <div class="fighter-name">${escapeHtml(name)}</div>
                    <div class="fighter-sub"><span class="lv-pill">Lv ${lv}</span></div>
                    <div class="type-chips">${types}</div>
                    <div class="move-tags">${moveTags}</div>
                    <div class="matchup-row">
                      ${strong.slice(0, 2).map((t) => `<span class="strong-chip">×${STRONG_MULT} ${escapeHtml(t)}</span>`).join("")}
                      ${weak.slice(0, 2).map((t) => `<span class="weak-chip">×${WEAK_MULT} ${escapeHtml(t)}</span>`).join("")}
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
              <p class="muted small">Fighters +${res.fighterXp || 0} battle XP each${
                res.leveled && res.leveled.length
                  ? ` · ${res.leveled.length} leveled up`
                  : ""
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
