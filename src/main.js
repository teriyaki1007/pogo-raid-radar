const PLACEHOLDER_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="16" fill="#1a243c"/>
      <circle cx="60" cy="58" r="28" fill="none" stroke="#f5c542" stroke-width="4"/>
      <path d="M32 58h56" stroke="#f5c542" stroke-width="4"/>
      <circle cx="60" cy="58" r="8" fill="#0b1020" stroke="#f5c542" stroke-width="3"/>
    </svg>`
  );

const TIER_ORDER = ["1", "3", "5", "mega", "super-mega", "shadow-1", "shadow-3", "shadow-5"];

const TIER_TITLES = {
  "1": "1-Star",
  "3": "3-Star",
  "5": "5-Star / Legendary",
  mega: "Mega",
  "super-mega": "Super Mega",
  "shadow-1": "Shadow 1★",
  "shadow-3": "Shadow 3★",
  "shadow-5": "Shadow 5★",
};

let data = null;
let eggsData = null;
let rocketData = null;
let activeTab = "current";

const $ = (sel) => document.querySelector(sel);

const TYPE_COLORS = {
  Normal: "#a8a878",
  Fire: "#f08030",
  Water: "#6890f0",
  Electric: "#f8d030",
  Grass: "#78c850",
  Ice: "#98d8d8",
  Fighting: "#c03028",
  Poison: "#a040a0",
  Ground: "#e0c068",
  Flying: "#a890f0",
  Psychic: "#f85888",
  Bug: "#a8b820",
  Rock: "#b8a038",
  Ghost: "#705898",
  Dragon: "#7038f8",
  Dark: "#705848",
  Steel: "#b8b8d0",
  Fairy: "#ee99ac",
};

function typeChipStyle(typeName) {
  const base = typeName.replace(/\s*2[×x].*$/i, "").trim();
  const color = TYPE_COLORS[base] || "#9aabca";
  return `background:${color}22;color:${color};border-color:${color}66`;
}

function renderWeakTo(boss) {
  const weak = boss.weakTo || [];
  if (!weak.length) return "";
  const chips = weak
    .map((t) => {
      const label = escapeHtml(t);
      return `<span class="type-chip" style="${typeChipStyle(t)}">${label}</span>`;
    })
    .join("");
  return `
    <div class="battle-block">
      <span class="battle-label">Weak to</span>
      <div class="type-chips">${chips}</div>
    </div>`;
}

function renderCounters(boss) {
  const counters = boss.counters || [];
  if (!counters.length) return "";
  const note =
    boss.countersSource === "type"
      ? `<span class="counters-note">Type-based picks</span>`
      : "";
  const items = counters
    .slice(0, 6)
    .map((c) => {
      const moves = c.moves ? `<span class="counter-moves">${escapeHtml(c.moves)}</span>` : "";
      const extra = c.notes && !c.moves ? `<span class="counter-moves">${escapeHtml(c.notes)}</span>` : "";
      return `<li><span class="counter-name">${escapeHtml(c.name)}</span>${moves}${extra}</li>`;
    })
    .join("");
  return `
    <div class="battle-block counters-block">
      <div class="battle-label-row">
        <span class="battle-label">Best counters</span>
        ${note}
      </div>
      <ul class="counter-list">${items}</ul>
    </div>`;
}

function renderBossTypes(boss) {
  const types = boss.types || [];
  if (!types.length) return "";
  return `<div class="boss-types">${types
    .map((t) => `<span class="type-chip boss-type" style="${typeChipStyle(t)}">${escapeHtml(t)}</span>`)
    .join("")}</div>`;
}

function badgeClass(tier) {
  if (String(tier).startsWith("shadow")) return "badge-shadow";
  if (tier === "mega") return "badge-mega";
  if (tier === "super-mega") return "badge-super-mega";
  if (tier === "5") return "badge-5";
  if (tier === "3") return "badge-3";
  return "badge-1";
}

function formatCp(n) {
  if (n == null || n === "") return null;
  return String(n);
}

function spriteUrl(entity) {
  return entity.sprite?.url || PLACEHOLDER_SVG;
}

function handleImgError(img, entity) {
  const tried = Number(img.dataset.fallbackStep || "0");
  if (tried === 0 && entity.fallbackSprite) {
    img.dataset.fallbackStep = "1";
    img.src = entity.fallbackSprite;
    return;
  }
  if (tried <= 1 && entity.sprite?.pokeapiId) {
    img.dataset.fallbackStep = "2";
    img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entity.sprite.pokeapiId}.png`;
    return;
  }
  if (tried <= 2 && entity.pokeapiId) {
    img.dataset.fallbackStep = "3";
    img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entity.pokeapiId}.png`;
    return;
  }
  img.dataset.fallbackStep = "4";
  img.src = PLACEHOLDER_SVG;
  img.alt = "";
  img.classList.add("art-fallback");
}

function bindSpriteFallbacks(root, entitiesById) {
  root.querySelectorAll("img[data-entity-id]").forEach((img) => {
    const id = img.dataset.entityId;
    const entity = entitiesById.get(id) || {};
    img.addEventListener("error", () => handleImgError(img, entity));
  });
}

function renderBossCard(boss) {
  const cp20 = formatCp(boss.cpL20);
  const cp25 = formatCp(boss.cpL25);
  const weather = (boss.weather || []).join(" / ") || "—";
  const shinyClass = boss.shiny ? "shiny-yes" : "shiny-no";
  const shinyText = boss.shiny ? "Yes" : "No";
  const shinyRate = boss.shinyRate || "not published";
  const classes = ["card"];
  if (boss.highlight) classes.push("is-highlight");
  if (boss.isShadow) classes.push("is-shadow");

  const chips = [];
  if (boss.catchForm) chips.push(`<span class="chip">Catch: ${escapeHtml(boss.catchForm)}</span>`);
  if (boss.region) chips.push(`<span class="chip region">${escapeHtml(boss.region)}</span>`);
  if (boss.event) chips.push(`<span class="chip event">${escapeHtml(boss.event)}</span>`);

  return `
    <article class="${classes.join(" ")}" data-id="${escapeHtml(boss.id)}">
      <div class="art ${boss.isShadow ? "is-shadow" : ""}">
        <img
          src="${escapeHtml(spriteUrl(boss))}"
          alt="${escapeHtml(boss.name)}"
          loading="lazy"
          decoding="async"
          data-entity-id="${escapeHtml(boss.id)}"
          width="90"
          height="90"
        />
      </div>
      <div class="card-body">
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(boss.name)}</h3>
            ${boss.form ? `<span class="form">${escapeHtml(boss.form)}</span>` : ""}
            ${renderBossTypes(boss)}
          </div>
          <span class="badge ${badgeClass(boss.tier)}">${escapeHtml(boss.tierLabel || boss.tier)}</span>
        </div>
        <p class="meta-row"><strong>Window:</strong> ${escapeHtml(boss.window)}</p>
        ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
        ${renderWeakTo(boss)}
        ${renderCounters(boss)}
        <div class="stats">
          <div class="stat">
            <span class="stat-label">Shiny</span>
            <span class="stat-value ${shinyClass}">${shinyText}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Shiny rate</span>
            <span class="stat-value" style="font-size:0.72rem;font-weight:700;line-height:1.25">${escapeHtml(shinyRate)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Hundo</span>
            <span class="stat-value">${escapeHtml(boss.hundoRate || "—")}</span>
          </div>
          <div class="stat">
            <span class="stat-label">IV floor</span>
            <span class="stat-value">${escapeHtml(boss.ivFloor || "—")}</span>
          </div>
        </div>
        <div class="stats" style="margin-top:0.35rem">
          <div class="stat">
            <span class="stat-label">100IV L20</span>
            <span class="stat-value ${cp20 ? "" : "unknown"}">${cp20 ?? "Unknown"}</span>
          </div>
          <div class="stat">
            <span class="stat-label">100IV L25</span>
            <span class="stat-value ${cp25 ? "" : "unknown"}">${cp25 ?? "Unknown"}</span>
          </div>
          <div class="stat" style="grid-column: span 2">
            <span class="stat-label">Weather boost</span>
            <span class="stat-value" style="font-size:0.8rem">${escapeHtml(weather)}</span>
          </div>
        </div>
        ${boss.notes ? `<p class="notes">${escapeHtml(boss.notes)}</p>` : ""}
      </div>
    </article>
  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bossesForTab(tab) {
  const bosses = data.bosses || [];
  if (tab === "current") return bosses.filter((b) => b.category === "current");
  if (tab === "upcoming") return bosses.filter((b) => b.category === "upcoming");
  if (tab === "shadow") return bosses.filter((b) => b.category === "shadow" || b.isShadow);
  return [];
}

function groupByTier(bosses) {
  const map = new Map();
  for (const b of bosses) {
    const key = b.tier;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  }
  const keys = [...map.keys()].sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a);
    const ib = TIER_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return keys.map((k) => ({ tier: k, title: TIER_TITLES[k] || k, bosses: map.get(k) }));
}

