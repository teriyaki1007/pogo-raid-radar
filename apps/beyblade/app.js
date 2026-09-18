/**
 * Beyblade X coaching SPA — loads data/parts.json (relative) and scores combos.
 * Modes: Basic/UX (Blade+Ratchet+Bit) and CX (Lock+Main+Assist+Ratchet+Bit).
 */
import { scoreCombo, scoreCxCombo, gradeColor, formatUsage } from "./score.js?v=20260918d";

const state = {
  data: null,
  mode: "basic", // basic | cx
  bladeId: "",
  ratchetId: "",
  bitId: "",
  lockId: "",
  mainId: "",
  assistId: "",
  cxRatchetId: "",
  cxBitId: "",
  partsCat: "blades",
  partsQuery: "",
  partsSort: "tier",
};

const $ = (sel) => document.querySelector(sel);

async function loadData() {
  const res = await fetch("data/parts.json?v=20260918d");
  if (!res.ok) throw new Error(`Failed to load parts.json (${res.status})`);
  return res.json();
}

function byId(list, id) {
  return (list || []).find((p) => p.id === id) || null;
}

function isRatchetIntegrated(blade) {
  return !!(blade && blade.ratchetIntegrated);
}

/** Hide / disable ratchet picker when Expand Blade is selected. */
function syncRatchetField() {
  const blade = byId(state.data?.blades, state.bladeId);
  const integrated = isRatchetIntegrated(blade);
  const field = $("#ratchet-field");
  if (field) {
    field.hidden = integrated;
    field.classList.toggle("is-hidden", integrated);
    field.style.display = integrated ? "none" : "";
  }
  const select = $("#ratchet-select");
  const search = $("#ratchet-search");
  if (select) {
    select.disabled = integrated;
    if (integrated) {
      state.ratchetId = "";
      select.value = "";
    }
  }
  if (search) search.disabled = integrated;
  const hint = $("#ratchet-hint");
  const usage = $("#ratchet-usage");
  if (integrated) {
    if (hint) hint.textContent = "Ratchet integrated — bit only";
    if (usage) usage.textContent = "No separate ratchet on Expand Blades";
  }
  const bh = $("#builder-hint");
  if (bh && state.mode === "basic") {
    bh.textContent = integrated ? "Blade + Bit (ratchet integrated)" : "Blade + Ratchet + Bit";
  }
}



