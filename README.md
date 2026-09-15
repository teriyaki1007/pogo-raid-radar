# Raid Radar

Polished, mobile-first static site for Pokémon GO **raids**, **egg pools**, and **Team GO Rocket** lineups: bosses, windows, shiny / hundo rates, 100IV CPs (L20 / L25 weather), hatch pools by distance, and grunt/leader counters.

**As-of data:** 15 Sep 2026 (see `public/data/raids.json`, `eggs.json`, `rocket.json`)

This repo builds a **multi-app Cloudflare Pages host**. Apps live as sibling paths under one subdomain. Fully static — no login, no analytics, no backend.

| Path | App |
| --- | --- |
| `/raid/` | **Raid Radar** — Vite-built Pokémon GO raids / eggs / Rocket |
| `/lantern-courts/` | **Lantern Courts Dex** — Aftermyth Series 1 card/creature browser (static copy from `apps/lantern-courts/`; no separate npm build) |
| `/ap-csa/` | **AP CSA Study Plan** — Weekly Java checklists through the May 12, 2027 exam (static copy from `apps/ap-csa/`; no separate npm build) |

## Local development

```bash
npm install
npm run dev
```

Open the URL Vite prints, then go to `/raid/` (usually http://localhost:5173/raid/).

Lantern Courts and AP CSA are only present after a production-style build (or copy `apps/lantern-courts/` / `apps/ap-csa/` into `dist/` yourself); Vite `dev` serves the Raid Radar app.

## Production build

```bash
npm run build
```

Output: `dist/`

- `dist/index.html` — dark root landing page (links to apps)
- `dist/raid/` — Raid Radar app (`index.html`, assets, `data/raids.json`, `data/eggs.json`, `data/rocket.json`)
- `dist/lantern-courts/` — Lantern Courts Dex (copied as-is from `apps/lantern-courts/`)
- `dist/ap-csa/` — AP CSA Study Plan (copied as-is from `apps/ap-csa/`)

Preview locally:

```bash
npm run preview
```

(Vite preview serves Raid Radar under `/raid/` because of `base`. Landing + lantern-courts + ap-csa are in `dist/` for Pages deploy.)

## Updating game data (raids + eggs + Rocket)

Refresh all three JSON files when the season, raid package, egg pools, or Rocket lineups change. Do **not** invent bosses, hatch rates, or unpublished shiny odds — sync from Leek Duck / GO Hub / pokemongolive / reputable guides.

### Raids — `public/data/raids.json`

1. Keep fields consistent with existing entries (`category`: `current` | `upcoming` | `shadow`, etc.).
2. Refresh **type / weakness / counter** fields with the schedule: each boss needs `types`, `weakTo` (mark `2×` double weaknesses), and `counters` (`{ "name", "moves" }`, ~3–6 practical attackers). Prefer live GO Hub / Pokebattler / Leek Duck guides; if none exist, use type-chart + meta attackers and set `countersSource` to `"type"` (guides use `"guide"`).
3. Update `meta.asOf` / `meta.asOfLabel` and the callout when the current package ends.

### Eggs — `public/data/eggs.json`

1. Update pools for **1 km, 2 km, 5 km, 5 km Adventure Sync, 7 km (gifts), 7 km (Route / Mateo), 10 km, 10 km Adventure Sync, 12 km Strange Eggs**, plus any active **event eggs**.
2. Mark `incomplete: true` when a chart says the list is still being confirmed.
3. Set `shiny: true` only when a source marks shiny available; use `null` when unpublished. Hatch **rates** are almost never published — leave them out rather than guessing.
4. Note the season window in `meta`.

### Team GO Rocket — `public/data/rocket.json`

1. Refresh **grunt** lineups (quote → phase 1/2/3 Pokémon), **leaders** (Arlo / Cliff / Sierra), and **Giovanni** when Takeovers change teams.
2. Keep brief `weakTo` / `counters`; note balloon vs PokéStop availability and whether Giovanni requires a Super Rocket Radar.
3. Mark Giovanni `active` / `activeNote` clearly when no Takeover is live.

### After editing data

Rebuild / redeploy. Routine rotation updates usually need **no** code changes — only JSON.

Optional: keep a research markdown report under `/workspace` (or elsewhere) and convert into these JSON files when the rotation changes.

## Updating Lantern Courts Dex

Edit files under **`apps/lantern-courts/`** (HTML/CSS/JS, `dex.json`, PNGs). Rebuild with `npm run build` — the folder is copied into `dist/lantern-courts/` with no path rewrites. There is no npm/Vite build step for this app.

## Updating AP CSA Study Plan

Edit files under **`apps/ap-csa/`** (`index.html`, `styles.css`, `app.js`). Rebuild with `npm run build` — the folder is copied into `dist/ap-csa/` with no path rewrites. Pure static sibling app; no npm/Vite build step for this app.

## Cloudflare Pages

This Pages project is a **multi-app host** on one subdomain. Raid Radar is at `/raid/`; Lantern Courts Dex is at `/lantern-courts/`; AP CSA Study Plan is at `/ap-csa/`.

| Setting | Value |
| --- | --- |
| Framework preset | Vite (or None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (repo root) |
| Node version | 18+ (or 20) |

### Custom domain (later)

1. Pages project → **Custom domains** → add your domain.
2. Point DNS (Cloudflare recommended): CNAME to your `*.pages.dev` hostname, or use Cloudflare DNS proxy.
3. SSL is automatic once DNS verifies.

## Tech

- Vite + vanilla HTML / CSS / JS for Raid Radar (`base: '/raid/'`, build outDir `dist/raid`)
- Data-driven from `public/data/raids.json`, `eggs.json`, and `rocket.json` (fetched via `import.meta.env.BASE_URL`)
- Tabs: Current / Upcoming / Shadow / **Eggs** / **Rocket** / Events
- Artwork from [PokéAPI sprites](https://github.com/PokeAPI/sprites) CDN with graceful 404 fallbacks
- Dark theme, outdoor-readable, ~390px mobile-first
- Lantern Courts Dex: pure static assets in `apps/lantern-courts/`, copied into `dist/` at build time
- AP CSA Study Plan: pure static assets in `apps/ap-csa/`, copied into `dist/` at build time

## Disclaimer

Raid Radar is an unofficial fan project and is not affiliated with Niantic, The Pokémon Company, or Nintendo. Raid windows, egg pools, Rocket lineups, and rates change; always re-check [Leek Duck](https://leekduck.com/), [GO Hub](https://pokemongohub.net/), and [pokemongolive](https://pokemongolive.com/).