function renderEvents() {
  const events = data.events || [];
  if (!events.length) {
    return `<div class="empty">No events listed.</div>`;
  }
  return `
    <div class="event-list">
      ${events
        .map(
          (e) => `
        <article class="event-card ${e.urgent ? "is-urgent" : ""}">
          <p class="event-when">${escapeHtml(e.when)}</p>
          <h3 class="event-title">${escapeHtml(e.title)}</h3>
          <p class="event-impact">${escapeHtml(e.impact)}</p>
        </article>`
        )
        .join("")}
    </div>
  `;
}

function shinyLabel(shiny) {
  if (shiny === true) return { text: "Shiny", className: "shiny-yes" };
  if (shiny === false) return { text: "No shiny", className: "shiny-no" };
  return { text: "Shiny ?", className: "shiny-unknown" };
}

function renderEggMonChip(mon, id) {
  const shiny = shinyLabel(mon.shiny);
  const form = mon.form ? `<span class="form">${escapeHtml(mon.form)}</span>` : "";
  const notes = mon.notes ? `<p class="notes">${escapeHtml(mon.notes)}</p>` : "";
  return `
    <article class="mini-card" data-id="${escapeHtml(id)}">
      <div class="art art-sm">
        <img
          src="${escapeHtml(spriteUrl(mon))}"
          alt="${escapeHtml(mon.name)}"
          loading="lazy"
          decoding="async"
          data-entity-id="${escapeHtml(id)}"
          width="64"
          height="64"
        />
      </div>
      <div class="mini-body">
        <h3 class="card-title mini-title">${escapeHtml(mon.name)}</h3>
        ${form}
        <span class="stat-value ${shiny.className}" style="font-size:0.75rem">${shiny.text}</span>
        ${notes}
      </div>
    </article>`;
}

