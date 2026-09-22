const TZ = "Asia/Hong_Kong";
const STORAGE_KEY = "homework-done-v1";

const listEl = document.getElementById("assignment-list");
const emptyEl = document.getElementById("list-empty");
const countEl = document.getElementById("list-count");
const filtersEl = document.getElementById("filters");
const tzLabel = document.getElementById("tz-label");

let allAssignments = [];
let activeClass = "all";
let activeStatus = "all"; // all | open | done

function loadDoneMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDoneMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function effectiveDone(item) {
  const map = loadDoneMap();
  if (Object.prototype.hasOwnProperty.call(map, item.id)) {
    return Boolean(map[item.id]);
  }
  return item.status === "done";
}

function setDone(id, done) {
  const map = loadDoneMap();
  map[id] = Boolean(done);
  saveDoneMap(map);
}

function parseDue(due) {
  if (!due) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return new Date(`${due}T23:59:59+08:00`);
  }
  return new Date(due);
}

function isOverdue(item, now) {
  if (effectiveDone(item)) return false;
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
  const done = effectiveDone(item);
  const overdue = isOverdue(item, now);
  const row = document.createElement("article");
  row.className =
    "row" + (overdue ? " overdue" : "") + (done ? " is-done" : "");
  row.setAttribute("role", "listitem");
  row.dataset.id = item.id;

  const checkWrap = document.createElement("label");
  checkWrap.className = "check-wrap";
  checkWrap.title = done ? "Mark as open" : "Mark as done";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "done-check";
  checkbox.checked = done;
  checkbox.setAttribute("aria-label", `Mark ${item.title || "assignment"} done`);
  checkbox.addEventListener("change", () => {
    setDone(item.id, checkbox.checked);
    render();
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
  meta.appendChild(badge(done ? "done" : "open", `status-${done ? "done" : "open"}`));
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
  filtersEl.innerHTML = "";

  const makeChip = (label, onClick, active) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (active ? " active" : "");
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(active));
    btn.addEventListener("click", onClick);
    return btn;
  };

  const statusGroup = document.createElement("div");
  statusGroup.className = "filter-group";
  statusGroup.setAttribute("aria-label", "Filter by status");
  statusGroup.appendChild(
    makeChip(
      "All",
      () => {
        activeStatus = "all";
        render();
      },
      activeStatus === "all"
    )
  );
  statusGroup.appendChild(
    makeChip(
      "Open",
      () => {
        activeStatus = "open";
        render();
      },
      activeStatus === "open"
    )
  );
  statusGroup.appendChild(
    makeChip(
      "Done",
      () => {
        activeStatus = "done";
        render();
      },
      activeStatus === "done"
    )
  );
  filtersEl.appendChild(statusGroup);

  if (classes.length) {
    const classGroup = document.createElement("div");
    classGroup.className = "filter-group";
    classGroup.setAttribute("aria-label", "Filter by class");
    classGroup.appendChild(
      makeChip(
        "All classes",
        () => {
          activeClass = "all";
          render();
        },
        activeClass === "all"
      )
    );
    for (const c of classes) {
      classGroup.appendChild(
        makeChip(
          c,
          () => {
            activeClass = c;
            render();
          },
          activeClass === c
        )
      );
    }
    filtersEl.appendChild(classGroup);
  }
}

function render() {
  const now = new Date();
  let filtered =
    activeClass === "all"
      ? allAssignments.slice()
      : allAssignments.filter((a) => a.class === activeClass);

  if (activeStatus === "open") {
    filtered = filtered.filter((a) => !effectiveDone(a));
  } else if (activeStatus === "done") {
    filtered = filtered.filter((a) => effectiveDone(a));
  }

  filtered.sort(sortByDue);

  listEl.innerHTML = "";
  for (const item of filtered) listEl.appendChild(renderRow(item, now));

  emptyEl.hidden = filtered.length > 0;
  const openCount = allAssignments.filter((a) => !effectiveDone(a)).length;
  const doneCount = allAssignments.length - openCount;
  countEl.textContent = `(${filtered.length} shown · ${openCount} open · ${doneCount} done)`;

  renderFilters(uniqueClasses(allAssignments));
}

async function init() {
  tzLabel.textContent = `Timezone: HKT / ${TZ}`;
  try {
    const res = await fetch("assignments.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allAssignments = Array.isArray(data.assignments) ? data.assignments : [];
    render();
  } catch (err) {
    emptyEl.hidden = false;
    emptyEl.textContent = `Could not load assignments.json (${err.message}).`;
    countEl.textContent = "";
  }
}

init();
