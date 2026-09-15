# Lantern Courts Dex

Static Pokédex-style browser for **Lantern Courts** (Aftermyth · Series 1).

## Run

Serve over HTTP (required for `fetch` of `dex.json`):

```bash
cd /workspace/lantern-courts-dex && python3 -m http.server 8765
```

Then open [http://localhost:8765](http://localhost:8765).

## Contents

- `index.html` / `styles.css` / `app.js` — single-page UI
- `dex.json` — creature & stadium catalog
- `creatures/` — 15 spirit portraits
- `environments/` — 8 site/stadium art

No build step. Pure static HTML/CSS/JS.
