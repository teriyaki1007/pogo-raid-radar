# Raid Radar

Polished, mobile-first static site for the current Pokémon GO raid schedule: bosses, windows, shiny / hundo rates, and 100IV CPs (L20 / L25 weather).

**As-of data:** 15 Sep 2026 (see `public/data/raids.json`)

This repo builds a **multi-app Cloudflare Pages host**. Raid Radar lives at **`/raid/`**. Future apps (e.g. homework) go in sibling folders like `/homework/`. Fully static — no login, no analytics, no backend.

## Local development

```bash
npm install
npm run dev
```

Open the URL Vite prints, then go to `/raid/` (usually http://localhost:5173/raid/).

## Production build

```bash
npm run build
```

Output: `dist/`

- `dist/index.html` — dark root landing page (links to apps)
- `dist/raid/` — Raid Radar app (`index.html`, assets, `data/raids.json`)

Preview locally:

```bash
npm run preview
```

(Vite preview serves the app under `/raid/` because of `base`.)

## Updating raid data

1. Edit **`public/data/raids.json`** (do not invent bosses/CPs/rates — sync from Leek Duck / GO Hub / pokemongolive).
2. Keep fields consistent with existing entries (`category`: `current` | `upcoming` | `shadow`, etc.).
3. Refresh **type / weakness / counter** fields with the schedule: each boss needs `types`, `weakTo` (mark `2×` double weaknesses), and `counters` (`{ "name", "moves" }`, ~3–6 practical attackers). Prefer live GO Hub / Pokebattler / Leek Duck guides; if none exist, use type-chart + meta attackers and set `countersSource` to `"type"` (guides use `"guide"`).
4. Rebuild / redeploy. No code change required for routine rotation updates.

Optional: keep a research markdown report elsewhere and convert into this JSON when the rotation changes.

## Cloudflare Pages

This Pages project is a **multi-app host** on one subdomain. Raid Radar is served at `/raid/`. Other apps can be added later as sibling folders (e.g. `/homework/`).

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

- Vite + vanilla HTML / CSS / JS (`base: '/raid/'`, build outDir `dist/raid`)
- Data-driven from `public/data/raids.json` (fetched via `import.meta.env.BASE_URL`)
- Artwork from [PokéAPI sprites](https://github.com/PokeAPI/sprites) CDN with graceful 404 fallbacks
- Dark theme, outdoor-readable, ~390px mobile-first

## Disclaimer

Raid Radar is an unofficial fan project and is not affiliated with Niantic, The Pokémon Company, or Nintendo. Raid windows and rates change; always re-check [Leek Duck](https://leekduck.com/raid-bosses/), [GO Hub](https://pokemongohub.net/post/guide/current-go-raids/), and [pokemongolive](https://pokemongolive.com/).
