/* Friday League standings logic. UMD: works in the browser (window.FridayLeagueStandings)
   and in Node (module.exports, or via the `vm` trick). No dependencies. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.FridayLeagueStandings = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function num(v) {
    var n = Number(v);
    return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  /** Match days sorted by day number. */
  function sortedDays(data) {
    return ((data && data.matchDays) || []).slice().sort(function (x, y) { return x.day - y.day; });
  }

  /** S2 player names: anyone with a stat line in a match day. (data.players only holds photos/profile extras.) */
  function playerNames(data) {
    var seen = {};
    var names = [];
    function add(n) { if (!Object.prototype.hasOwnProperty.call(seen, n)) { seen[n] = 1; names.push(n); } }
    sortedDays(data).forEach(function (d) { Object.keys(d.stats || {}).forEach(add); });
    return names;
  }

  /** Tiebreak order: G+A desc, goals desc, fewer match days played, alphabetical. */
  function compareOverall(a, b) {
    return (b.ga - a.ga) || (b.g - a.g) || (a.md - b.md) || a.name.localeCompare(b.name, "en");
  }
  function compareGoals(a, b) {
    return (b.g - a.g) || compareOverall(a, b);
  }
  function compareAssists(a, b) {
    return (b.a - a.a) || compareOverall(a, b);
  }

  /** Overall standings, computed from matchDays only. Each row: {name, rank, md, g, a, ga, gaPerMd, share, perDay}. */
  function computeStandings(data) {
    var rows = {};
    playerNames(data).forEach(function (n) {
      rows[n] = { name: n, md: 0, g: 0, a: 0, ga: 0, perDay: {} };
    });
    sortedDays(data).forEach(function (d) {
      Object.keys(d.stats || {}).forEach(function (n) {
        var s = d.stats[n] || {};
        var r = rows[n];
        var g = num(s.g), a = num(s.a);
        r.md += 1; r.g += g; r.a += a; r.ga += g + a;
        r.perDay[d.day] = { g: g, a: a, ga: g + a };
      });
    });
    var list = Object.keys(rows).map(function (k) { return rows[k]; }).sort(compareOverall);
    var lead = list.length ? list[0].ga : 0;
    list.forEach(function (r, i) {
      r.rank = i + 1;
      r.gaPerMd = r.md ? r.ga / r.md : 0;
      r.share = lead ? r.ga / lead : 0;
    });
    return list;
  }

  /** One match-day table: players who played (ranked), then absentees. */
  function matchDayTable(data, dayNo) {
    var day = sortedDays(data).filter(function (d) { return d.day === dayNo; })[0];
    if (!day) return null;
    var played = [], absent = [];
    playerNames(data).forEach(function (n) {
      var s = (day.stats || {})[n];
      if (s) { var g = num(s.g), a = num(s.a); played.push({ name: n, md: 1, g: g, a: a, ga: g + a }); }
      else absent.push(n);
    });
    played.sort(compareOverall);
    played.forEach(function (r, i) { r.rank = i + 1; });
    absent.sort(function (x, y) { return x.localeCompare(y, "en"); });
    return {
      day: day.day, date: day.date, rows: played, absent: absent,
      goals: played.reduce(function (t, r) { return t + r.g; }, 0),
      assists: played.reduce(function (t, r) { return t + r.a; }, 0)
    };
  }

  /** Archived season (final totals only). Rank by G+A, then goals, then A-Z.
      Rows: {name, rank, g, a, ga, s2: whether the player also appears in the current season}. */
  function computeArchive(data, season) {
    var arch = ((data && data.archive) || []).filter(function (s) { return s.season === season; })[0];
    if (!arch) return null;
    var current = {};
    playerNames(data).forEach(function (n) { current[n] = 1; });
    var rows = (arch.final || []).map(function (f) {
      var g = num(f.g), a = num(f.a);
      return { name: f.player, g: g, a: a, ga: g + a, s2: Object.prototype.hasOwnProperty.call(current, f.player) };
    });
    rows.sort(function (x, y) { return (y.ga - x.ga) || (y.g - x.g) || x.name.localeCompare(y.name, "en"); });
    var lead = rows.length ? rows[0].ga : 0;
    rows.forEach(function (r, i) { r.rank = i + 1; r.share = lead ? r.ga / lead : 0; });
    return { season: arch.season, rows: rows, champion: rows.length ? rows[0] : null };
  }

  var ARCHIVE_SEASON = "S1";

  function slugify(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  /** Profile extras for a player from data.players: {photo, pos} or {}. */
  function playerExtras(data, name) {
    var p = ((data && data.players) || {})[name];
    return p && typeof p === "object" ? p : {};
  }

  /** Everyone who has a profile page: S2 players by rank, then archive-only players by archive rank. */
  function profileOrder(data) {
    var names = computeStandings(data).map(function (r) { return r.name; });
    var arch = computeArchive(data, ARCHIVE_SEASON);
    if (arch) arch.rows.forEach(function (r) { if (names.indexOf(r.name) < 0) names.push(r.name); });
    return names;
  }

  function findBySlug(data, slug) {
    var all = profileOrder(data);
    for (var i = 0; i < all.length; i++) if (slugify(all[i]) === slug) return all[i];
    return null;
  }

  /** Everything the profile page shows, computed from matchDays + archive. */
  function playerProfile(data, name) {
    var s2 = computeStandings(data).filter(function (r) { return r.name === name; })[0] || null;
    var arch = computeArchive(data, ARCHIVE_SEASON);
    var s1 = arch ? (arch.rows.filter(function (r) { return r.name === name; })[0] || null) : null;
    if (!s2 && !s1) return null;
    var extras = playerExtras(data, name);
    var days = sortedDays(data).map(function (d) {
      var e = s2 && s2.perDay[d.day];
      return { day: d.day, date: d.date, played: !!e, g: e ? e.g : 0, a: e ? e.a : 0, ga: e ? e.ga : 0 };
    });
    var order = profileOrder(data), i = order.indexOf(name);
    return {
      name: name, slug: slugify(name), photo: extras.photo || null, pos: extras.pos || null,
      s2: s2 && s2.md ? s2 : null, s1: s1, perDay: days,
      isMvp: !!data.mvp && data.mvp === name,
      isChampion: !!(arch && arch.champion && arch.champion.name === name),
      s1Only: !!s1 && !(s2 && s2.md),
      prev: order[(i - 1 + order.length) % order.length], next: order[(i + 1) % order.length]
    };
  }

  /** Name(s) with the highest value of key ("g" or "a"); ties return several. */
  function leaders(rows, key) {
    var max = 0;
    rows.forEach(function (r) { if (r[key] > max) max = r[key]; });
    if (!max) return { value: 0, names: [] };
    return { value: max, names: rows.filter(function (r) { return r[key] === max; }).map(function (r) { return r.name; }) };
  }

  function latestDay(data) {
    var d = sortedDays(data);
    return d.length ? d[d.length - 1] : null;
  }

  /** Format an ISO date (YYYY-MM-DD) as "2 Oct 2026" without time-zone surprises. */
  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1];
    return Number(m[3]) + " " + mon + " " + m[1];
  }

  return {
    computeStandings: computeStandings, computeArchive: computeArchive,
    slugify: slugify, playerProfile: playerProfile, profileOrder: profileOrder, findBySlug: findBySlug, playerExtras: playerExtras, matchDayTable: matchDayTable, leaders: leaders,
    latestDay: latestDay, sortedDays: sortedDays, playerNames: playerNames, formatDate: formatDate,
    compareOverall: compareOverall, compareGoals: compareGoals, compareAssists: compareAssists
  };
});
