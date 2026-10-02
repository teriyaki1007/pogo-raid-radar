# Friday League (Season 2 · 26/27)

Static leaderboard, live at https://groot.zynergy.studio/friday-league/. Plain HTML/CSS/JS, no build step, no CDN.
Individual players only, ranked by goals + assists (G+A). Tiebreak: more goals, then fewer match days played, then A–Z.

## Files
- `index.html`, `styles.css`, `app.js` – the page
- `standings.js` – all standings maths (works in browser and Node); nothing is hard-coded elsewhere
- `data/league.json` – the only data file

## data/league.json
```json
{
  "season": "S2 (26/27)",
  "name": "Friday League",
  "mvp": "Lucas",
  "players": {},
  "matchDays": [
    { "day": 1, "date": "2026-09-18", "stats": { "Lucas": { "g": 2, "a": 2 }, "Karson": { "g": 0, "a": 0 } } }
  ],
  "archive": [
    { "season": "S1", "final": [ { "player": "Lucas", "g": 36, "a": 10 } ] }
  ]
}
```
- Totals, ranks, appearances, bars, chips and the MVP card stats are all computed from `matchDays`.
- `mvp` is set by hand (not computed).
- A player who did not play a match day has **no entry** for it (shown as "–", no appearance counted).
- `archive` holds finished seasons as **final totals only** (no match days). It is shown at `/friday-league/#s1` (the "Season 1 Archive" switch); `#s2` or no hash is the current season. Archive rows are ranked by G+A, then goals, then A–Z; the champion is the top row; top scorer/assister chips are computed. Players in an archive who are not in the current season get an "S1 only" badge. The add-matchday script never touches `archive`. To archive a finished season later, add another object to `archive` by hand (the page currently displays season `"S1"`).
- `players` is reserved for future player profiles (e.g. `"Lucas": { "profile": "..." }`); it is unused for now.

## Add a new match day
```bash
cd /workspace/pogo-raid-radar
git pull --rebase origin main
node scripts/add-friday-league-matchday.mjs 2026-10-09 "Lucas 3/1, Dastan 2/2, Wesley 1/0"   # Name goals/assists
node scripts/test-friday-league.mjs
npm run build           # copies apps/friday-league into dist/
git add apps/friday-league/data/league.json
git commit -m "Friday League: Match Day 3"
git pull --rebase origin main && git push origin HEAD:main   # Cloudflare Pages republishes in ~1 min
```
The script appends the next day number, validates the date (must be after the last match day), names (must already exist; use `--new` for a new player), and numbers, rewrites `league.json` in a stable format, and prints the new totals. Use `--dry-run` to preview. Leave out anyone who was absent.

You can also edit `data/league.json` directly (append an object to `matchDays` with the next `day`), then run `node scripts/test-friday-league.mjs`, which also checks the file stays in the stable format.

To change the MVP, edit `"mvp"` in the JSON.

## Local preview
`cd apps/friday-league && python3 -m http.server 8000` (the page loads the JSON with `fetch`, so open it over HTTP, not `file://`).
