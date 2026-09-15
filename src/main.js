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
let activeTab = "current";

const $ = (sel) => document.querySelector(sel);

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

function spriteUrl(boss) {
  return boss.sprite?.url || PLACEHOLDER_SVG;
}

function handleImgError(img, boss) {
  const tried = Number(img.dataset.fallbackStep || "0");
  if (tried === 0 && boss.fallbackSprite) {
    img.dataset.fallbackStep = "1";
    img.src = boss.fallbackSprite;
    return;
  }
  if (tried <= 1 && boss.sprite?.pokeapiId) {
    img.dataset.fallbackStep = "2";
    img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${boss.sprite.pokeapiId}.png`;
    return;
  }
  img.dataset.fallbackStep = "3";
  img.src = PLACEHOLDER_SVG;
  img.alt = "";
  img.classList.add("art-fallback");
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
          data-boss-id="${escapeHtml(boss.id)}"
          width="90"
          height="90"
        />
      </div>
      <div class="card-body">
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(boss.name)}</h3>
            ${boss.form ? `<span class="form">${escapeHtml(boss.form)}</span>` : ""}
          </div>
          <span class="badge ${badgeClass(boss.tier)}">${escapeHtml(boss.tierLabel || boss.tier)}</span>
        </div>
        <p class="meta-row"><strong>Window:</strong> ${escapeHtml(boss.window)}</p>
        ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
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

function renderPanel() {
  const panel = $("#panel");
  if (activeTab === "events") {
    panel.innerHTML = renderEvents();
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

  panel.querySelectorAll("img[data-boss-id]").forEach((img) => {
    const id = img.dataset.bossId;
    const boss = (data.bosses || []).find((b) => b.id === id);
    img.addEventListener("error", () => handleImgError(img, boss || {}));
  });
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

  const sources = meta.sources || [];
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

async function init() {
  const panel = $("#panel");
  panel.innerHTML = `<div class="loading">Loading raid data…</div>`;
  try {
    const res = await fetch("./data/raids.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load raids.json (${res.status})`);
    data = await res.json();
    renderMeta();
    bindTabs();
    setTab("current");
  } catch (err) {
    console.error(err);
    panel.innerHTML = `<div class="error">Could not load raid data. Check <code>public/data/raids.json</code>.</div>`;
  }
}

init();
