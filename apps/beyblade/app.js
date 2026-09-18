/**
 * Beyblade X coaching SPA — loads data/parts.json (relative) and scores combos.
 * Works offline from local files when served as static assets (or via file:// with caveats).
 */
import { scoreCombo, gradeColor } from "./score.js";

const state = {
  data: null,
  bladeId: "",
  ratchetId: "",
  bitId: "",
  partsCat: "blades",
  partsQuery: "",
};

const $ = (sel) => document.querySelector(sel);

async function loadData() {
  const res = await fetch("data/parts.json");
  if (!res.ok) throw new Error(`Failed to load parts.json (${res.status})`);
  return res.json();
}

function byId(list, id) {
  return (list || []).find((p) => p.id === id) || null;
}

function filterList(list, q) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return list;
  return list.filter((p) => {
    const hay = [
      p.name,
      p.abbr,
      p.type,
      p.tier,
      p.code,
      p.shorthand,
      ...(p.pros || []),
      ...(p.bestCombos || []),
      ...(p.bestPartners || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(s);
  });
}

function optionLabel(p, kind) {
  const tier = p.tier || "?";
  if (kind === "ratchet") return `${p.abbr || p.name} · ${tier}`;
  if (kind === "bit") return `${p.name} (${p.abbr}) · ${tier}`;
  return `${p.name} · ${p.type || "?"} · ${tier}`;
}

function fillSelect(selectEl, list, kind, selectedId) {
  const prev = selectedId || selectEl.value;
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = `— select ${kind} —`;
  selectEl.appendChild(ph);
  for (const p of list) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = optionLabel(p, kind);
    selectEl.appendChild(opt);
  }
  if (prev && list.some((p) => p.id === prev)) {
    selectEl.value = prev;
  } else {
    selectEl.value = "";
  }
}

function refreshBuilderSelects() {
  const { blades, ratchets, bits } = state.data;
  const bq = $("#blade-search").value;
  const rq = $("#ratchet-search").value;
  const iq = $("#bit-search").value;

  const bl = filterList(blades, bq).slice().sort(sortParts);
  const rl = filterList(ratchets, rq).slice().sort(sortRatchets);
  const il = filterList(bits, iq).slice().sort(sortParts);

  fillSelect($("#blade-select"), bl, "blade", state.bladeId);
  fillSelect($("#ratchet-select"), rl, "ratchet", state.ratchetId);
  fillSelect($("#bit-select"), il, "bit", state.bitId);

  $("#blade-hint").textContent = `${bl.length} blades`;
  $("#ratchet-hint").textContent = `${rl.length} ratchets`;
  $("#bit-hint").textContent = `${il.length} bits`;
}

function sortParts(a, b) {
  const tr = { S: 0, A: 1, B: 2, C: 3, D: 4, Unranked: 5 };
  const d = (tr[a.tier] ?? 9) - (tr[b.tier] ?? 9);
  if (d !== 0) return d;
  return a.name.localeCompare(b.name);
}

function sortRatchets(a, b) {
  const tr = { S: 0, A: 1, B: 2, C: 3, D: 4, Unranked: 5 };
  const d = (tr[a.tier] ?? 9) - (tr[b.tier] ?? 9);
  if (d !== 0) return d;
  return String(a.abbr || a.name).localeCompare(String(b.abbr || b.name), undefined, {
    numeric: true,
  });
}

function renderResults() {
  const el = $("#results");
  const blade = byId(state.data.blades, state.bladeId);
  const ratchet = byId(state.data.ratchets, state.ratchetId);
  const bit = byId(state.data.bits, state.bitId);

  if (!blade || !ratchet || !bit) {
    el.className = "results empty-state";
    el.innerHTML = "Select a Blade, Ratchet, and Bit to score the combo.";
    return;
  }

  const s = scoreCombo({ blade, ratchet, bit });
  const gColor = gradeColor(s.overall);

  el.className = "results";
  el.innerHTML = `
    <div class="combo-title">
      <span class="grade-pill" style="color:${gColor};border-color:${gColor}55;background:${gColor}22">${s.overall}</span>
      <h3 id="combo-string">${escapeHtml(s.comboString)}</h3>
      <span class="role-tag">${escapeHtml(s.typeRole)}</span>
    </div>
    <div class="score-grid">
      ${scoreCard("Competitiveness", s.competitiveness)}
      ${scoreCard("Meta-breaking", s.metaBreak)}
      ${scoreCard("Value for price", s.value)}
    </div>
    <div class="meta-row">
      <span>Est. combo cost <strong>HK$${s.hkdMin}–${s.hkdMax}</strong> (mid ~HK$${s.estimatedHkd})</span>
      <span>Tiers <strong>${blade.tier}</strong> / <strong>${ratchet.tier}</strong> / <strong>${bit.tier}</strong></span>
    </div>
    <div class="notes-grid">
      <div class="note-box">
        <h4>Strengths</h4>
        <ul>${s.notes.strengths.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
      </div>
      <div class="note-box risks">
        <h4>Risks</h4>
        <ul>${s.notes.risks.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn primary" id="copy-combo">Copy combo string</button>
      <span class="toast" id="copy-toast" hidden>Copied</span>
    </div>
  `;

  // Animate bars
  requestAnimationFrame(() => {
    el.querySelectorAll(".bar > span").forEach((bar) => {
      bar.style.width = bar.dataset.w + "%";
    });
  });

  $("#copy-combo")?.addEventListener("click", async () => {
    const text = s.comboString;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const toast = $("#copy-toast");
    if (toast) {
      toast.hidden = false;
      setTimeout(() => {
        toast.hidden = true;
      }, 1500);
    }
  });
}