function renderEggs() {
  if (!eggsData?.eggs?.length) {
    return `<div class="empty">No egg pool data loaded.</div>`;
  }
  const meta = eggsData.meta || {};
  const entityMap = new Map();
  const seasonNote = meta.season
    ? `<p class="section-lead"><strong>${escapeHtml(meta.season)}</strong>${
        meta.seasonWindow ? ` · ${escapeHtml(meta.seasonWindow)}` : ""
      }</p>`
    : "";
  const metaNotes = (meta.notes || [])
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");

  const pools = eggsData.eggs
    .map((pool) => {
      const incomplete = pool.incomplete
        ? `<p class="incomplete-flag">Incomplete / still being confirmed${
            pool.incompleteNote ? `: ${escapeHtml(pool.incompleteNote)}` : ""
          }</p>`
        : "";
      const cards = (pool.pokemon || [])
        .map((mon, i) => {
          const id = `egg-${pool.id}-${i}`;
          entityMap.set(id, mon);
          return renderEggMonChip(mon, id);
        })
        .join("");
      return `
        <section class="tier-group" aria-label="${escapeHtml(pool.label)}">
          <h2>${escapeHtml(pool.label)}</h2>
          <p class="meta-row"><strong>Source:</strong> ${escapeHtml(pool.source || "—")}</p>
          ${pool.window ? `<p class="meta-row"><strong>Window:</strong> ${escapeHtml(pool.window)}</p>` : ""}
          ${incomplete}
          <div class="mini-grid">${cards}</div>
        </section>`;
    })
    .join("");

  const eventNote = eggsData.eventEggsNote
    ? `<section class="info-card"><p class="meta-row">${escapeHtml(eggsData.eventEggsNote)}</p></section>`
    : "";

  const html = `
    ${seasonNote}
    ${metaNotes ? `<ul class="note-list">${metaNotes}</ul>` : ""}
    ${eventNote}
    ${pools}
  `;

  return { html, entityMap };
}

