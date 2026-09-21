# Beyblade Guide (X Combo Builder)

Static coaching site for Beyblade X: combo builder + parts reference with **HKD price estimates** and **tournament usage %**.

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

## Builder modes

| Mode | Parts | Example string |
|------|-------|----------------|
| **Basic / UX** | Blade + Ratchet + Bit | `Wizard Rod 1-60 Hexa` |
| **CX stack** | Lock Chip + Main Blade + Assist Blade + Ratchet + Bit | `Emperor Blast Heavy 9-60 K` |

Expand blades (Glory Valkyrie, Bullet Griffon) stay on Basic/UX with integrated-ratchet display behaviour.

## Usage fields (`data/parts.json`)

Every blade, ratchet, bit, lock chip, main blade, and assist blade has:

| Field | Meaning |
|-------|---------|
| `usagePct` | Number **0–100**, or **`null`** if unknown / insufficient sample |
| `usageNote` | Short provenance (e.g. `BEYWATCH top-cut share (pickRate) Sep 2026; N top cuts`) |
| `usageAsOf` | ISO date of the snapshot |

**Definition:** BEYWATCH `pickRate` = share of reported **top-three** tournament results that included the part (not entry-field share, not win share). Values are scraped from BEYWATCH — **never invented**. When a part has no ranking sample, `usagePct` is `null` and the UI shows **n/a**.

Top-level `meta.metaAsOf` / `meta.updatedAt` / `meta.usageScope` record the scrape window.


## Part images

Parts Reference cards show a ~88px thumbnail per part (`img/{blades,ratchets,bits,lockChips,mainBlades,assistBlades}/<id>.webp`).

| Field | Meaning |
|-------|---------|
| `image` | Relative path like `img/blades/wizard-rod.webp`, or **`null`** when only a labeled placeholder is shown |

**Source / attribution:** Product art copied from the community [Beyblade-X-Parts-Image-Database](https://github.com/Sun-After-the-Reign/Beyblade-X-Parts-Image-Database) (mostly Takara Tomy lineup stills). **Fair use for a non-commercial fan reference** — not affiliated with Takara Tomy / Hasbro. Missing parts (a few Lock Chips) use initials placeholders, never hotlinked CDNs.

Copy the whole folder **including `img/`** when deploying.

## Scoring (`score.js`)

Tunable weights in `WEIGHTS`:

| Score | Idea |
|-------|------|
| **Competitiveness** | Basic: `0.50×blade + 0.25×ratchet + 0.25×bit`. CX: `0.12×lock + 0.38×main + 0.15×assist + 0.175×ratchet + 0.175×bit`, plus metal-lock / Heavy-assist mass bonuses, synergy for documented stacks (e.g. Emperor Blast Heavy), − mismatch. Optional light **usage nudge** (±3) when `usagePct` is present — documented in `score.js` comments; does not invent usage. |
| **Meta-breaking** | Disruptiveness (left-spin, expand, CX mass stacks), capped by performance |
| **Value for price** | Performance proxy ÷ estimated HKD mid cost |
| **Grade S–D** | Mostly competitiveness, lightly nudged by value |

Scores and HK$ ranges are **coach estimates**. Meta shifts; verify live listings and tournament data before buying or locking a deck.

## CHANGELOG (2026-09-21)

- Added local WebP thumbnails for nearly all parts under `img/`; `image` field on every catalog entry.
- Parts Reference cards show `.part-thumb` (or initials placeholder). Cache bust `?v=20260921img`.

## CHANGELOG (2026-09-18)

- Added `usagePct` / `usageNote` / `usageAsOf` on **all** part catalogs from BEYWATCH.GG pickRate.
- Combo builder + parts reference show usage % (n/a when null); parts list can sort by usage.
- CX Custom Line support: `lockChips`, `mainBlades`, `assistBlades` catalogs; builder mode toggle; CX scoring + `Emperor Blast Heavy 9-60 K`-style names.
- “How ratings work” documents usage source and CX weights.

## Data

`data/parts.json` is derived from `/workspace/beyblade-x-parts-reference.md` plus live BEYWATCH.GG `__data.json` usage (2026-09-18): viability mapping, WBO prize-score notes, HK sealed retail anchors. Loose singles often marked unknown.

## Files

```
index.html      SPA shell (builder modes + parts tabs)
styles.css      Dark stadium theme (#0b1020)
app.js          UI + data load
score.js        Transparent scorer (basic + CX)
data/parts.json Blades, ratchets, bits, lockChips, mainBlades, assistBlades (+ image paths)
img/            Local WebP thumbnails by category (required for deploy)
README.md
DEPLOY.txt
```
