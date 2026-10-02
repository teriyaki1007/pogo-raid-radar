#!/usr/bin/env node
// Append a match day to apps/friday-league/data/league.json.
//
//   node scripts/add-friday-league-matchday.mjs 2026-10-09 "Lucas 3/1, Dastan 2/2, Wesley 1/0"
//
// Profiles/photos live in the "players" key of league.json and are never modified by this script.
// Options: --new  allow player names not seen before (initials badge until a photo is added)   --dry-run  print only, don't write
// Players who did not play are simply left out. Format is "Name goals/assists".
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "apps", "friday-league");
const dataFile = path.join(appDir, "data", "league.json");

export function loadStandings() {
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(appDir, "standings.js"), "utf8"), sandbox);
  return sandbox.module.exports;
}

/** Stable, diff-friendly JSON: one player per line. */
export function formatLeague(d) {
  const q = JSON.stringify;
  const out = ["{"];
  out.push(`  "season": ${q(d.season)},`, `  "name": ${q(d.name)},`, `  "mvp": ${q(d.mvp)},`);
  const players = Object.entries(d.players || {});
  if (!players.length) out.push('  "players": {},');
  else {
    out.push('  "players": {');
    const obj = (v) => "{ " + Object.entries(v).map(([k, x]) => `${q(k)}: ${q(x)}`).join(", ") + " }";
    players.forEach(([n, v], i) => out.push(`    ${q(n)}: ${obj(v)}${i < players.length - 1 ? "," : ""}`));
    out.push("  },");
  }
  out.push('  "matchDays": [');
  d.matchDays.forEach((m, mi) => {
    out.push("    {", `      "day": ${m.day},`, `      "date": ${q(m.date)},`, '      "stats": {');
    const ents = Object.entries(m.stats);
    ents.forEach(([n, s], i) =>
      out.push(`        ${q(n)}: { "g": ${s.g}, "a": ${s.a} }${i < ents.length - 1 ? "," : ""}`));
    out.push("      }", `    }${mi < d.matchDays.length - 1 ? "," : ""}`);
  });
  out.push(d.archive && d.archive.length ? "  ]," : "  ]");
  if (d.archive && d.archive.length) {
    out.push('  "archive": [');
    d.archive.forEach((s, si) => {
      out.push("    {", `      "season": ${q(s.season)},`, '      "final": [');
      s.final.forEach((f, i) =>
        out.push(`        { "player": ${q(f.player)}, "g": ${f.g}, "a": ${f.a} }${i < s.final.length - 1 ? "," : ""}`));
      out.push("      ]", `    }${si < d.archive.length - 1 ? "," : ""}`);
    });
    out.push("  ]");
  }
  out.push("}", "");
  // Archived seasons are passed through untouched; this script only ever appends to matchDays.
  return out.join("\n");
}

export function parseStats(input) {
  const stats = {};
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error("No player stats given. Expected: \"Lucas 3/1, Dastan 2/2\"");
  for (const part of parts) {
    const m = /^(.+?)\s+(\d+)\s*\/\s*(\d+)$/.exec(part);
    if (!m) throw new Error(`Can't parse "${part}". Expected "Name goals/assists", e.g. "Lucas 3/1".`);
    const [, name, g, a] = m;
    if (Number(g) > 99 || Number(a) > 99) throw new Error(`Unrealistic numbers for ${name}: ${g}/${a}`);
    stats[name] = { g: Number(g), a: Number(a) };
  }
  return stats;
}

function main() {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("--"));
  const pos = argv.filter((a) => !a.startsWith("--"));
  const allowNew = flags.includes("--new");
  const dry = flags.includes("--dry-run");
  const bad = flags.filter((f) => !["--new", "--dry-run"].includes(f));
  if (bad.length || pos.length !== 2) {
    console.error('Usage: node scripts/add-friday-league-matchday.mjs <YYYY-MM-DD> "<Name g/a, Name g/a, ...>" [--new] [--dry-run]');
    process.exit(2);
  }
  const [date, statsArg] = pos;
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z")) ||
        new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)
      throw new Error(`Invalid date "${date}" (use YYYY-MM-DD).`);

    const S = loadStandings();
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const days = S.sortedDays(data);
    const last = days[days.length - 1];
    if (last && date <= last.date)
      throw new Error(`Date ${date} must be after the latest match day (${last.date}, MD ${last.day}).`);

    // Known = anyone with stats, a players entry, or an archive entry (so returning players don't need --new).
    const known = [...new Set([
      ...S.playerNames(data),
      ...Object.keys(data.players || {}),
      ...(data.archive || []).flatMap((s) => s.final.map((f) => f.player)),
    ])];
    const stats = {};
    const newcomers = [];
    const raw = parseStats(statsArg);
    for (const [typed, v] of Object.entries(raw)) {
      const match = known.find((k) => k.toLowerCase() === typed.toLowerCase());
      let name = match;
      if (!match) {
        if (!allowNew) throw new Error(`Unknown player "${typed}". Known: ${known.join(", ")}. Use --new to add a new player.`);
        name = typed.replace(/\s+/g, " ");
        newcomers.push(name);
      }
      if (name in stats) throw new Error(`Player "${name}" listed twice.`);
      stats[name] = v;
    }

    data.matchDays = days.concat([{ day: (last ? last.day : 0) + 1, date, stats }]);
    const text = formatLeague(data);
    JSON.parse(text); // sanity check

    const table = S.computeStandings(data);
    console.log(`${dry ? "[dry run] " : ""}Match Day ${data.matchDays.at(-1).day} (${date}) ${dry ? "would be" : "added"}.`);
    console.log("\n #  Player      MD   G   A  G+A");
    for (const r of table)
      console.log(`${String(r.rank).padStart(2)}  ${r.name.padEnd(10)} ${String(r.md).padStart(3)} ${String(r.g).padStart(3)} ${String(r.a).padStart(3)} ${String(r.ga).padStart(4)}`);
    for (const n of newcomers)
      console.log(`\nNote: new player "${n}" gets an initials badge. To add a photo: put img/<name>.jpg in apps/friday-league/ and add "${n}": { "photo": "img/<name>.jpg", "pos": "50% 10%" } to the "players" key in data/league.json.`);
    if (!dry) {
      fs.writeFileSync(dataFile, text);
      console.log(`\nWrote ${path.relative(root, dataFile)}. Next: npm run build, commit, push (see apps/friday-league/README.md).`);
    }
  } catch (e) {
    console.error("Error: " + e.message);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
