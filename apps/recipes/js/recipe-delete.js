(function () {
  const HIDDEN_KEY = "recipe-site-hidden-v1";

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
      /* Ignore storage errors (for example, private browsing restrictions). */
    }
  }

  function recipeId(button) {
    return (button && button.getAttribute("data-recipe-id")) ||
      (document.body && document.body.getAttribute("data-recipe-id")) ||
      "";
  }

  const deleteButton =
    document.getElementById("delete-recipe-btn") ||
    document.querySelector(".btn-delete-page");

  if (!deleteButton) return;

  deleteButton.addEventListener("click", function () {
    const id = recipeId(this);
    if (!id) return;

    const title = (document.querySelector("h1") || {}).textContent || "this recipe";
    if (!window.confirm('Delete "' + title.trim() + '" from your shelf?')) return;

    const hidden = loadHidden();
    if (!hidden.includes(String(id))) {
      hidden.push(String(id));
      saveHidden(hidden);
    }

    const inRecipesDirectory = /(?:^|\/)recipes(?:\/|$)/.test(window.location.pathname);
    window.location.href = inRecipesDirectory ? "../index.html" : "index.html";
  });
})();
