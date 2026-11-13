// Run: node scripts/test-friday-league.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStandings, formatLeague, parseStats } from "./add-friday-league-matchday.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(root, "apps/friday-league/data/league.json");
const S = loadStandings();
const plain = (v) => JSON.parse(JSON.stringify(v)); // vm results live in another realm
const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));

// 1. Expected combined table (from the league manager)
const expected = [
  ["Lucas", 13, 13, 26], ["Dastan", 7, 12, 19], ["Wesley", 14, 3, 17], ["Justin", 10, 6, 16],
  ["Curtis", 2, 2, 4], ["Karson", 2, 2, 4], ["Baron", 1, 2, 3], ["Ashton", 0, 1, 1],
];
const table = S.computeStandings(data);
assert.deepEqual(plain(table.map((r) => [r.name, r.g, r.a, r.ga])), expected);
assert.deepEqual(plain(table.map((r) => r.rank)), [1, 2, 3, 4, 5, 5, 7, 8], "Karson and Curtis share 5th on G+A; Baron is 7th");
assert.equal(table.find((r) => r.name === "Curtis").md, 1, "absent MD2/MD3 must not count as an appearance");
assert.equal(table.find((r) => r.name === "Karson").md, 3);
assert.equal(table.find((r) => r.name === "Lucas").md, 3);
assert.equal(table.find((r) => r.name === "Ashton").md, 1);
assert.equal(table[0].gaPerMd, 26 / 3);
assert.equal(table[0].share, 1);
assert.equal(table[1].share, 19 / 26);
assert.equal(data.mvp, "Lucas");

// 2. Leaders & match-day tables
assert.deepEqual(plain(S.leaders(table, "g")), { value: 14, names: ["Wesley"] });
assert.deepEqual(plain(S.leaders(table, "a")), { value: 13, names: ["Lucas"] });
const md2 = S.matchDayTable(data, 2);
assert.deepEqual(plain(md2.absent), ["Curtis"]);
assert.equal(md2.rows[0].name, "Lucas");
assert.equal(md2.goals, 22); assert.equal(md2.assists, 17);
const md3 = S.matchDayTable(data, 3);
assert.deepEqual(plain(md3.absent), ["Baron", "Curtis"], "Ashton joined on MD3 so is not absent earlier; Baron and Curtis missed MD3");
assert.equal(md3.rows[0].name, "Lucas");
assert.equal(md3.rows[0].ga, 10);
assert.deepEqual(plain(md3.rows.map((r) => [r.name, r.ga, r.rank])), [
  ["Lucas", 10, 1], ["Justin", 8, 2], ["Wesley", 7, 3], ["Dastan", 7, 3], ["Karson", 2, 5], ["Ashton", 1, 6],
]);
assert.equal(md3.goals, 19); assert.equal(md3.assists, 16);
assert.equal(md3.date, "2026-11-13"); assert.equal(S.formatDate(md3.date), "13 Nov 2026");
assert.equal(S.matchDayTable(data, 99), null);
assert.equal(S.formatDate("2026-10-02"), "2 Oct 2026");
assert.equal(S.formatDate(null), "");
assert.equal(S.formatDate(""), "");
assert.equal(S.latestDay(data).day, 3);
assert.equal(S.latestDay(data).date, "2026-11-13");

// 3. Tiebreaks: G+A, then more goals, then fewer match days, then alphabetical
const tb = {
  matchDays: [
    { day: 1, date: "2026-01-01", stats: { Zed: { g: 2, a: 0 }, Amy: { g: 1, a: 1 }, Bob: { g: 2, a: 0 }, Cat: { g: 0, a: 2 }, Dan: { g: 1, a: 1 } } },
    { day: 2, date: "2026-01-08", stats: { Dan: { g: 0, a: 0 }, Bob: { g: 0, a: 0 }, Amy: { g: 0, a: 0 }, Eve: { g: 3, a: 0 } } },
  ],
};
// Totals: Eve 3 (1 MD); Zed 2G (1 MD); Bob 2G (2 MD); Amy 1G1A=2 (2 MD); Dan 1G1A=2 (2 MD); Cat 0G2A=2 (1 MD)
// Order: Eve(3); then ga=2: more goals -> Zed, Bob (2G), then Amy, Dan (1G), Cat (0G).
// Zed vs Bob: same goals, fewer MD -> Zed. Amy vs Dan: all equal -> alphabetical.
assert.deepEqual(plain(S.computeStandings(tb).map((r) => r.name)), ["Eve", "Zed", "Bob", "Amy", "Dan", "Cat"]);
assert.deepEqual(plain(S.computeStandings(tb).map((r) => r.rank)), [1, 2, 2, 2, 2, 2], "same G+A share a rank");
const tb2 = { matchDays: [{ day: 1, date: "2026-01-01", stats: { Zoe: { g: 1, a: 0 }, Abe: { g: 1, a: 0 } } }] };
assert.deepEqual(plain(S.computeStandings(tb2).map((r) => r.name)), ["Abe", "Zoe"]);
// Shared leaders on ties
assert.deepEqual(plain(S.leaders(S.computeStandings(tb2), "g").names), ["Abe", "Zoe"]);
// Empty data is fine
assert.deepEqual(plain(S.computeStandings({ matchDays: [] })), []);