function filterList(list, q) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return list;
  return list.filter((p) => {
    const usageStr =
      p.usagePct == null ? "n/a" : String(p.usagePct);
    const hay = [
      p.name,
      p.abbr,
      p.type,
      p.tier,
      p.code,
      p.shorthand,
      usageStr,
      p.usageNote,
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

function usageBadgeText(p) {
  if (!p || p.usagePct == null) return "n/a";
  const n = Number(p.usagePct);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

function optionLabel(p, kind) {
  const tier = p.tier || "?";
  const u = usageBadgeText(p);
  if (kind === "ratchet") return `${p.abbr || p.name} · ${tier} · ${u}`;
  if (kind === "bit") return `${p.name} (${p.abbr}) · ${tier} · ${u}`;
  if (kind === "lock") return `${p.name}${p.metal ? " ★" : ""} · ${tier} · ${u}`;
  return `${p.name} · ${p.type || "?"} · ${tier} · ${u}`;
}

function fillSelect(selectEl, list, kind, selectedId, fullList) {
  if (!selectEl) return;
  const prev = selectedId || selectEl.value;
  const rows = Array.isArray(list) ? list : [];
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = rows.length ? `— select ${kind} —` : `— no ${kind} data —`;
  selectEl.appendChild(ph);

  // Keep current selection visible even if search filter hid it
  const pool = fullList || rows;
  if (prev && !rows.some((p) => p.id === prev)) {
    const kept = (pool || []).find((p) => p.id === prev);
    if (kept) {
      const opt = document.createElement("option");
      opt.value = kept.id;
      opt.textContent = optionLabel(kept, kind) + " (selected)";
      selectEl.appendChild(opt);
    }
  }

  for (const p of rows) {
    if (!p || !p.id) continue;
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = optionLabel(p, kind);
    selectEl.appendChild(opt);
  }
  if (prev && [...selectEl.options].some((o) => o.value === prev)) {
    selectEl.value = prev;
  } else {
    selectEl.value = "";
  }
}

function setUsageLine(elId, part) {
  const el = $(elId);
  if (!el) return;
  if (!part) {
    el.textContent = "";
    return;
  }
  const u = usageBadgeText(part);
  const note = part.usageNote ? ` · ${part.usageNote}` : "";
  el.innerHTML = `Usage <strong class="usage-pct">${escapeHtml(u)}</strong>${
    note ? `<span class="usage-note">${escapeHtml(note.slice(0, 72))}${note.length > 72 ? "…" : ""}</span>` : ""
  }`;
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

function sortByUsage(a, b) {
  const ua = a.usagePct == null ? -1 : a.usagePct;
  const ub = b.usagePct == null ? -1 : b.usagePct;
  if (ub !== ua) return ub - ua;
  return a.name.localeCompare(b.name);
}

function sortByName(a, b) {
  return String(a.abbr || a.name).localeCompare(String(b.abbr || b.name), undefined, {
    numeric: true,
  });
}

function refreshBuilderSelects() {
  if (!state.data) return;
  const { blades, ratchets, bits, lockChips, mainBlades, assistBlades } = state.data;

  // Always populate BOTH basic and CX selects so CX never shows iOS "No Options"
  const bq = $("#blade-search")?.value || "";
  const rq = $("#ratchet-search")?.value || "";
  const iq = $("#bit-search")?.value || "";
  const bl = filterList(blades, bq).slice().sort(sortParts);
  const rlBasic = filterList(ratchets, rq).slice().sort(sortRatchets);
  const ilBasic = filterList(bits, iq).slice().sort(sortParts);
  fillSelect($("#blade-select"), bl, "blade", state.bladeId, blades);
  fillSelect($("#ratchet-select"), rlBasic, "ratchet", state.ratchetId, ratchets);
  fillSelect($("#bit-select"), ilBasic, "bit", state.bitId, bits);
  if ($("#blade-hint")) $("#blade-hint").textContent = `${bl.length} blades`;
  if ($("#ratchet-hint")) $("#ratchet-hint").textContent = `${rlBasic.length} ratchets`;
  if ($("#bit-hint")) $("#bit-hint").textContent = `${ilBasic.length} bits`;
  setUsageLine("#blade-usage", byId(blades, state.bladeId));
  setUsageLine("#ratchet-usage", byId(ratchets, state.ratchetId));
  setUsageLine("#bit-usage", byId(bits, state.bitId));

  const lq = $("#lock-search")?.value || "";
  const mq = $("#main-search")?.value || "";
  const aq = $("#assist-search")?.value || "";
  const cxRq = $("#cx-ratchet-search")?.value || "";
  const cxIq = $("#cx-bit-search")?.value || "";
  const ll = filterList(lockChips || [], lq).slice().sort(sortByUsage);
  const ml = filterList(mainBlades || [], mq).slice().sort(sortByUsage);
  const al = filterList(assistBlades || [], aq).slice().sort(sortByUsage);
  const rlCx = filterList(ratchets, cxRq).slice().sort(sortRatchets);
  const ilCx = filterList(bits, cxIq).slice().sort(sortParts);
  fillSelect($("#lock-select"), ll, "lock", state.lockId, lockChips || []);
  fillSelect($("#main-select"), ml, "main", state.mainId, mainBlades || []);
  fillSelect($("#assist-select"), al, "assist", state.assistId, assistBlades || []);
  fillSelect($("#cx-ratchet-select"), rlCx, "ratchet", state.cxRatchetId, ratchets);
  fillSelect($("#cx-bit-select"), ilCx, "bit", state.cxBitId, bits);
  if ($("#lock-hint")) $("#lock-hint").textContent = `${ll.length} lock chips`;
  if ($("#main-hint")) $("#main-hint").textContent = `${ml.length} main blades`;
  if ($("#assist-hint")) $("#assist-hint").textContent = `${al.length} assist blades`;
  if ($("#cx-ratchet-hint")) $("#cx-ratchet-hint").textContent = `${rlCx.length} ratchets`;
  if ($("#cx-bit-hint")) $("#cx-bit-hint").textContent = `${ilCx.length} bits`;
  setUsageLine("#lock-usage", byId(lockChips, state.lockId));
  setUsageLine("#main-usage", byId(mainBlades, state.mainId));
  setUsageLine("#assist-usage", byId(assistBlades, state.assistId));
  setUsageLine("#cx-ratchet-usage", byId(ratchets, state.cxRatchetId));
  setUsageLine("#cx-bit-usage", byId(bits, state.cxBitId));

  syncRatchetField();
}

function usagePills(usageObj) {
  if (!usageObj) return "";
  return Object.entries(usageObj)
    .map(
      ([k, v]) =>
        `<span class="usage-pill"><span class="k">${escapeHtml(k)}</span> ${escapeHtml(v)}</span>`
    )
    .join("");
}

function renderResults() {
  const el = $("#results");

  if (state.mode === "cx") {
    const lockChip = byId(state.data.lockChips, state.lockId);
    const mainBlade = byId(state.data.mainBlades, state.mainId);
    const assistBlade = byId(state.data.assistBlades, state.assistId);
    const ratchet = byId(state.data.ratchets, state.cxRatchetId);
    const bit = byId(state.data.bits, state.cxBitId);

    if (!lockChip || !mainBlade || !assistBlade || !ratchet || !bit) {
      const miss = [
        !lockChip && "Lock Chip",
        !mainBlade && "Main Blade",
        !assistBlade && "Assist Blade",
        !ratchet && "Ratchet",
        !bit && "Bit",
      ].filter(Boolean);
      el.className = "results empty-state";
      el.innerHTML = `Still need: <strong>${miss.join(", ")}</strong>`;
      return;
    }

    let s;
    try {
      s = scoreCxCombo({ lockChip, mainBlade, assistBlade, ratchet, bit });
    } catch (err) {
      console.error(err);
      el.className = "results empty-state";
      el.innerHTML = "CX scoring error — see console.";
      return;
    }
    if (!s) {
      el.className = "results empty-state";
      el.innerHTML = "Could not score this CX stack.";
      return;
    }
    paintResults(el, s, {
      tiers: `${lockChip.tier} / ${mainBlade.tier} / ${assistBlade.tier} / ${ratchet.tier} / ${bit.tier}`,
    });
    return;
  }

  const blade = byId(state.data.blades, state.bladeId);
  const bit = byId(state.data.bits, state.bitId);
  const integrated = isRatchetIntegrated(blade);
  const ratchet = integrated ? null : byId(state.data.ratchets, state.ratchetId);

  if (!blade || !bit || (!integrated && !ratchet)) {
    el.className = "results empty-state";
    el.innerHTML = integrated
      ? "Select a Blade and Bit (this Expand Blade has an integrated ratchet)."
      : "Select a Blade, Ratchet, and Bit to score the combo.";
    return;
  }

  const s = scoreCombo({ blade, ratchet, bit });
  paintResults(el, s, {
    tiers: integrated
      ? `${blade.tier} / integrated / ${bit.tier}`
      : `${blade.tier} / ${ratchet.tier} / ${bit.tier}`,
  });
}

function paintResults(el, s, { tiers }) {
  const gColor = gradeColor(s.overall);
  el.className = "results";
  el.innerHTML = `
    <div class="combo-title">
      <span class="grade-pill" style="color:${gColor};border-color:${gColor}55;background:${gColor}22">${s.overall}</span>
      <h3 id="combo-string">${escapeHtml(s.comboString)}</h3>
      <span class="role-tag">${escapeHtml(s.typeRole)}${s.mode === "cx" ? " · CX" : s.mode === "expand" || s.breakdown?.ratchetIntegrated ? " · Expand" : ""}</span>
    </div>
    <div class="usage-row" aria-label="Part usage percentages">
      ${usagePills(s.usage)}
    </div>
    <div class="score-grid">
      ${scoreCard("Competitiveness", s.competitiveness)}
      ${scoreCard("Meta-breaking", s.metaBreak)}
      ${scoreCard("Value for price", s.value)}
    </div>
    <div class="meta-row">
      <span>Est. combo cost <strong>HK$${s.hkdMin}–${s.hkdMax}</strong> (mid ~HK$${s.estimatedHkd})</span>
      <span>Tiers <strong>${escapeHtml(tiers)}</strong></span>
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
  return `HK$${p.hkdMin}–${p.hkdMax} <span style="opacity:.75">(${escapeHtml(
    (p.priceNote || "estimate").slice(0, 80)
  )}${(p.priceNote || "").length > 80 ? "…" : ""})</span>`;
}

function renderParts() {
  const cat = state.partsCat;
  const list = state.data[cat] || [];
  let filtered = filterList(list, state.partsQuery).slice();
  if (state.partsSort === "usage") filtered.sort(sortByUsage);
  else if (state.partsSort === "name") filtered.sort(sortByName);
  else filtered.sort(cat === "ratchets" ? sortRatchets : sortParts);

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
      const u = usageBadgeText(p);
      const uClass = p.usagePct == null ? "usage-na" : p.usagePct >= 20 ? "usage-high" : p.usagePct >= 5 ? "usage-mid" : "usage-low";
      const expandBadge = p.ratchetIntegrated
        ? `<span class="badge expand-badge">Ratchet integrated</span>`
        : "";
      return `
      <article class="part-card" role="listitem">
        <div class="part-top">
          <h3 class="title">${escapeHtml(p.name)}${abbr}${p.metal ? " <span class=\"metal-tag\">metal</span>" : ""}${expandBadge}</h3>
          <span class="badge tier-${escapeHtml(p.tier)}">${escapeHtml(p.tier)}</span>
          <span class="badge type">${escapeHtml(p.type || cat)}</span>
          ${p.code ? `<span class="badge type">${escapeHtml(p.code)}</span>` : ""}
          <span class="badge usage ${uClass}" title="${escapeHtml(p.usageNote || "")}">Usage ${escapeHtml(u)}</span>
        </div>
        <div class="usage-callout">Tournament usage: <strong>${escapeHtml(u)}</strong>${
          p.usageNote ? ` · ${escapeHtml(String(p.usageNote).slice(0, 60))}` : ""
        }</div>
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

function setMode(mode) {
  state.mode = mode === "cx" ? "cx" : "basic";
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === state.mode);
  });
  const basic = $("#builder-basic");
  const cx = $("#builder-cx");
  const showBasic = state.mode === "basic";
  if (basic) {
    basic.hidden = !showBasic;
    basic.classList.toggle("is-hidden", !showBasic);
    basic.style.setProperty("display", showBasic ? "grid" : "none", "important");
  }
  if (cx) {
    cx.hidden = showBasic;
    cx.classList.toggle("is-hidden", showBasic);
    cx.style.setProperty("display", showBasic ? "none" : "grid", "important");
  }
  const hint = $("#builder-hint");
  if (hint) {
    hint.textContent =
      state.mode === "cx" ? "Lock + Main + Assist + Ratchet + Bit" : "Blade + Ratchet + Bit";
  }
  refreshBuilderSelects();
  renderResults();
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
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  const bindSearch = (inputId) => {
    $(inputId)?.addEventListener("input", () => {
      refreshBuilderSelects();
    });
  };
  [
    "#blade-search",
    "#ratchet-search",
    "#bit-search",
    "#lock-search",
    "#main-search",
    "#assist-search",
    "#cx-ratchet-search",
    "#cx-bit-search",
  ].forEach(bindSearch);

  $("#blade-select").addEventListener("change", (e) => {
    state.bladeId = e.target.value;
    setUsageLine("#blade-usage", byId(state.data.blades, state.bladeId));
    syncRatchetField();
    refreshBuilderSelects();
    renderResults();
  });
  $("#ratchet-select").addEventListener("change", (e) => {
    state.ratchetId = e.target.value;
    setUsageLine("#ratchet-usage", byId(state.data.ratchets, state.ratchetId));
    renderResults();
  });
  $("#bit-select").addEventListener("change", (e) => {
    state.bitId = e.target.value;
    setUsageLine("#bit-usage", byId(state.data.bits, state.bitId));
    renderResults();
  });

  $("#lock-select").addEventListener("change", (e) => {
    state.lockId = e.target.value;
    setUsageLine("#lock-usage", byId(state.data.lockChips, state.lockId));
    renderResults();
  });
  $("#main-select").addEventListener("change", (e) => {
    state.mainId = e.target.value;
    setUsageLine("#main-usage", byId(state.data.mainBlades, state.mainId));
    renderResults();
  });
  $("#assist-select").addEventListener("change", (e) => {
    state.assistId = e.target.value;
    setUsageLine("#assist-usage", byId(state.data.assistBlades, state.assistId));
    renderResults();
  });
  $("#cx-ratchet-select").addEventListener("change", (e) => {
    state.cxRatchetId = e.target.value;
    setUsageLine("#cx-ratchet-usage", byId(state.data.ratchets, state.cxRatchetId));
    renderResults();
  });
  $("#cx-bit-select").addEventListener("change", (e) => {
    state.cxBitId = e.target.value;
    setUsageLine("#cx-bit-usage", byId(state.data.bits, state.cxBitId));
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
  $("#parts-sort").addEventListener("change", (e) => {
    state.partsSort = e.target.value;
    renderParts();
  });
}

function setMetaLine() {
  const m = state.data.meta || {};
  const nB = state.data.blades.length;
  const nR = state.data.ratchets.length;
  const nI = state.data.bits.length;
  const nL = (state.data.lockChips || []).length;
  const nM = (state.data.mainBlades || []).length;
  const nA = (state.data.assistBlades || []).length;
  const asOf = m.metaAsOf || m.updated || "—";
  $("#meta-line").textContent = `Data ${asOf} · ${nB} blades · ${nR} ratchets · ${nI} bits · ${nL} locks · ${nM} mains · ${nA} assists · usage from BEYWATCH`;
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
  setMode("basic"); // hide CX panel + fill all selects
  renderParts();

  const params = new URLSearchParams(location.search);
  if (params.get("mode") === "cx") setMode("cx");
  if (params.get("blade")) state.bladeId = params.get("blade");
  if (params.get("ratchet")) state.ratchetId = params.get("ratchet");
  if (params.get("bit")) state.bitId = params.get("bit");
  if (params.get("lock")) state.lockId = params.get("lock");
  if (params.get("main")) state.mainId = params.get("main");
  if (params.get("assist")) state.assistId = params.get("assist");
  if (params.get("cxRatchet")) state.cxRatchetId = params.get("cxRatchet");
  if (params.get("cxBit")) state.cxBitId = params.get("cxBit");

  if (
    state.bladeId ||
    state.ratchetId ||
    state.bitId ||
    state.lockId ||
    state.mainId ||
    state.assistId
  ) {
    refreshBuilderSelects();
    if (state.mode === "basic") {
      if (state.bladeId) $("#blade-select").value = state.bladeId;
      if (state.ratchetId) $("#ratchet-select").value = state.ratchetId;
      if (state.bitId) $("#bit-select").value = state.bitId;
    } else {
      if (state.lockId) $("#lock-select").value = state.lockId;
      if (state.mainId) $("#main-select").value = state.mainId;
      if (state.assistId) $("#assist-select").value = state.assistId;
      if (state.cxRatchetId) $("#cx-ratchet-select").value = state.cxRatchetId;
      if (state.cxBitId) $("#cx-bit-select").value = state.cxBitId;
    }
    renderResults();
  }
}

main();
