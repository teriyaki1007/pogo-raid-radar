const TZ = "Asia/Hong_Kong";
const STORAGE_KEY = "homework-checkoffs-v1";

const upcomingList = document.getElementById("upcoming-list");
const doneList = document.getElementById("done-list");
const upcomingEmpty = document.getElementById("upcoming-empty");
const doneEmpty = document.getElementById("done-empty");
const upcomingCount = document.getElementById("upcoming-count");
const doneCount = document.getElementById("done-count");
const filtersEl = document.getElementById("filters");
const doneToggle = document.getElementById("done-toggle");
const doneBody = document.getElementById("done-body");
const tzLabel = document.getElementById("tz-label");

let allAssignments = [];
let activeClass = "all";
let checkoffs = loadCheckoffs();

doneToggle.addEventListener("click", () => {
  const open = doneToggle.getAttribute("aria-expanded") === "true";
  doneToggle.setAttribute("aria-expanded", String(!open));
  doneBody.hidden = open;
});

function loadCheckoffs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCheckoffs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(checkoffs));
}

/** Effective done: your checkbox wins once set; otherwise JSON status. */
function isDone(item) {
  if (Object.prototype.hasOwnProperty.call(checkoffs, item.id)) {
    return Boolean(checkoffs[item.id]);
  }
  return item.status === "done";
}

function setDone(itemId, done) {
  checkoffs[itemId] = done;
  saveCheckoffs();
  render();
}

function parseDue(due) {
  if (!due) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return new Date(`${due}T23:59:59+08:00`);
  }
  return new Date(due);
}

function isOverdue(item, now) {
  if (isDone(item)) return false;
  const d = parseDue(item.due);
  return d instanceof Date && !Number.isNaN(d.getTime()) && d < now;
}

function sortByDue(a, b) {
  const da = parseDue(a.due)?.getTime() ?? Infinity;
  const db = parseDue(b.due)?.getTime() ?? Infinity;
  return da - db;
}

function formatDueDisplay(item) {
  if (item.dueLabel) return item.dueLabel;
  const d = parseDue(item.due);
  if (!d || Number.isNaN(d.getTime())) return item.due || "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: item.due.includes("T") ? "numeric" : undefined,
    minute: item.due.includes("T") ? "2-digit" : undefined,
    hour12: true,
  }).format(d);
}

function badge(text, className) {
  const span = document.createElement("span");
  span.className = `badge ${className}`;
  span.textContent = text;
  return span;
}

function renderRow(item, now) {
  const done = isDone(item);
  const overdue = isOverdue(item, now);
  const row = document.createElement("article");
  row.className = "row" + (overdue ? " overdue" : "") + (done ? " done" : "");
  row.setAttribute("role", "listitem");

  const checkWrap = document.createElement("label");
  checkWrap.className = "check-wrap";
  checkWrap.title = done ? "Mark as not finished" : "Mark as finished";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "check";
  checkbox.checked = done;
  checkbox.setAttribute("aria-label", `Mark ${item.title || "assignment"} finished`);
  checkbox.addEventListener("change", () => {
    setDone(item.id, checkbox.checked);
  });

  checkWrap.appendChild(checkbox);

  const body = document.createElement("div");
  body.className = "row-body";

  const top = document.createElement("div");
  top.className = "row-top";

  const classTag = document.createElement("span");
  classTag.className = "class-tag";
  classTag.textContent = item.class || "Class";
  top.appendChild(classTag);

  const title = document.createElement("h3");
  title.className = "title";
  title.textContent = item.title || "Untitled";
  top.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "meta";

  const due = document.createElement("span");
  due.className = "due" + (overdue ? " overdue-text" : "");
  due.textContent = (overdue ? "Overdue · " : "") + formatDueDisplay(item);
  meta.appendChild(due);

  const priority = (item.priority || "medium").toLowerCase();
  meta.appendChild(badge(priority, `priority-${priority}`));
  meta.appendChild(badge(done ? "done" : "open", done ? "status-done" : "status-open"));
  if (item.inClass) meta.appendChild(badge("in class", "in-class"));

  body.appendChild(top);
  body.appendChild(meta);

  row.appendChild(checkWrap);
  row.appendChild(body);
  return row;
}

function uniqueClasses(items) {
  return [...new Set(items.map((i) => i.class).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function renderFilters(classes) {
  if (!classes.length) {
    filtersEl.hidden = true;
    return;
  }
  filtersEl.hidden = false;
  filtersEl.innerHTML = "";

  const makeChip = (label, value) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (activeClass === value ? " active" : "");
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(activeClass === value));
    btn.addEventListener("click", () => {
      activeClass = value;
      render();
    });
    return btn;
  };

  filtersEl.appendChild(makeChip("All", "all"));
  for (const c of classes) filtersEl.appendChild(makeChip(c, c));
}

function render() {
  const now = new Date();
  const filtered =
    activeClass === "all"
      ? allAssignments
      : allAssignments.filter((a) => a.class === activeClass);

  const open = filtered.filter((a) => !isDone(a)).sort(sortByDue);
  const done = filtered.filter((a) => isDone(a)).sort(sortByDue);

  upcomingList.innerHTML = "";
  doneList.innerHTML = "";

  for (const item of open) upcomingList.appendChild(renderRow(item, now));
  for (const item of done) doneList.appendChild(renderRow(item, now));

  upcomingEmpty.hidden = open.length > 0;
  doneEmpty.hidden = done.length > 0;
  upcomingCount.textContent = `(${open.length})`;
  doneCount.textContent = `(${done.length})`;

  // Keep past work easy to see: auto-expand Done when it has items
  if (done.length > 0 && doneToggle.getAttribute("aria-expanded") !== "true") {
    doneToggle.setAttribute("aria-expanded", "true");
    doneBody.hidden = false;
  }

  renderFilters(uniqueClasses(allAssignments));
}

async function init() {
  tzLabel.textContent = `Timezone: HKT / ${TZ} · tap checkbox to mark finished`;
  try {
    const res = await fetch("assignments.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allAssignments = Array.isArray(data.assignments) ? data.assignments : [];
    render();
  } catch (err) {
    upcomingEmpty.hidden = false;
    upcomingEmpty.textContent = `Could not load assignments.json (${err.message}).`;
    upcomingCount.textContent = "";
  }
}

init();
