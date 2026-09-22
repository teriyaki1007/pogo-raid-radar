# Recipe Site Studio

Warm editorial static recipe site — cream paper, sage, tomato accent. No backend for imports; catalog lives in JSON; local imports use `localStorage`.

## Quick start

Serve the folder over HTTP (fetch needs a real origin, not `file://`):

```bash
cd /workspace/recipe-site
python3 -m http.server 8765
```

Open `http://localhost:8765/`.

## Layout

| Path | Role |
|------|------|
| `index.html` | Home — hero + recipe grid from `data/recipes.json` + local imports |
| `import.html` | Paste link/caption → heuristic parse → preview → save |
| `recipes/*.html` | Individual readable recipe pages |
| `data/recipes.json` | Published catalog (id, title, blurb, href, tags, art) |
| `styles.css` | Shared design system |
| `js/home.js` | Loads catalog + imports; delete controls; lobster purge; hidden list |
| `js/import.js` | Parse / preview / save imports |
| `assets/*.svg` | Original plating illustrations (CSS/SVG only) |

## Design tokens

- Cream paper `#f7f1e8`
- Sage `#3d6b5a`
- Tomato `#c45c3e`
- Charcoal text `#2c2a26`

Mobile-first soft cards, generous type — distinct from dark groot apps (Raid Radar, etc.).

## Add a published recipe

1. Create `recipes/your-dish.html` (copy an existing page; fix `../` asset paths).
2. Append an object to `data/recipes.json`:

```json
{
  "id": "your-dish",
  "title": "Your Dish Name",
  "blurb": "One-line appetite tease.",
  "href": "recipes/your-dish.html",
  "tags": ["weeknight", "salad"],
  "art": "bowl"
}
```

`art` may be `cucumber`, `salmon`, or `bowl` (maps to SVGs in `assets/`).

3. Refresh the home page.

## Import flow

- Paste a URL and/or caption on **Import**.
- Parser looks for a title line, `Ingredients:` / `Method:` sections, and bullet/numbered lines.
- **Save** writes to `localStorage` key `recipe-site-imports-v1`.
- Home grid merges catalog + imports (imports are browser-local until you promote them to JSON + a real page).
- Parsing is **approximate** — captions are often incomplete or gated.

## Delete & hide recipes

On the home shelf, every card has a **Delete** control (confirm dialog first):

- **Imported** cards: removed from `localStorage` key `recipe-site-imports-v1`, then the grid re-renders.
- **Catalog** cards: id is added to `recipe-site-hidden-v1` (array of ids) so they disappear from the grid without editing server files. Use **Restore hidden catalog recipes** in the footer to clear that list.

On first load, `home.js` also auto-removes any imported recipe whose title matches lobster + mac (case-insensitive), so stray Lobster Mac and Cheese imports disappear for returning users.

## Mounting on groot


Pokemon Go Helper can mount this site at `/recipes/` on groot when ready (static assets + `recipes.json` fetch). Until then, treat `/workspace/recipe-site/` as the source of truth for Recipe Site Studio.

## Out of scope (unless asked)

- Do not push to GitHub from this scaffold alone.
- Do not modify `pogo-raid-radar` unless explicitly requested.
