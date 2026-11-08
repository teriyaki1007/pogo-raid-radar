/**
 * Project Nature — /nature/ demo mount (v0.1 UI + demo JSON)
 * Loads shared speciesCards from data/catalogue-demo.json.
 * Personal dex / sightings / XP stay in localStorage (per browser).
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

  let catalogue = null;
  let speciesCards = [];
  let SLOT_COUNT = 12;
  let XP = { ...DEFAULT_XP };

  let state = null;
  let pendingSighting = null;
  let photoDataUrl = null;
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

    speciesCards = Array.isArray(catalogue.speciesCards) ? catalogue.speciesCards : [];
    SLOT_COUNT = catalogue.meta?.slotCount || 12;
    XP = { ...DEFAULT_XP, ...(catalogue.meta?.xp || {}) };

    state = loadState();
    setDefaultDatetime();
    bindAuth();
    bindCapture();
    bindConfirm();
    bindNav();
    bindLogout();

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

    authForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = $("#auth-username").value.trim();
      const password = $("#auth-password").value;
      if (!username || password.length < 4) {
        showToast("Enter a username and password (4+ chars)");
        return;
      }

      // Mock only — password not stored. Personal dex stays private in this browser.
      const isFresh =
        !state.user &&
        state.sightings.length === 0 &&
        state.slots.every((s) => s.status === "empty");
      state.user = { username, demo: true };

      // First login as "demo" with empty personal state → seed from demoUser JSON
      if (isFresh && username.toLowerCase() === "demo" && catalogue?.demoUser) {
        const seeded = seedFromDemoUser();
        state.slots = seeded.slots;
        state.sightings = seeded.sightings;
        state.progress = seeded.progress;
        state.user = { username, demo: true };
        showToast(`Logged in as ${username} (seeded demo dex)`);
      } else {
        showToast(authMode === "signup" ? `Welcome, ${username}` : `Logged in as ${username}`);
      }

      saveState();
      enterApp();
    });
  }

  function bindLogout() {
    $("#btn-logout").addEventListener("click", () => {
      state.user = null;
      saveState();
      pendingSighting = null;
      photoDataUrl = null;
      resetCaptureForm();
      showScreen("auth");
      showToast("Logged out (demo)");
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

  function handlePhotoFile(file) {
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoDataUrl = reader.result;
      photoDrop.classList.add("has-photo");
      photoDrop.classList.remove("is-empty");
      photoPreview.innerHTML = `<img src="${photoDataUrl}" alt="Sighting photo preview" />`;
      btnIdentify.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  function resetCaptureForm() {
    captureForm.reset();
    setDefaultDatetime();
    photoDataUrl = null;
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
    resetCaptureForm();
    renderProgress();
    renderDex();
    showPanel("dex");

    const parts = [`+${xpGain} XP`];
    if (filledNew) parts.push("new slot");
    if (streakGain) parts.push("streak");
    if (newBadges.length) parts.push(`badge ×${newBadges.length}`);
    showToast(`Collected · ${parts.join(" · ")}`);
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
        }
      });
    });
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
