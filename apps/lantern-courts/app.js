(() => {
  "use strict";

  const COURT_CLASS = {
    "Celestial Bureau": "bureau",
    "Yokai Alleys": "alleys",
    "Mountain Kin": "kin",
    "Colorless": "colorless",
  };

  const COURT_SHORT = {
    "Celestial Bureau": "Bureau",
    "Yokai Alleys": "Alleys",
    "Mountain Kin": "Kin",
    "Colorless": "Colorless",
  };

  const state = {
    data: null,
    tab: "creatures",
    court: "all",
    rarity: "all",
    query: "",
    activeItem: null,
  };

  const els = {
    tagline: document.getElementById("tagline"),
    countCreatures: document.getElementById("count-creatures"),
    countStadiums: document.getElementById("count-stadiums"),
    countSupports: document.getElementById("count-supports"),
    gridCreatures: document.getElementById("grid-creatures"),
    gridStadiums: document.getElementById("grid-stadiums"),
    gridSupports: document.getElementById("grid-supports"),
    panelCreatures: document.getElementById("panel-creatures"),
    panelStadiums: document.getElementById("panel-stadiums"),
    panelSupports: document.getElementById("panel-supports"),
    emptyCreatures: document.getElementById("empty-creatures"),
    emptyStadiums: document.getElementById("empty-stadiums"),
    emptySupports: document.getElementById("empty-supports"),
    search: document.getElementById("search"),
    filters: document.getElementById("filters"),
    rarityFilters: document.getElementById("rarity-filters"),
    tabs: document.querySelectorAll(".tab"),
    modal: document.getElementById("modal"),
    modalBackdrop: document.getElementById("modal-backdrop"),
    modalClose: document.getElementById("modal-close"),
    modalDialog: document.querySelector(".modal-dialog"),
    modalImage: document.getElementById("modal-image"),
    modalNumber: document.getElementById("modal-number"),
    modalName: document.getElementById("modal-name"),
    modalCourt: document.getElementById("modal-court"),
    modalTags: document.getElementById("modal-tags"),
    modalStats: document.getElementById("modal-stats"),
    modalFavor: document.getElementById("modal-favor"),
    modalMight: document.getElementById("modal-might"),
    modalStory: document.getElementById("modal-story"),
    modalUsage: document.getElementById("modal-usage"),
    loadError: document.getElementById("load-error"),
  };

  function courtClass(court) {
    return COURT_CLASS[court] || "";
  }

  function courtLabel(court) {
    return COURT_SHORT[court] || court;
  }

  function matchesFilters(item) {
    if (state.court !== "all" && item.court !== state.court) return false;
    if (state.rarity !== "all" && item.rarity != null && item.rarity !== state.rarity) return false;
    if (!state.query) return true;
    return item.name.toLowerCase().includes(state.query);
  }

  function createCard(item, kind) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.dataset.id = item.id;
    btn.dataset.kind = kind;
    btn.setAttribute("aria-label", `${item.name}, ${item.court}`);

    const thumb = document.createElement("div");
    thumb.className = "card-thumb";

    const img = document.createElement("img");
    img.src = item.image;
    img.alt = item.name;
    img.loading = "lazy";
    thumb.appendChild(img);

    const num = document.createElement("span");
    num.className = "card-number";
    num.textContent = `#${item.number}`;
    thumb.appendChild(num);

    const body = document.createElement("div");
    body.className = "card-body";

    const name = document.createElement("h3");
    name.className = "card-name";
    name.textContent = item.name;

    const badge = document.createElement("span");
    badge.className = `court-badge ${courtClass(item.court)}`;
    badge.textContent = courtLabel(item.court);

    body.appendChild(name);
    body.appendChild(badge);
    btn.appendChild(thumb);
    btn.appendChild(body);

    btn.addEventListener("click", () => openModal(item));
    return btn;
  }

  function renderGrids() {
    const creatures = (state.data.creatures || []).filter(matchesFilters);
    const stadiums = (state.data.environments || []).filter(matchesFilters);
    const supports = (state.data.support || []).filter(matchesFilters);

    els.gridCreatures.replaceChildren(...creatures.map((c) => createCard(c, "creature")));
    els.gridStadiums.replaceChildren(...stadiums.map((e) => createCard(e, "stadium")));
    els.gridSupports.replaceChildren(...supports.map((s) => createCard(s, "support")));

    els.emptyCreatures.hidden = creatures.length > 0;
    els.emptyStadiums.hidden = stadiums.length > 0;
    els.emptySupports.hidden = supports.length > 0;
  }

  function openModal(item) {
    state.activeItem = item;

    els.modalImage.src = item.image;
    els.modalImage.alt = item.name;
    els.modalNumber.textContent = `#${item.number}`;
    els.modalName.textContent = item.name;

    els.modalCourt.className = `court-badge ${courtClass(item.court)}`;
    els.modalCourt.textContent = item.court;

    els.modalTags.replaceChildren();
    if (item.type) {
      const t = document.createElement("span");
      t.className = "tag";
      t.textContent = item.type;
      els.modalTags.appendChild(t);
    }
    if (item.rarity) {
      const r = document.createElement("span");
      r.className = `tag rarity-${item.rarity.toLowerCase()}`;
      r.textContent = item.rarity;
      els.modalTags.appendChild(r);
    }

    const hasFavor = item.favor != null;
    const hasMightField = item.might != null;
    const hasStats = hasFavor || hasMightField;
    els.modalStats.hidden = !hasStats;
    if (hasStats) {
      els.modalFavor.textContent = hasFavor ? item.favor : "—";
      const mightNA = item.might == null || item.might === "N/A";
      els.modalMight.textContent = mightNA ? "—" : item.might;
    }

    els.modalStory.textContent = item.story || "";
    els.modalUsage.textContent = item.usage || "";

    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    els.modalClose.focus();
  }

  function closeModal() {
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    state.activeItem = null;
  }

  function setTab(tab) {
    state.tab = tab;
    els.tabs.forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.panelCreatures.hidden = tab !== "creatures";
    els.panelStadiums.hidden = tab !== "stadiums";
    els.panelSupports.hidden = tab !== "supports";
    if (els.rarityFilters) {
      // Hide rarity filters only for stadiums; supports have rarity.
      const stadiums = tab === "stadiums";
      els.rarityFilters.hidden = stadiums;
      els.rarityFilters.setAttribute("aria-hidden", stadiums ? "true" : "false");
      els.rarityFilters.classList.toggle("disabled", stadiums);
      els.rarityFilters.querySelectorAll(".chip").forEach((c) => {
        c.disabled = stadiums;
      });
    }
  }

  function bindUI() {
    els.tabs.forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.dataset.tab));
    });

    els.search.addEventListener("input", () => {
      state.query = els.search.value.trim().toLowerCase();
      renderGrids();
    });

    els.filters.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.court = chip.dataset.court;
      els.filters.querySelectorAll(".chip").forEach((c) => {
        c.classList.toggle("active", c === chip);
      });
      renderGrids();
    });

    if (els.rarityFilters) {
      els.rarityFilters.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip || chip.disabled) return;
        state.rarity = chip.dataset.rarity;
        els.rarityFilters.querySelectorAll(".chip").forEach((c) => {
          c.classList.toggle("active", c === chip);
        });
        renderGrids();
      });
    }

    els.modalClose.addEventListener("click", closeModal);
    els.modalBackdrop.addEventListener("click", closeModal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.modal.hidden) {
        closeModal();
      }
    });
  }

  async function init() {
    bindUI();
    try {
      const res = await fetch("dex.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      console.error(err);
      els.loadError.hidden = false;
      return;
    }

    if (state.data.tagline) {
      els.tagline.textContent = state.data.tagline;
    }

    els.countCreatures.textContent = String((state.data.creatures || []).length);
    els.countStadiums.textContent = String((state.data.environments || []).length);
    els.countSupports.textContent = String((state.data.support || []).length);

    renderGrids();
  }

  init();
})();
