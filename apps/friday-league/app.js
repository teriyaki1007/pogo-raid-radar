/* Friday League front end. Everything shown is computed from data/league.json via standings.js. */
(function () {
  "use strict";
  var S = window.FridayLeagueStandings;
  var $ = function (id) { return document.getElementById(id); };
  var SVG = "http://www.w3.org/2000/svg";

  var state = { data: null, standings: [], archive: null, sortKey: "ga", sortDir: "desc", activeDay: null, view: "s2" };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var ICONS = {
    crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z",
    ball: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4l3.5 2.5-1.3 4.1H9.8L8.5 8.5 12 6zM4.6 10.2l2.3 1.5-.6 3-2.1.7a8 8 0 01.4-5.2zm14.8 0a8 8 0 01.4 5.2l-2.1-.7-.6-3 2.3-1.5zM9.2 17h5.6l.9 2.3a8 8 0 01-7.4 0L9.2 17z",
    boot: "M5 3h6v6l7 3c1.7.7 2 1.4 2 3v3H4V3h1z"
  };
  function icon(name) {
    var s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    var p = document.createElementNS(SVG, "path");
    p.setAttribute("d", ICONS[name]);
    p.setAttribute("fill", "currentColor");
    s.appendChild(p);
    return s;
  }

  function hue(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }
  /* Generated initials badge. Player profiles (photos etc.) will replace this later. */
  function avatar(name) {
    var a = el("span", "avatar", name.trim().slice(0, 2).toUpperCase());
    a.style.setProperty("--h", hue(name));
    a.setAttribute("aria-hidden", "true");
    return a;
  }
  function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  /* ---------- header & chips ---------- */
  function renderHeader() {
    var d = state.data;
    document.title = (d.name || "Friday League") + " · Season " + seasonShort(d.season) + " Leaderboard";
    $("league-name").textContent = d.name || "Friday League";
    $("season-label").textContent = seasonLabel(d.season);
    var last = S.latestDay(d);
    $("updated").textContent = last
      ? "Updated after Match Day " + last.day + " (" + S.formatDate(last.date) + ")"
      : "No match days played yet";

    renderChips(state.standings);
  }
  function renderChips(rows) {
    var chips = $("chips");
    chips.textContent = "";
    [["g", "Top scorer", "ball", "goals"], ["a", "Top assister", "boot", "assists"]].forEach(function (c) {
      var L = S.leaders(rows, c[0]);
      if (!L.names.length) return;
      var chip = el("span", "chip");
      var ico = el("span", "ico"); ico.appendChild(icon(c[2]));
      chip.appendChild(ico);
      chip.appendChild(el("span", "lbl", c[1]));
      chip.appendChild(el("strong", null, L.names.join(" & ")));
      chip.appendChild(el("span", "val", L.value + " " + c[3]));
      chips.appendChild(chip);
    });
  }
  function seasonLabel(s) {
    var m = /^S(\d+)\s*\((.+)\)$/.exec(s || "");
    return m ? "Season " + m[1] + " · " + m[2] : (s || "");
  }
  function seasonShort(s) {
    var m = /^S(\d+)/.exec(s || "");
    return m ? m[1] : (s || "");
  }

  /* ---------- MVP ---------- */
  function renderMvp() {
    var host = $("mvp");
    host.textContent = "";
    var name = state.data.mvp;
    var row = state.standings.filter(function (r) { return r.name === name; })[0];
    if (!name || !row) { host.hidden = true; return; }
    host.hidden = false;
    var card = el("article", "card mvp");
    card.setAttribute("aria-label", "MVP: " + name);

    var crown = icon("crown"); crown.setAttribute("class", "mvp-crown"); card.appendChild(crown);

    var top = el("div", "mvp-top");
    top.appendChild(avatar(name));
    var info = el("div");
    var badge = el("span", "mvp-badge"); badge.appendChild(icon("crown")); badge.appendChild(document.createTextNode("Season MVP"));
    info.appendChild(badge);
    info.appendChild(el("h3", "mvp-name", name));
    info.appendChild(el("p", "mvp-sub", "Rank #" + row.rank + " · Season " + seasonShort(state.data.season)));
    top.appendChild(info);
    card.appendChild(top);

    var dl = el("dl", "mvp-stats");
    [["Goals", row.g], ["Assists", row.a], ["G+A", row.ga, true], ["Appearances", row.md], ["G+A / match day", fmt1(row.gaPerMd)]]
      .forEach(function (s) {
        var box = el("div", "stat" + (s[2] ? " hl" : ""));
        box.appendChild(el("dt", null, s[0]));
        box.appendChild(el("dd", null, String(s[1])));
        dl.appendChild(box);
      });
    card.appendChild(dl);
    host.appendChild(card);
  }

  /* ---------- leaderboard ---------- */
  var COMPARE = { ga: S.compareOverall, g: S.compareGoals, a: S.compareAssists };

  function sortedRows() {
    var rows = state.standings.slice().sort(COMPARE[state.sortKey]);
    if (state.sortDir === "asc") rows.reverse();
    return rows;
  }

  function renderLeaderboard() {
    var body = $("lb-body");
    body.textContent = "";
    sortedRows().forEach(function (r, i) {
      var tr = el("tr", r.rank <= 3 ? "rank-" + r.rank : "");
      tr.style.setProperty("--i", i);

      var tdRank = el("td", "c-rank"); tdRank.appendChild(el("span", "rank", String(r.rank))); tr.appendChild(tdRank);

      var tdName = el("td");
      var who = el("div", "who");
      who.appendChild(avatar(r.name));
      var box = el("div");
      var nm = el("span", "who-name", r.name);
      if (r.name === state.data.mvp) {
        var t = el("span", "mvp-tag"); t.appendChild(icon("crown")); t.setAttribute("title", "MVP");
        var sr = el("span", "sr-only", " (MVP)"); t.appendChild(sr);
        nm.appendChild(t);
      }
      box.appendChild(nm);
      var bar = el("div", "bar"); bar.setAttribute("aria-hidden", "true");
      var fill = el("i"); fill.style.setProperty("--p", Math.round(r.share * 100)); bar.appendChild(fill);
      box.appendChild(bar);
      who.appendChild(box);
      tdName.appendChild(who);
      tr.appendChild(tdName);

      [["md", r.md, "dim c-md"], ["g", r.g, ""], ["a", r.a, ""], ["ga", r.ga, "ga"]].forEach(function (c) {
        var td = el("td", "num " + c[2], String(c[1]));
        if (c[0] === state.sortKey) td.classList.add("sorted-col");
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });

    document.querySelectorAll("#lb th.sortable").forEach(function (th) {
      var on = th.dataset.sort === state.sortKey;
      th.setAttribute("aria-sort", on ? (state.sortDir === "desc" ? "descending" : "ascending") : "none");
    });
  }

  function bindSorting() {
    document.querySelectorAll("#lb th.sortable button").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.parentElement.dataset.sort;
        if (state.sortKey === key) state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
        else { state.sortKey = key; state.sortDir = "desc"; }
        renderLeaderboard();
      });
    });
  }

  /* ---------- match days ---------- */
  function renderTabs() {
    var tabs = $("tabs");
    tabs.textContent = "";
    var days = S.sortedDays(state.data);
    days.forEach(function (d) {
      var b = el("button", "tab");
      b.type = "button";
      b.id = "tab-" + d.day;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "md-panel");
      b.setAttribute("aria-selected", String(d.day === state.activeDay));
      b.tabIndex = d.day === state.activeDay ? 0 : -1;
      b.appendChild(document.createTextNode("MD " + d.day));
      b.appendChild(el("small", null, S.formatDate(d.date)));
      b.addEventListener("click", function () { selectDay(d.day, false); });
      b.addEventListener("keydown", function (e) {
        var idx = days.findIndex(function (x) { return x.day === d.day; });
        var next = null;
        if (e.key === "ArrowRight") next = days[(idx + 1) % days.length];
        else if (e.key === "ArrowLeft") next = days[(idx - 1 + days.length) % days.length];
        else if (e.key === "Home") next = days[0];
        else if (e.key === "End") next = days[days.length - 1];
        if (next) { e.preventDefault(); selectDay(next.day, true); }
      });
      tabs.appendChild(b);
    });
  }

  function selectDay(day, focus) {
    state.activeDay = day;
    renderTabs();
    renderDayPanel();
    if (focus) $("tab-" + day).focus();
  }

  function renderDayPanel() {
    var panel = $("md-panel");
    panel.textContent = "";
    var t = state.activeDay == null ? null : S.matchDayTable(state.data, state.activeDay);
    if (!t) { panel.appendChild(el("p", "md-absent", "No match days yet.")); return; }
    panel.setAttribute("aria-labelledby", "tab-" + t.day);

    var head = el("div", "md-head");
    head.appendChild(el("h3", null, "Match Day " + t.day + " · " + S.formatDate(t.date)));
    head.appendChild(el("p", null, t.goals + " goals · " + t.assists + " assists · " + t.rows.length + " players"));
    panel.appendChild(head);

    var scroll = el("div", "table-scroll");
    var table = el("table", "lb md-table");
    var cap = el("caption", "sr-only", "Match Day " + t.day + " table"); table.appendChild(cap);
    var thead = el("thead"), hr = el("tr");
    [["#", "c-rank"], ["Player", "c-player"], ["G", "num"], ["A", "num"], ["G+A", "num"]].forEach(function (h) {
      var th = el("th", h[1], h[0]); th.scope = "col"; hr.appendChild(th);
    });
    thead.appendChild(hr); table.appendChild(thead);

    var tb = el("tbody");
    function nameCell(tr, name) {
      var td = el("td"); var who = el("div", "who");
      who.appendChild(avatar(name)); who.appendChild(el("span", "who-name", name));
      td.appendChild(who); tr.appendChild(td);
    }
    t.rows.forEach(function (r, i) {
      var tr = el("tr", r.rank <= 3 ? "rank-" + r.rank : ""); tr.style.setProperty("--i", i);
      var c = el("td", "c-rank"); c.appendChild(el("span", "rank", String(r.rank))); tr.appendChild(c);
      nameCell(tr, r.name);
      tr.appendChild(el("td", "num", String(r.g)));
      tr.appendChild(el("td", "num", String(r.a)));
      tr.appendChild(el("td", "num ga", String(r.ga)));
      tb.appendChild(tr);
    });
    t.absent.forEach(function (n) {
      var tr = el("tr", "absent-row");
      tr.appendChild(el("td", "c-rank dash", "–"));
      nameCell(tr, n);
      ["g", "a", "ga"].forEach(function () {
        var td = el("td", "num dash", "–"); td.setAttribute("aria-label", "did not play"); tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb); scroll.appendChild(table); panel.appendChild(scroll);
    if (t.absent.length) panel.appendChild(el("p", "md-absent", "Did not play: " + t.absent.join(", ")));
  }

  /* ---------- S1 archive ---------- */
  function renderArchive() {
    var arch = state.archive;
    var champ = $("champ"), body = $("lb1-body");
    champ.textContent = ""; body.textContent = "";
    if (!arch || !arch.champion) return;
    var c = arch.champion;

    var card = el("article", "card mvp");
    card.setAttribute("aria-label", arch.season + " champion: " + c.name);
    var crown = icon("crown"); crown.setAttribute("class", "mvp-crown"); card.appendChild(crown);
    var top = el("div", "mvp-top");
    top.appendChild(avatar(c.name));
    var info = el("div");
    var badge = el("span", "mvp-badge"); badge.appendChild(icon("crown")); badge.appendChild(document.createTextNode("Season 1 champion"));
    info.appendChild(badge);
    info.appendChild(el("h3", "mvp-name", c.name));
    info.appendChild(el("p", "mvp-sub", "Most goals + assists in Season 1"));
    top.appendChild(info); card.appendChild(top);
    var dl = el("dl", "mvp-stats");
    [["Goals", c.g], ["Assists", c.a], ["G+A", c.ga, true]].forEach(function (s) {
      var box = el("div", "stat" + (s[2] ? " hl" : ""));
      box.appendChild(el("dt", null, s[0])); box.appendChild(el("dd", null, String(s[1]))); dl.appendChild(box);
    });
    card.appendChild(dl);
    champ.appendChild(card);

    arch.rows.forEach(function (r, i) {
      var tr = el("tr", r.rank <= 3 ? "rank-" + r.rank : "");
      tr.style.setProperty("--i", i);
      var tdRank = el("td", "c-rank"); tdRank.appendChild(el("span", "rank", String(r.rank))); tr.appendChild(tdRank);
      var td = el("td"), who = el("div", "who");
      who.appendChild(avatar(r.name));
      var box = el("div");
      var nm = el("span", "who-name", r.name);
      if (!r.s2) nm.appendChild(el("span", "badge-s1", "S1 only"));
      box.appendChild(nm);
      var bar = el("div", "bar"); bar.setAttribute("aria-hidden", "true");
      var fill = el("i"); fill.style.setProperty("--p", Math.round(r.share * 100)); bar.appendChild(fill);
      box.appendChild(bar); who.appendChild(box); td.appendChild(who); tr.appendChild(td);
      tr.appendChild(el("td", "num", String(r.g)));
      tr.appendChild(el("td", "num", String(r.a)));
      tr.appendChild(el("td", "num ga", String(r.ga)));
      body.appendChild(tr);
    });
  }

  /* ---------- season routing (#s2 default, #s1 archive) ---------- */
  function route() {
    var h = location.hash.toLowerCase();
    if (state.routed && h !== "#s1" && h !== "#s2" && h !== "") return; // e.g. skip-link anchors keep the current season
    state.routed = true;
    var wantS1 = h === "#s1" && !!state.archive;
    state.view = wantS1 ? "s1" : "s2";
    var s1 = state.view === "s1";
    $("view-s2").hidden = s1;
    $("view-s1").hidden = !s1;
    $("nav-s2").setAttribute("aria-current", s1 ? "false" : "page");
    if (s1) $("nav-s1").setAttribute("aria-current", "page"); else $("nav-s1").removeAttribute("aria-current");
    var shown = s1 ? $("view-s1") : $("view-s2");
    shown.classList.remove("view-in"); void shown.offsetWidth; shown.classList.add("view-in");

    var d = state.data;
    if (s1) {
      $("season-label").textContent = "Season 1 · Archive";
      $("updated").textContent = "Final standings";
      document.title = (d.name || "Friday League") + " · Season 1 Archive";
      renderChips(state.archive.rows);
    } else {
      renderHeader();
    }
  }

  /* ---------- boot ---------- */
  function showError(msg) {
    var e = $("error"); e.textContent = msg; e.hidden = false;
    $("updated").textContent = "Could not load league data";
  }

  function init(data) {
    state.data = data;
    state.standings = S.computeStandings(data);
    state.archive = S.computeArchive(data, "S1");
    if (state.archive) { $("nav-s1").hidden = false; renderArchive(); }
    var last = S.latestDay(data);
    state.activeDay = last ? last.day : null;
    renderHeader();
    renderMvp();
    renderLeaderboard();
    bindSorting();
    renderTabs();
    renderDayPanel();
    route();
    window.addEventListener("hashchange", route);
  }

  fetch("data/league.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(init)
    .catch(function (err) {
      showError("Couldn't load data/league.json (" + err.message + "). If you opened this file directly, serve the folder over HTTP instead.");
    });
})();
