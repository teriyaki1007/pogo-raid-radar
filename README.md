# Raid Radar

Polished, mobile-first static site for the current Pokémon GO raid schedule: bosses, windows, shiny / hundo rates, and 100IV CPs (L20 / L25 weather).

**As-of data:** 15 Sep 2026 (see `public/data/raids.json`)

Live intent: Cloudflare Pages + custom domain. Fully static — no login, no analytics, no backend.

## Local development

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Production build

```bash
npm run build
```

Output: `dist/` (ready for Cloudflare Pages or any static host).

Preview locally:

```bash
npm run preview
```

## Updating raid data

1. Edit **`public/data/raids.json`** (do not invent bosses/CPs/rates — sync from Leek Duck / GO Hub / pokemongolive).
2. Keep fields consistent with existing entries (`category`: `current` | `upcoming` | `shadow`, etc.).
3. Rebuild / redeploy. No code change required for routine rotation updates.

Optional: keep a research markdown report elsewhere and convert into this JSON when the rotation changes.

## Cloudflare Pages

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

- Vite + vanilla HTML / CSS / JS
- Data-driven from `public/data/raids.json`
- Artwork from [PokéAPI sprites](https://github.com/PokeAPI/sprites) CDN with graceful 404 fallbacks
- Dark theme, outdoor-readable, ~390px mobile-first

## Disclaimer

Raid Radar is an unofficial fan project and is not affiliated with Niantic, The Pokémon Company, or Nintendo. Raid windows and rates change; always re-check [Leek Duck](https://leekduck.com/raid-bosses/), [GO Hub](https://pokemongohub.net/post/guide/current-go-raids/), and [pokemongolive](https://pokemongolive.com/).