// Mid-season joiner is not listed as absent on earlier match days
const join = {
  matchDays: [
    { day: 1, date: "2026-01-01", stats: { Amy: { g: 1, a: 0 }, Bob: { g: 0, a: 1 } } },
    { day: 2, date: null, stats: { Amy: { g: 2, a: 0 }, Cy: { g: 1, a: 0 } } },
  ],
};
assert.deepEqual(plain(S.matchDayTable(join, 1).absent), []);
assert.deepEqual(plain(S.matchDayTable(join, 2).absent), ["Bob"]);
assert.deepEqual(plain(S.playerProfile(join, "Cy").perDay.map((d) => d.day)), [2]);

// 3b. S1 archive (final totals only)
const s1 = S.computeArchive(data, "S1");
assert.deepEqual(plain(s1.rows.map((r) => [r.name, r.g, r.a, r.ga])), [
  ["Lucas", 36, 10, 46], ["Justin", 23, 22, 45], ["Wesley", 30, 11, 41], ["Dastan", 19, 17, 36],
  ["Luke", 5, 16, 21], ["Karson", 10, 5, 15], ["Baron", 6, 4, 10], ["Curtis", 5, 1, 6], ["Theo", 2, 3, 5],
]);
assert.deepEqual(plain(s1.rows.map((r) => r.rank)), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.equal(s1.champion.name, "Lucas");
assert.deepEqual(plain(s1.rows.filter((r) => !r.s2).map((r) => r.name)), ["Luke", "Theo"], "S1-only players");
assert.deepEqual(plain(S.leaders(s1.rows, "g")), { value: 36, names: ["Lucas"] });
assert.deepEqual(plain(S.leaders(s1.rows, "a")), { value: 22, names: ["Justin"] });
assert.equal(S.computeArchive(data, "S9"), null);
assert.equal(S.computeArchive({ matchDays: [] }, "S1"), null);
// archive tiebreak: G+A, then goals, then A-Z
const at = { matchDays: [], archive: [{ season: "S1", final: [
  { player: "Zed", g: 3, a: 1 }, { player: "Amy", g: 2, a: 2 }, { player: "Bob", g: 3, a: 1 }, { player: "Cy", g: 1, a: 1 }] }] };
assert.deepEqual(plain(S.computeArchive(at, "S1").rows.map((r) => r.name)), ["Bob", "Zed", "Amy", "Cy"]);
// archive must not affect S2 standings or player list
assert.deepEqual(plain(S.computeStandings(data).map((r) => r.name)), ["Lucas", "Dastan", "Wesley", "Justin", "Curtis", "Karson", "Baron", "Ashton"]);

// 3c. Add-matchday logic leaves the archive untouched
{
  const before = JSON.stringify(data.archive);
  const copy = JSON.parse(JSON.stringify(data));
  copy.matchDays.push({ day: 4, date: "2026-11-20", stats: { Lucas: { g: 1, a: 0 } } });
  const text = formatLeague(copy);
  assert.equal(JSON.stringify(JSON.parse(text).archive), before);
  assert.equal(JSON.parse(text).matchDays.length, 4);
  assert.equal(JSON.parse(text).matchDays[2].date, "2026-11-13");
}

// 3d. Player profiles: S2 + S1 stats are computed, never stored
const profExpected = {
  Lucas: [[13, 13, 26], [36, 10, 46]], Dastan: [[7, 12, 19], [19, 17, 36]], Wesley: [[14, 3, 17], [30, 11, 41]],
  Justin: [[10, 6, 16], [23, 22, 45]], Curtis: [[2, 2, 4], [5, 1, 6]], Baron: [[1, 2, 3], [6, 4, 10]], Karson: [[2, 2, 4], [10, 5, 15]],
};
for (const [name, [e2, e1]] of Object.entries(profExpected)) {
  const P = S.playerProfile(data, name);
  assert.ok(P, name);
  assert.deepEqual([P.s2.g, P.s2.a, P.s2.ga], e2, `${name} S2`);
  assert.deepEqual([P.s1.g, P.s1.a, P.s1.ga], e1, `${name} S1`);
  assert.equal(P.slug, name.toLowerCase());
  assert.equal(S.findBySlug(data, P.slug), name);
  assert.equal(P.photo, `img/${name.toLowerCase()}.jpg`, `${name} photo path`);
  assert.ok(fs.existsSync(path.join(root, "apps/friday-league", P.photo)), `${name} photo file exists`);
  assert.ok(fs.statSync(path.join(root, "apps/friday-league", P.photo)).size < 150_000, `${name} photo is compressed`);
  assert.equal(P.perDay.length, 3);
}
const ashton = S.playerProfile(data, "Ashton");
assert.ok(ashton && !ashton.s1 && !ashton.s1Only && ashton.s2.rank === 8);
assert.deepEqual([ashton.s2.g, ashton.s2.a, ashton.s2.ga], [0, 1, 1]);
assert.equal(ashton.photo, "img/ashton.jpg");
assert.ok(fs.existsSync(path.join(root, "apps/friday-league", ashton.photo)));
assert.ok(fs.statSync(path.join(root, "apps/friday-league", ashton.photo)).size < 150_000);
assert.deepEqual(plain(ashton.perDay.map((d) => [d.day, d.played, d.g, d.a, d.date])), [[3, true, 0, 1, "2026-11-13"]], "Ashton joined on MD3; earlier days omitted");
const lucas = S.playerProfile(data, "Lucas");
assert.equal(lucas.s2.rank, 1); assert.equal(lucas.s1.rank, 1);
assert.equal(lucas.s2.md, 3); assert.equal(lucas.s2.gaPerMd, 26 / 3);
assert.ok(lucas.isMvp && lucas.isChampion && !lucas.s1Only);
assert.deepEqual(plain(lucas.perDay.map((d) => [d.day, d.played, d.g, d.a])), [[1, true, 2, 2], [2, true, 6, 6], [3, true, 5, 5]]);
const curtis = S.playerProfile(data, "Curtis");
assert.equal(curtis.s2.md, 1); assert.equal(curtis.s2.rank, 5);
assert.equal(S.playerProfile(data, "Karson").s2.rank, 5, "shared 5th with Curtis on 4 G+A");
assert.equal(S.playerProfile(data, "Baron").s2.rank, 7);
assert.deepEqual(plain(curtis.perDay.map((d) => d.played)), [true, false, false], "Curtis absent MD2 and MD3");
assert.ok(!S.playerProfile(data, "Dastan").isMvp && !S.playerProfile(data, "Dastan").isChampion);
// S1-only players: stats-only profile (no photo, no S2)
for (const [name, rank, ga] of [["Luke", 5, 21], ["Theo", 9, 5]]) {
  const P = S.playerProfile(data, name);
  assert.ok(P.s1Only && !P.s2 && P.photo === null && P.s1.rank === rank && P.s1.ga === ga, name);
}
assert.equal(S.playerProfile(data, "Nobody"), null);
assert.equal(S.findBySlug(data, "nobody"), null);
// prev/next wrap around: S2 players by rank, then S1-only players
assert.deepEqual(plain(S.profileOrder(data)), ["Lucas", "Dastan", "Wesley", "Justin", "Curtis", "Karson", "Baron", "Ashton", "Luke", "Theo"]);
assert.equal(lucas.prev, "Theo"); assert.equal(lucas.next, "Dastan");
assert.equal(ashton.prev, "Baron"); assert.equal(ashton.next, "Luke");
assert.equal(S.slugify("Mary Ann"), "mary-ann");
// photos referenced by data.players must exist
for (const [n, v] of Object.entries(data.players)) assert.ok(fs.existsSync(path.join(root, "apps/friday-league", v.photo)), `${n} photo`);

// 4. Script helpers
assert.deepEqual(parseStats("Lucas 3/1, Dastan 2 / 2"), { Lucas: { g: 3, a: 1 }, Dastan: { g: 2, a: 2 } });
assert.throws(() => parseStats("Lucas 3-1"));
assert.throws(() => parseStats(""));
assert.equal(formatLeague(data), fs.readFileSync(dataFile, "utf8"), "league.json must be in stable format");

console.log("friday-league: all tests passed");
