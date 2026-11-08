# Nature Catalogue — demo only

Project Nature browser mock: Auth → Log sighting → Confirm provisional card → Dex.

## Status

- **DEMO ONLY.** Fake auth (localStorage). No real accounts or photo uploads.
- Species facts in `data/catalogue-demo.json` are **SAMPLE** placeholders (`meta.demo=true`). Species Guide owns real fact packs later.
- Personal dex / sightings / XP stay **private per browser** (localStorage). Shared shape is `speciesCards` only.
- **Not live on Pages yet.** Intentionally omitted from root `package.json` `build` and from `landing/index.html` until auth + uploads land.

## Local preview

Open `index.html` via any static server from this folder (or serve the repo root and hit `/apps/nature/`). Asset paths are relative for a future `/nature/` mount.

Demo seed: username `demo` (any password ≥4 chars) on a fresh empty state loads `demoUser` from the JSON.