function renderLineupPhases(lineups, idPrefix = "") {
  if (!lineups?.length) return "";
  return `
    <div class="lineup-phases">
      ${lineups
        .map((phase, idx) => {
          if (!phase?.length) return "";
          const names = phase
            .map((p) => {
              const star = p.shinyEncounter ? "*" : "";
              return escapeHtml(p.name) + star;
            })
            .join(" · ");
          return `
            <div class="lineup-phase">
              <span class="battle-label">Phase ${idx + 1}</span>
              <div class="phase-sprites">
                ${phase
                  .map((p, i) => {
                    const id = `${idPrefix}-phase-sprite-${idx}-${i}-${p.name}`;
                    return `<img src="${escapeHtml(spriteUrl(p))}" alt="${escapeHtml(p.name)}" title="${escapeHtml(
                      p.name
                    )}" loading="lazy" data-entity-id="${escapeHtml(id)}" width="40" height="40" />`;
                  })
                  .join("")}
              </div>
              <p class="phase-names">${names}</p>
            </div>`;
        })
        .join("")}
    </div>`;
}

function collectLineupEntities(prefix, lineups, map) {
  (lineups || []).forEach((phase, idx) => {
    (phase || []).forEach((p, i) => {
      map.set(`${prefix}-phase-sprite-${idx}-${i}-${p.name}`, p);
    });
  });
}

function renderRocketCard(title, entity, idPrefix) {
  const types = (entity.types || []).map((t) => `<span class="type-chip" style="${typeChipStyle(t)}">${escapeHtml(t)}</span>`).join("");
  const quote = entity.quote ? `<p class="rocket-quote">“${escapeHtml(entity.quote)}”</p>` : "";
  const gender = entity.gender ? `<span class="chip">${escapeHtml(entity.gender)}</span>` : "";
  const notes = entity.notes ? `<p class="notes">${escapeHtml(entity.notes)}</p>` : "";
  const active =
    entity.activeNote != null
      ? `<p class="meta-row"><strong>Status:</strong> ${escapeHtml(entity.activeNote)}</p>`
      : "";
  const legendary = entity.legendary
    ? `<p class="meta-row"><strong>Legendary:</strong> Shadow ${escapeHtml(entity.legendary)}${
        entity.legendaryNote ? ` — ${escapeHtml(entity.legendaryNote)}` : ""
      }</p>`
    : "";

  return `
    <article class="rocket-card" data-id="${escapeHtml(idPrefix)}">
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(title)}</h3>
          ${quote}
          ${types ? `<div class="boss-types">${types}</div>` : ""}
        </div>
        ${gender}
      </div>
      ${active}
      ${legendary}
      ${renderLineupPhases(entity.lineups, idPrefix)}
      ${renderWeakTo(entity)}
      ${renderCounters(entity)}
      ${notes}
    </article>`;
}

