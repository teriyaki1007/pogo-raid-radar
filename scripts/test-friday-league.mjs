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
  ["Lucas", 8, 8, 16], ["Dastan", 5, 7, 12], ["Wesley", 9, 1, 10], ["Justin", 4, 4, 8],
  ["Curtis", 2, 2, 4], ["Baron", 1, 2, 3], ["Karson", 1, 1, 2],
];
const table = S.computeStandings(data);
assert.deepEqual(plain(table.map((r) => [r.name, r.g, r.a, r.ga])), expected);
assert.deepEqual(plain(table.map((r) => r.rank)), [1, 2, 3, 4, 5, 6, 7]);
assert.equal(table.find((r) => r.name === "Curtis").md, 1, "absent MD2 must not count as an appearance");
assert.equal(table.find((r) => r.name === "Lucas").md, 2);
assert.equal(table[0].gaPerMd, 8);
assert.equal(table[0].share, 1);
assert.equal(table[1].share, 12 / 16);
assert.equal(data.mvp, "Lucas");

// 2. Leaders & match-day tables
assert.deepEqual(plain(S.leaders(table, "g")), { value: 9, names: ["Wesley"] });
assert.deepEqual(plain(S.leaders(table, "a")), { value: 8, names: ["Lucas"] });
const md2 = S.matchDayTable(data, 2);
assert.deepEqual(plain(md2.absent), ["Curtis"]);
assert.equal(md2.rows[0].name, "Lucas");
assert.equal(md2.goals, 22); assert.equal(md2.assists, 17);
assert.equal(S.matchDayTable(data, 99), null);
assert.equal(S.formatDate("2026-10-02"), "2 Oct 2026");
assert.equal(S.latestDay(data).day, 2);

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
const tb2 = { matchDays: [{ day: 1, date: "2026-01-01", stats: { Zoe: { g: 1, a: 0 }, Abe: { g: 1, a: 0 } } }] };
assert.deepEqual(plain(S.computeStandings(tb2).map((r) => r.name)), ["Abe", "Zoe"]);
// Shared leaders on ties
assert.deepEqual(plain(S.leaders(S.computeStandings(tb2), "g").names), ["Abe", "Zoe"]);
// Empty data is fine
assert.deepEqual(plain(S.computeStandings({ matchDays: [] })), []);

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
assert.deepEqual(plain(S.computeStandings(data).map((r) => r.name)), ["Lucas", "Dastan", "Wesley", "Justin", "Curtis", "Baron", "Karson"]);

// 3c. Add-matchday logic leaves the archive untouched
{
  const before = JSON.stringify(data.archive);
  const copy = JSON.parse(JSON.stringify(data));
  copy.matchDays.push({ day: 3, date: "2026-10-09", stats: { Lucas: { g: 1, a: 0 } } });
  const text = formatLeague(copy);
  assert.equal(JSON.stringify(JSON.parse(text).archive), before);
  assert.equal(JSON.parse(text).matchDays.length, 3);
}

// 4. Script helpers
assert.deepEqual(parseStats("Lucas 3/1, Dastan 2 / 2"), { Lucas: { g: 3, a: 1 }, Dastan: { g: 2, a: 2 } });
assert.throws(() => parseStats("Lucas 3-1"));
assert.throws(() => parseStats(""));
assert.equal(formatLeague(data), fs.readFileSync(dataFile, "utf8"), "league.json must be in stable format");

console.log("friday-league: all tests passed");
