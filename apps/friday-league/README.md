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
  "players": {
    "Lucas": { "photo": "img/lucas.jpg", "pos": "62% 30%", "zoom": 2.2 }
  },
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
- `players` holds profile extras per player (photo + stats only, no bio): `photo` (path under this folder, e.g. `img/lucas.jpg`), `pos` (where the face is in the photo as `"x% y%"`, used to crop the round avatars and the big profile photo) and optional `zoom` (avatar crop tightness, default 2; wide photos need ~4). Players without an entry (or whose image fails to load) get a generated initials badge. Stats on profiles are never stored: S2 is computed from `matchDays`, S1 from `archive`.

## Player profiles
- Every player has a linkable profile at `#player/<name-slug>`, e.g. `/friday-league/#player/lucas`. Leaderboard rows (S2, S1 and match-day tables) link to it. It shows photo, S2 rank/G/A/G+A, appearances, G+A per match day, S1 G/A/G+A and rank, a per-match-day table, MVP / S1 Champion badges, back button and prev/next arrows (also the ← → keys). S1-only players (Luke, Theo) get a stats-only profile.
- **Add or change a photo:** save a JPEG (about 600px wide max, 60–120 KB; fix EXIF rotation first, e.g. with Python PIL `ImageOps.exif_transpose` + `thumbnail((600, 800))`) as `apps/friday-league/img/<name>.jpg`, then add `"<Name>": { "photo": "img/<name>.jpg", "pos": "50% 15%", "zoom": 2 }` to the `players` key. `pos` is the face centre as a percentage of the photo; check the round avatar and adjust `pos`/`zoom`.
- A new player added with `--new` has no `players` entry, so they show an initials badge until a photo is added.
- Photos are private pictures of friends: keep them in `img/` only (no hotlinking, no other copies).

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
The script appends the next day number, validates the date (must be after the last match day), names (must already exist; use `--new` for a new player), and numbers, rewrites `league.json` in a stable format, and prints the new totals. Use `--dry-run` to preview. Leave out anyone who was absent. `players` (photos) and `archive` are left untouched.

You can also edit `data/league.json` directly (append an object to `matchDays` with the next `day`), then run `node scripts/test-friday-league.mjs`, which also checks the file stays in the stable format.

To change the MVP, edit `"mvp"` in the JSON.

## Local preview
`cd apps/friday-league && python3 -m http.server 8000` (the page loads the JSON with `fetch`, so open it over HTTP, not `file://`).