function renderRocket() {
  if (!rocketData) {
    return `<div class="empty">No Rocket data loaded.</div>`;
  }
  const entityMap = new Map();
  const notes = (rocketData.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  const metaNotes = (rocketData.meta?.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");

  const leadersHtml = (rocketData.leaders || [])
    .map((leader, i) => {
      const id = `leader-${i}`;
      collectLineupEntities(id, leader.lineups, entityMap);
      return renderRocketCard(leader.name, leader, id);
    })
    .join("");

  let giovanniHtml = "";
  if (rocketData.giovanni) {
    collectLineupEntities("giovanni", rocketData.giovanni.lineups, entityMap);
    giovanniHtml = renderRocketCard("Giovanni", rocketData.giovanni, "giovanni");
  }

  const gruntsHtml = (rocketData.grunts || [])
    .map((grunt, i) => {
      const id = `grunt-${i}`;
      collectLineupEntities(id, grunt.lineups, entityMap);
      const label = grunt.types?.length
        ? `${grunt.types.join("/")} Grunt`
        : `Grunt ${i + 1}`;
      return renderRocketCard(label, grunt, id);
    })
    .join("");

  const html = `
    ${notes || metaNotes ? `<ul class="note-list">${notes}${metaNotes}</ul>` : ""}
    <section class="tier-group" aria-label="Leaders">
      <h2>Leaders</h2>
      <div class="rocket-stack">${leadersHtml}</div>
    </section>
    ${
      giovanniHtml
        ? `<section class="tier-group" aria-label="Giovanni"><h2>Giovanni</h2><div class="rocket-stack">${giovanniHtml}</div></section>`
        : ""
    }
    <section class="tier-group" aria-label="Grunts">
      <h2>Grunts</h2>
      <div class="rocket-stack">${gruntsHtml}</div>
    </section>
  `;

  return { html, entityMap };
}

function renderPanel() {
  const panel = $("#panel");
  const legend = $("#legend");

  if (activeTab === "eggs" || activeTab === "rocket") {
    legend.hidden = true;
  } else {
    legend.hidden = false;
  }

  if (activeTab === "events") {
    panel.innerHTML = renderEvents();
    return;
  }

  if (activeTab === "eggs") {
    const result = renderEggs();
    if (typeof result === "string") {
      panel.innerHTML = result;
      return;
    }
    panel.innerHTML = result.html;
    bindSpriteFallbacks(panel, result.entityMap);
    return;
  }

  if (activeTab === "rocket") {
    const result = renderRocket();
    if (typeof result === "string") {
      panel.innerHTML = result;
      return;
    }
    panel.innerHTML = result.html;
    bindSpriteFallbacks(panel, result.entityMap);
    return;
  }

  const bosses = bossesForTab(activeTab);
  if (!bosses.length) {
    panel.innerHTML = `<div class="empty">No bosses in this view.</div>`;
    return;
  }

  const groups = groupByTier(bosses);
  panel.innerHTML = groups
    .map(
      (g) => `
      <section class="tier-group" aria-label="${escapeHtml(g.title)}">
        <h2>${escapeHtml(g.title)}</h2>
        <div class="cards">
          ${g.bosses.map(renderBossCard).join("")}
        </div>
      </section>`
    )
    .join("");

  const map = new Map((data.bosses || []).map((b) => [b.id, b]));
  bindSpriteFallbacks(panel, map);
}

function renderMeta() {
  const meta = data.meta || {};
  if (meta.tagline) $("#tagline").textContent = meta.tagline;
  $("#as-of").textContent = `As of ${meta.asOfLabel || meta.asOf || "—"}`;

  const callout = $("#callout");
  if (meta.callout?.text) {
    callout.hidden = false;
    callout.innerHTML = `<strong>Heads up:</strong> ${escapeHtml(meta.callout.text)}`;
  }

  const legend = meta.legend || {};
  $("#legend").innerHTML = `
    <h2>IV floors & hundo rates</h2>
    <div class="legend-grid">
      <div class="legend-item">
        <strong>${escapeHtml(legend.standard?.label || "Standard raids")}:</strong>
        ${escapeHtml(legend.standard?.ivFloor || "10/10/10")} → hundo ${escapeHtml(legend.standard?.hundoRate || "1/216")}
        · ${escapeHtml(legend.standard?.catchLevels || "L20 / L25 weather")}
      </div>
      <div class="legend-item">
        <strong>${escapeHtml(legend.shadow?.label || "Shadow raids")}:</strong>
        ${escapeHtml(legend.shadow?.ivFloor || "6/6/6")} → hundo ${escapeHtml(legend.shadow?.hundoRate || "1/1000")}
        · ${escapeHtml(legend.shadow?.catchLevels || "L20 / L25 weather")}
      </div>
    </div>
    <p class="legend-note">${escapeHtml(legend.shinyNote || "")}</p>
  `;

  const sources = [
    ...(meta.sources || []),
    ...((eggsData?.meta?.sources || []).filter((s) => !(meta.sources || []).some((m) => m.url === s.url))),
    ...((rocketData?.meta?.sources || []).filter(
      (s) =>
        !(meta.sources || []).some((m) => m.url === s.url) &&
        !(eggsData?.meta?.sources || []).some((m) => m.url === s.url)
    )),
  ];
  $("#footer").innerHTML = `
    <div class="footer-links">
      ${sources
        .map((s) => `<a href="${escapeHtml(s.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(s.name)}</a>`)
        .join("")}
    </div>
    <p class="disclaimer">${escapeHtml(meta.disclaimer || "")}</p>
  `;
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab").forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  renderPanel();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
}

async function fetchJson(path) {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

async function init() {
  const panel = $("#panel");
  panel.innerHTML = `<div class="loading">Loading game data…</div>`;
  try {
    const [raids, eggs, rocket] = await Promise.all([
      fetchJson("data/raids.json"),
      fetchJson("data/eggs.json"),
      fetchJson("data/rocket.json"),
    ]);
    data = raids;
    eggsData = eggs;
    rocketData = rocket;
    renderMeta();
    bindTabs();
    setTab("current");
  } catch (err) {
    console.error(err);
    panel.innerHTML = `<div class="error">Could not load data. Check <code>public/data/*.json</code>.</div>`;
  }
}

init();