function scoreCard(label, value) {
  return `
    <div class="score-card">
      <p class="label">${escapeHtml(label)}</p>
      <p class="value">${value}</p>
      <div class="bar" aria-hidden="true"><span data-w="${value}"></span></div>
    </div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function priceLine(p) {
  const note = p.priceNote ? ` · ${p.priceNote.split("—")[0].trim()}` : "";
  return `HK$${p.hkdMin}–${p.hkdMax}${note ? "" : ""} <span style="opacity:.75">(${escapeHtml(
    (p.priceNote || "estimate").slice(0, 80)
  )}${ (p.priceNote || "").length > 80 ? "…" : ""})</span>`;
}

function renderParts() {
  const cat = state.partsCat;
  const list = state.data[cat] || [];
  const filtered = filterList(list, state.partsQuery).slice().sort(cat === "ratchets" ? sortRatchets : sortParts);
  const host = $("#part-list");
  const empty = $("#parts-empty");
  $("#parts-count").textContent = `${filtered.length} / ${list.length}`;

  if (!filtered.length) {
    host.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  host.innerHTML = filtered
    .map((p) => {
      const abbr = p.abbr ? ` (${escapeHtml(p.abbr)})` : "";
      const partners = (p.bestCombos || p.bestPartners || []).slice(0, 4);
      const pros = (p.pros || []).slice(0, 3);
      const cons = (p.cons || []).slice(0, 3);
      return `
      <article class="part-card" role="listitem">
        <div class="part-top">
          <h3 class="title">${escapeHtml(p.name)}${abbr}</h3>
          <span class="badge tier-${escapeHtml(p.tier)}">${escapeHtml(p.tier)}</span>
          <span class="badge type">${escapeHtml(p.type || cat)}</span>
          ${p.code ? `<span class="badge type">${escapeHtml(p.code)}</span>` : ""}
        </div>
        <div class="part-meta">
          <span>${priceLine(p)}</span>
        </div>
        <div class="part-body">
          ${
            pros.length
              ? `<div class="section-label">Pros</div><ul>${pros
                  .map((x) => `<li>${escapeHtml(x)}</li>`)
                  .join("")}</ul>`
              : ""
          }
          ${
            cons.length
              ? `<div class="section-label">Cons</div><ul>${cons
                  .map((x) => `<li>${escapeHtml(x)}</li>`)
                  .join("")}</ul>`
              : ""
          }
          ${
            partners.length
              ? `<p class="combos-line">Best partners: ${partners
                  .map(escapeHtml)
                  .join(" · ")}</p>`
              : ""
          }
        </div>
      </article>`;
    })
    .join("");
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      document.querySelectorAll(".tab").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      $("#view-builder").hidden = view !== "builder";
      $("#view-parts").hidden = view !== "parts";
    });
  });
}

function setupBuilder() {
  const bindSearch = (inputId, onChange) => {
    $(inputId).addEventListener("input", () => {
      refreshBuilderSelects();
      onChange?.();
    });
  };
  bindSearch("#blade-search");
  bindSearch("#ratchet-search");
  bindSearch("#bit-search");

  $("#blade-select").addEventListener("change", (e) => {
    state.bladeId = e.target.value;
    renderResults();
  });
  $("#ratchet-select").addEventListener("change", (e) => {
    state.ratchetId = e.target.value;
    renderResults();
  });
  $("#bit-select").addEventListener("change", (e) => {
    state.bitId = e.target.value;
    renderResults();
  });
}

function setupParts() {
  document.querySelectorAll(".ref-controls .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".ref-controls .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.partsCat = chip.dataset.cat;
      renderParts();
    });
  });
  $("#parts-search").addEventListener("input", (e) => {
    state.partsQuery = e.target.value;
    renderParts();
  });
}

function setMetaLine() {
  const m = state.data.meta || {};
  const nB = state.data.blades.length;
  const nR = state.data.ratchets.length;
  const nI = state.data.bits.length;
  $("#meta-line").textContent = `Data ${m.updated || "—"} · ${nB} blades · ${nR} ratchets · ${nI} bits · HK$ estimates`;
}

async function main() {
  setupTabs();
  try {
    state.data = await loadData();
  } catch (err) {
    $("#results").textContent =
      "Could not load data/parts.json. Serve this folder over HTTP (static) so relative fetch works.";
    console.error(err);
    return;
  }
  setMetaLine();
  setupBuilder();
  setupParts();
  refreshBuilderSelects();
  renderParts();

  // Deep-link helpers: ?blade=wizard-rod&ratchet=1-60&bit=hexa
  const params = new URLSearchParams(location.search);
  if (params.get("blade")) state.bladeId = params.get("blade");
  if (params.get("ratchet")) state.ratchetId = params.get("ratchet");
  if (params.get("bit")) state.bitId = params.get("bit");
  if (state.bladeId || state.ratchetId || state.bitId) {
    refreshBuilderSelects();
    if (state.bladeId) $("#blade-select").value = state.bladeId;
    if (state.ratchetId) $("#ratchet-select").value = state.ratchetId;
    if (state.bitId) $("#bit-select").value = state.bitId;
    renderResults();
  }
}

main();
