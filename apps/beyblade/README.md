# Beyblade Guide (X Combo Builder)

Static coaching site for Beyblade X: combo builder + parts reference with **HKD price estimates**.

## Deploy

Copy this folder to `apps/beyblade/` (or equivalent) on the Pages project. **No build steps.**

- Preferred URL path: `/beyblade/`
- Example: `https://groot.zynergy.studio/beyblade/`

All asset paths are **relative** (`styles.css`, `app.js`, `score.js`, `data/parts.json`) so the site works under a subdirectory.

## Local preview

```bash
cd /workspace/beyblade
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

`fetch("data/parts.json")` needs HTTP (or a static host). Opening `index.html` via `file://` may block the JSON load.

## Scoring (`score.js`)

Tunable weights in `WEIGHTS`:

| Score | Idea |
|-------|------|
| **Competitiveness** | `0.50×blade + 0.25×ratchet + 0.25×bit` scoreBase, + synergy for documented partners, − mismatch (tall/weak ratchets, role clash) |
| **Meta-breaking** | Disruptiveness (left-spin, expand, unusual stacks), capped by performance so trash combos stay low |
| **Value for price** | Performance proxy ÷ estimated HKD mid cost, normalized 0–100 |
| **Grade S–D** | Mostly competitiveness, lightly nudged by value |

Scores and HK$ ranges are **coach estimates**. Meta shifts; verify live listings and tournament data before buying or locking a deck.

## Data

`data/parts.json` is derived from `/workspace/beyblade-x-parts-reference.md` (researched 2026-09-18): BEYWATCH viability mapping, WBO prize-score combos, and HK sealed retail anchors (T CLUB / BuyMarket / The Club). Loose singles often marked unknown.

## Files

```
index.html    SPA shell (builder + parts tabs)
styles.css    Dark stadium theme (#0b1020)
app.js        UI + data load
score.js      Transparent scorer module
data/parts.json
README.md
DEPLOY.txt
```
