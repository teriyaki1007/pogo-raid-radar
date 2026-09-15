# Raid Radar

Polished, mobile-first static site for the current Pokémon GO raid schedule: bosses, windows, shiny / hundo rates, and 100IV CPs (L20 / L25 weather).

**As-of data:** 15 Sep 2026 (see `public/data/raids.json`)

This repo builds a **multi-app Cloudflare Pages host**. Apps live as sibling paths under one subdomain. Fully static — no login, no analytics, no backend.

| Path | App |
| --- | --- |
| `/raid/` | **Raid Radar** — Vite-built Pokémon GO raid schedule |
| `/lantern-courts/` | **Lantern Courts Dex** — Aftermyth Series 1 card/creature browser (static copy from `apps/lantern-courts/`; no separate npm build) |

## Local development

```bash
npm install
npm run dev
```

Open the URL Vite prints, then go to `/raid/` (usually http://localhost:5173/raid/).

Lantern Courts is only present after a production-style build (or copy `apps/lantern-courts/` into `dist/lantern-courts/` yourself); Vite `dev` serves the Raid Radar app.

## Production build

```bash
npm run build
```

Output: `dist/`

- `dist/index.html` — dark root landing page (links to apps)
- `dist/raid/` — Raid Radar app (`index.html`, assets, `data/raids.json`)
- `dist/lantern-courts/` — Lantern Courts Dex (copied as-is from `apps/lantern-courts/`)

Preview locally:

```bash
npm run preview
```

(Vite preview serves Raid Radar under `/raid/` because of `base`. Landing + lantern-courts are in `dist/` for Pages deploy.)

## Updating raid data

1. Edit **`public/data/raids.json`** (do not invent bosses/CPs/rates — sync from Leek Duck / GO Hub / pokemongolive).
2. Keep fields consistent with existing entries (`category`: `current` | `upcoming` | `shadow`, etc.).
3. Refresh **type / weakness / counter** fields with the schedule: each boss needs `types`, `weakTo` (mark `2×` double weaknesses), and `counters` (`{ "name", "moves" }`, ~3–6 practical attackers). Prefer live GO Hub / Pokebattler / Leek Duck guides; if none exist, use type-chart + meta attackers and set `countersSource` to `"type"` (guides use `"guide"`).
4. Rebuild / redeploy. No code change required for routine rotation updates.

Optional: keep a research markdown report elsewhere and convert into this JSON when the rotation changes.

## Updating Lantern Courts Dex

Edit files under **`apps/lantern-courts/`** (HTML/CSS/JS, `dex.json`, PNGs). Rebuild with `npm run build` — the folder is copied into `dist/lantern-courts/` with no path rewrites. There is no npm/Vite build step for this app.

## Cloudflare Pages

This Pages project is a **multi-app host** on one subdomain. Raid Radar is at `/raid/`; Lantern Courts Dex is at `/lantern-courts/`.

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
- Data-driven from `public/data/raids.json` (fetched via `import.meta.env.BASE_URL`)
- Artwork from [PokéAPI sprites](https://github.com/PokeAPI/sprites) CDN with graceful 404 fallbacks
- Dark theme, outdoor-readable, ~390px mobile-first
- Lantern Courts Dex: pure static assets in `apps/lantern-courts/`, copied into `dist/` at build time

## Disclaimer

Raid Radar is an unofficial fan project and is not affiliated with Niantic, The Pokémon Company, or Nintendo. Raid windows and rates change; always re-check [Leek Duck](https://leekduck.com/raid-bosses/), [GO Hub](https://pokemongohub.net/post/guide/current-go-raids/), and [pokemongolive](https://pokemongolive.com/).
