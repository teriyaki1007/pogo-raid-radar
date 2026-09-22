(function () {
  const STORAGE_KEY = "recipe-site-imports-v1";
  const HIDDEN_KEY = "recipe-site-hidden-v1";
  const grid = document.getElementById("recipe-grid");
  const countEl = document.getElementById("recipe-count");
  const restoreLink = document.getElementById("restore-hidden");

  if (!grid) return;

  const ART_ROOT = {
    // Per-dish original illustrations (preferred)
    "dish-cucumber-salmon": "assets/dish-cucumber-salmon.svg",
    "dish-mediterranean-cucumber": "assets/dish-mediterranean-cucumber.svg",
    "dish-edamame-cucumber": "assets/dish-edamame-cucumber.svg",
    "dish-spam-musubi": "assets/dish-spam-musubi.svg",
    "dish-tomato-beef-soup": "assets/dish-tomato-beef-soup.svg",
    "dish-spicy-chicken-udon": "assets/dish-spicy-chicken-udon.svg",
    "dish-carbonara": "assets/dish-carbonara.svg",
    // Legacy keys (imports / older catalog entries)
    cucumber: "assets/plating-cucumber.svg",
    salmon: "assets/plating-salmon.svg",
    bowl: "assets/plating-bowl.svg",
  };

  let catalogCache = [];

  function artSrc(key) {
    if (!key) return ART_ROOT.bowl;
    if (ART_ROOT[key]) return ART_ROOT[key];
    // Allow art: "dish-foo" → assets/dish-foo.svg when file naming matches
    if (String(key).startsWith("dish-")) {
      return "assets/" + key + ".svg";
    }
    return ART_ROOT.bowl;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadImports() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveImports(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_) {
      /* ignore quota / private mode */
    }
  }

  function loadHidden() {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function saveHidden(ids) {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
    } catch (_) {
      /* ignore */
    }
  }

  /** Purge imported Lobster Mac (and Cheese) on first load. */
  function purgeLobsterImports() {
    const imports = loadImports();
    const kept = imports.filter((r) => {
      const title = String((r && r.title) || "").toLowerCase();
      return !(title.includes("lobster") && title.includes("mac"));
    });
    if (kept.length !== imports.length) {
      saveImports(kept);
    }
    return kept;
  }

  function isLobsterTitle(title) {
    const t = String(title || "").toLowerCase();
    return t.includes("lobster") && t.includes("mac");
  }

  function deleteBtnHtml(kind, id, title) {
    return (
      '<button type="button" class="btn-delete" ' +
      'data-delete-kind="' +
      escapeHtml(kind) +
      '" data-delete-id="' +
      escapeHtml(id || "") +
      '" data-delete-title="' +
      escapeHtml(title || "this recipe") +
      '" aria-label="Delete ' +
      escapeHtml(title || "recipe") +
      '">Delete</button>'
    );
  }

  function cardHtml(recipe) {
    const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
    const tagHtml = tags.map((t) => `<li class="tag">${escapeHtml(t)}</li>`).join("");
    const href = recipe.href || "#";
    const title = escapeHtml(recipe.title || "Untitled recipe");
    const blurb = escapeHtml(recipe.blurb || "");
    const art = artSrc(recipe.art || "cucumber");
    const id = recipe.id || "";

    return `
      <article class="card" data-catalog-id="${escapeHtml(id)}">
        <div class="card-art" aria-hidden="true">
          <img src="${art}" alt="" width="280" height="175" />
        </div>
        <div class="card-body">
          <div class="card-top">
            <h3><a href="${escapeHtml(href)}">${title}</a></h3>
            ${deleteBtnHtml("catalog", id, recipe.title || "Untitled recipe")}
          </div>
          <p class="blurb">${blurb}</p>
          <ul class="tags">${tagHtml}</ul>
        </div>
      </article>
    `;
  }

  function importedCardHtml(recipe) {
    const tags = Array.isArray(recipe.tags) ? recipe.tags : ["imported"];
    const title = escapeHtml(recipe.title || "Imported recipe");
    const blurb = escapeHtml(
      recipe.blurb ||
        (recipe.ingredients && recipe.ingredients.slice(0, 3).join(", ")) ||
        "Saved from a pasted link or caption."
    );
    const art = artSrc(recipe.art || "bowl");
    const tagHtml = tags
      .map((t) => `<li class="tag">${escapeHtml(t)}</li>`)
      .concat(['<li class="tag tag-imported">Local</li>'])
      .join("");
    const detailId = recipe.id || "";

    return `
      <article class="card" data-import-id="${escapeHtml(detailId)}">
        <div class="card-art" aria-hidden="true">
          <img src="${art}" alt="" width="280" height="175" />
        </div>
        <div class="card-body">
          <div class="card-top">
            <h3>${title}</h3>
            ${deleteBtnHtml("import", detailId, recipe.title || "Imported recipe")}
          </div>
          <p class="blurb">${blurb}</p>
          <ul class="tags">${tagHtml}</ul>
          <p class="hint" style="margin:0">Saved in this browser</p>
        </div>
      </article>
    `;
  }

  function visibleCatalog(catalog) {
    const hidden = new Set(loadHidden());
    return catalog.filter((r) => r && r.id && !hidden.has(String(r.id)));
  }

  function updateRestoreLink() {
    if (!restoreLink) return;
    const n = loadHidden().length;
    if (n > 0) {
      restoreLink.hidden = false;
      restoreLink.textContent =
        n === 1
          ? "Restore 1 hidden catalog recipe"
          : "Restore " + n + " hidden catalog recipes";
    } else {
      restoreLink.hidden = true;
    }
  }

  function render(catalog, imports) {
    catalogCache = Array.isArray(catalog) ? catalog : [];
    const shown = visibleCatalog(catalogCache);
    const parts = [];
    shown.forEach((r) => parts.push(cardHtml(r)));
    imports.forEach((r) => {
      if (!isLobsterTitle(r && r.title)) parts.push(importedCardHtml(r));
    });

    if (!parts.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>No recipes yet. Add one in <code>data/recipes.json</code> or paste a caption on the Import page.</p>
        </div>`;
    } else {
      grid.innerHTML = parts.join("");
    }

    if (countEl) {
      const n = shown.length + imports.filter((r) => !isLobsterTitle(r && r.title)).length;
      countEl.textContent = n === 1 ? "1 recipe" : n + " recipes";
    }

    updateRestoreLink();
  }

  function refresh() {
    render(catalogCache, loadImports());
  }

  function handleDelete(btn) {
    const kind = btn.getAttribute("data-delete-kind");
    const id = btn.getAttribute("data-delete-id") || "";
    const title = btn.getAttribute("data-delete-title") || "this recipe";

    if (!window.confirm('Delete "' + title + '" from your shelf?')) return;

    if (kind === "import") {
      const next = loadImports().filter((r) => String(r && r.id) !== String(id));
      saveImports(next);
      refresh();
      return;
    }

    if (kind === "catalog") {
      if (!id) return;
      const hidden = loadHidden();
      if (!hidden.includes(id)) {
        hidden.push(id);
        saveHidden(hidden);
      }
      refresh();
    }
  }

  grid.addEventListener("click", function (e) {
    const btn = e.target.closest(".btn-delete");
    if (!btn || !grid.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    handleDelete(btn);
  });

  if (restoreLink) {
    restoreLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (!loadHidden().length) return;
      if (!window.confirm("Restore all hidden catalog recipes to the shelf?")) return;
      saveHidden([]);
      refresh();
    });
  }

  // Auto-remove lobster mac imports for returning users
  const importsAfterPurge = purgeLobsterImports();

  fetch("data/recipes.json")
    .then((res) => {
      if (!res.ok) throw new Error("Could not load recipes.json");
      return res.json();
    })
    .then((catalog) => {
      const list = Array.isArray(catalog) ? catalog : [];
      render(list, importsAfterPurge);
    })
    .catch((err) => {
      console.warn(err);
      render([], importsAfterPurge);
      if (!importsAfterPurge.length) {
        grid.innerHTML = `
          <div class="empty-state">
            <p>Couldn’t load <code>data/recipes.json</code>. Serve this folder over HTTP (not file://) so fetch works, or check the Import page for local saves.</p>
          </div>`;
      }
    });
})();
