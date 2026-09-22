(function () {
  const STORAGE_KEY = "recipe-site-imports-v1";
  const grid = document.getElementById("recipe-grid");
  const countEl = document.getElementById("recipe-count");

  if (!grid) return;

  const ART_ROOT = {
    cucumber: "assets/plating-cucumber.svg",
    salmon: "assets/plating-salmon.svg",
    bowl: "assets/plating-bowl.svg",
  };

  function artSrc(key) {
    return ART_ROOT[key] || ART_ROOT.bowl;
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

  function cardHtml(recipe) {
    const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
    const tagHtml = tags.map((t) => `<li class="tag">${escapeHtml(t)}</li>`).join("");
    const href = recipe.href || "#";
    const title = escapeHtml(recipe.title || "Untitled recipe");
    const blurb = escapeHtml(recipe.blurb || "");
    const art = artSrc(recipe.art || "cucumber");

    return `
      <article class="card">
        <div class="card-art" aria-hidden="true">
          <img src="${art}" alt="" width="280" height="175" />
        </div>
        <div class="card-body">
          <h3><a href="${escapeHtml(href)}">${title}</a></h3>
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
    const detailId = escapeHtml(recipe.id || "");

    return `
      <article class="card" data-import-id="${detailId}">
        <div class="card-art" aria-hidden="true">
          <img src="${art}" alt="" width="280" height="175" />
        </div>
        <div class="card-body">
          <h3>${title}</h3>
          <p class="blurb">${blurb}</p>
          <ul class="tags">${tagHtml}</ul>
          <p class="hint" style="margin:0">Saved in this browser · open Import to manage</p>
        </div>
      </article>
    `;
  }

  function render(catalog, imports) {
    const parts = [];
    catalog.forEach((r) => parts.push(cardHtml(r)));
    imports.forEach((r) => parts.push(importedCardHtml(r)));

    if (!parts.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>No recipes yet. Add one in <code>data/recipes.json</code> or paste a caption on the Import page.</p>
        </div>`;
    } else {
      grid.innerHTML = parts.join("");
    }

    if (countEl) {
      const n = catalog.length + imports.length;
      countEl.textContent = n === 1 ? "1 recipe" : n + " recipes";
    }
  }

  fetch("data/recipes.json")
    .then((res) => {
      if (!res.ok) throw new Error("Could not load recipes.json");
      return res.json();
    })
    .then((catalog) => {
      const list = Array.isArray(catalog) ? catalog : [];
      render(list, loadImports());
    })
    .catch((err) => {
      console.warn(err);
      const imports = loadImports();
      render([], imports);
      if (!imports.length) {
        grid.innerHTML = `
          <div class="empty-state">
            <p>Couldn’t load <code>data/recipes.json</code>. Serve this folder over HTTP (not file://) so fetch works, or check the Import page for local saves.</p>
          </div>`;
      }
    });
})();
