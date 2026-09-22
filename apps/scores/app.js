const genreSelect = document.getElementById("filter-genre");
const instrumentSelect = document.getElementById("filter-instrument");
const listEl = document.getElementById("score-list");
const emptyEl = document.getElementById("list-empty");
const countEl = document.getElementById("list-count");

/** @type {Array<Record<string, unknown>>} */
let scores = [];

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
  );
}

function fillSelect(select, values) {
  const current = select.value;
  while (select.options.length > 1) select.remove(1);
  for (const value of values) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
  if ([...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardHtml(score) {
  const tags = Array.isArray(score.tags) ? score.tags : [];
  const chips = [
    `<span class="chip accent">${escapeHtml(score.genre)}</span>`,
    `<span class="chip accent">${escapeHtml(score.instrument)}</span>`,
    score.tempo ? `<span class="chip">${escapeHtml(score.tempo)}</span>` : "",
    ...tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`),
  ]
    .filter(Boolean)
    .join("");

  const audio = score.audio
    ? `<audio class="player" controls preload="metadata" src="${escapeHtml(score.audio)}">
        Your browser does not support audio.
      </audio>`
    : `<p class="notes">No audio file.</p>`;

  const pdf = score.pdf
    ? `<a class="btn primary" href="${escapeHtml(score.pdf)}" target="_blank" rel="noopener">View / download PDF</a>`
    : "";

  return `
    <article class="card" role="listitem" data-id="${escapeHtml(score.id)}">
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(score.title)}</h3>
          <p class="card-artist">${escapeHtml(score.artist)}</p>
        </div>
      </div>
      <div class="meta">${chips}</div>
      ${score.notes ? `<p class="notes">${escapeHtml(score.notes)}</p>` : ""}
      ${audio}
      <div class="actions">${pdf}</div>
    </article>
  `;
}

function filteredScores() {
  const genre = genreSelect.value;
  const instrument = instrumentSelect.value;
  return scores.filter((s) => {
    if (genre && s.genre !== genre) return false;
    if (instrument && s.instrument !== instrument) return false;
    return true;
  });
}

function render() {
  const items = filteredScores();
  listEl.innerHTML = items.map(cardHtml).join("");
  emptyEl.hidden = items.length > 0;
  countEl.textContent = `${items.length} of ${scores.length}`;
}

async function init() {
  const res = await fetch("data/scores.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load scores.json (${res.status})`);
  scores = await res.json();
  fillSelect(genreSelect, uniqueSorted(scores.map((s) => s.genre)));
  fillSelect(instrumentSelect, uniqueSorted(scores.map((s) => s.instrument)));
  genreSelect.addEventListener("change", render);
  instrumentSelect.addEventListener("change", render);
  render();
}

init().catch((err) => {
  emptyEl.hidden = false;
  emptyEl.textContent = `Could not load scores: ${err.message}`;
  countEl.textContent = "";
});
