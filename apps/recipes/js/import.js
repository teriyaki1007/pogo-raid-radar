(function () {
  const STORAGE_KEY = "recipe-site-imports-v1";

  const pasteEl = document.getElementById("paste-input");
  const previewEl = document.getElementById("preview");
  const sourceUrlEl = document.getElementById("source-url");
  const statusEl = document.getElementById("status");
  const parseBtn = document.getElementById("parse-btn");
  const saveBtn = document.getElementById("save-btn");
  const sendStudioBtn = document.getElementById("send-studio-btn");
  const clearBtn = document.getElementById("clear-btn");

  let current = null;

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slugify(title) {
    return (
      String(title || "imported-recipe")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "imported-recipe"
    );
  }

  function looksLikeUrl(line) {
    return /^https?:\/\/\S+/i.test(line.trim());
  }

  function cleanBullet(line) {
    return line.replace(/^[\s]*([•\-–—*·]|(\d+[\.\)]))\s*/, "").trim();
  }

  function isSectionHeader(line) {
    const t = line.trim().toLowerCase().replace(/:$/, "");
    return /^(ingredients?|method|directions?|steps?|instructions?|how to|preparation|tips?)$/.test(
      t
    );
  }

  function sectionKind(line) {
    const t = line.trim().toLowerCase().replace(/:$/, "");
    if (/^ingredients?$/.test(t)) return "ingredients";
    if (/^(method|directions?|steps?|instructions?|how to|preparation)$/.test(t))
      return "method";
    if (/^tips?$/.test(t)) return "tips";
    return null;
  }

  function parseCaption(raw, sourceHint) {
    const text = String(raw || "").replace(/\r\n/g, "\n").trim();
    if (!text) return null;

    const lines = text.split("\n").map((l) => l.trimEnd());
    const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);

    const hintedUrl = String(sourceHint || "").trim();
    let sourceUrl = looksLikeUrl(hintedUrl) ? hintedUrl.split(/\s+/)[0] : "";
    let title = "";
    const ingredients = [];
    const method = [];
    const tips = [];
    let mode = "title";

    for (let i = 0; i < nonEmpty.length; i++) {
      const line = nonEmpty[i];

      if (looksLikeUrl(line)) {
        if (!sourceUrl) sourceUrl = line.split(/\s+/)[0];
        continue;
      }

      if (isSectionHeader(line)) {
        mode = sectionKind(line) || mode;
        continue;
      }

      const inlineIng = line.match(/^ingredients?\s*:\s*(.+)$/i);
      if (inlineIng) {
        mode = "ingredients";
        inlineIng[1]
          .split(/,|·|•/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => ingredients.push(s));
        continue;
      }
      const inlineMethod = line.match(
        /^(method|directions?|steps?|instructions?)\s*:\s*(.+)$/i
      );
      if (inlineMethod) {
        mode = "method";
        method.push(inlineMethod[2].trim());
        continue;
      }

      if (mode === "title" && !title) {
        title = line.replace(/^#+\s*/, "").replace(/^["“]|["”]$/g, "").trim();
        mode = "body";
        continue;
      }

      const bullet = cleanBullet(line);
      const wasBulleted = bullet !== line.trim() || /^[-*•]/.test(line.trim());

      if (mode === "ingredients") {
        ingredients.push(bullet);
      } else if (mode === "method") {
        method.push(bullet);
      } else if (mode === "tips") {
        tips.push(bullet);
      } else {
        if (wasBulleted || (/,/.test(bullet) && bullet.length < 80)) {
          ingredients.push(bullet);
        } else if (
          /^(mix|stir|add|roll|slice|chop|serve|whisk|fold|top|drizzle|assemble|place|cut|wrap)/i.test(
            bullet
          )
        ) {
          method.push(bullet);
          mode = "method";
        } else if (!title) {
          title = bullet;
        } else if (method.length === 0 && ingredients.length < 2) {
          tips.push(bullet);
        } else {
          method.push(bullet);
        }
      }
    }

    if (!title) {
      title = sourceUrl ? "Recipe from link" : "Imported recipe";
    }

    const blurbParts = [];
    if (ingredients.length) blurbParts.push(ingredients.slice(0, 3).join(", "));
    if (sourceUrl) blurbParts.push("From pasted link/caption");
    const blurb = (
      tips[0] ||
      blurbParts.join(" · ") ||
      "Parsed from pasted text (approximate)."
    ).slice(0, 180);

    return {
      id: slugify(title) + "-" + Date.now().toString(36),
      title,
      blurb,
      href: sourceUrl || "",
      sourceUrl: sourceUrl || "",
      tags: ["imported", "approx"],
      art: "bowl",
      ingredients,
      method,
      tips,
      savedAt: new Date().toISOString(),
    };
  }

  function renderPreview(recipe) {
    if (!previewEl) return;
    if (!recipe) {
      previewEl.innerHTML =
        '<div class="preview-empty">Paste recipe text or an optional link, then hit Parse to see a card.</div>';
      return;
    }

    const ing =
      (recipe.ingredients || [])
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("") || "<li><em>None detected</em></li>";
    const steps =
      (recipe.method || [])
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("") || "<li><em>None detected</em></li>";

    previewEl.innerHTML = `
      <article class="card preview-card">
        <div class="card-art" aria-hidden="true">
          <img src="assets/plating-bowl.svg" alt="" width="280" height="175" />
        </div>
        <div class="card-body">
          <h3>${escapeHtml(recipe.title)}</h3>
          <p class="blurb">${escapeHtml(recipe.blurb)}</p>
          <ul class="tags">
            ${(recipe.tags || [])
              .map((t) => `<li class="tag">${escapeHtml(t)}</li>`)
              .join("")}
            <li class="tag tag-imported">Preview</li>
          </ul>
          <div class="preview-sections">
            <h4>Ingredients</h4>
            <ul>${ing}</ul>
            <h4>Method</h4>
            <ul>${steps}</ul>
            ${
              recipe.sourceUrl
                ? `<p class="hint">Source: <a href="${escapeHtml(
                    recipe.sourceUrl
                  )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                    recipe.sourceUrl
                  )}</a></p>`
                : ""
            }
          </div>
        </div>
      </article>
    `;
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveCurrent() {
    if (!current) {
      setStatus("Parse something first, then save.", "err");
      return;
    }
    const all = loadAll();
    all.unshift(current);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      setStatus(
        "Saved to this browser (recipe-site-imports-v1). It will show on the home grid.",
        "ok"
      );
    } catch (e) {
      setStatus(
        "Could not save in this browser: " + (e && e.message ? e.message : "error"),
        "err"
      );
    }
  }

  function doParse() {
    const recipe = parseCaption(
      pasteEl ? pasteEl.value : "",
      sourceUrlEl ? sourceUrlEl.value : ""
    );
    current = recipe;
    renderPreview(recipe);
    if (!recipe) {
      setStatus("Nothing to parse — paste recipe text or add a link first.", "err");
      if (saveBtn) saveBtn.disabled = true;
      return;
    }
    setStatus(
      "Parsed (approximate). Review the card, then Save if it looks right.",
      "ok"
    );
    if (saveBtn) saveBtn.disabled = false;
  }

  async function sendToStudio() {
    const url = sourceUrlEl ? sourceUrlEl.value.trim() : "";
    const caption = pasteEl ? pasteEl.value.trim() : "";

    if (!url && !caption) {
      setStatus("Nothing to send — paste a caption or add a link first.", "err");
      return;
    }

    if (sendStudioBtn) sendStudioBtn.disabled = true;
    setStatus("Sending to Recipe Site Studio…", "ok");

    try {
      const response = await fetch("api/import-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          caption,
          note: "Sent from the Recipe Site Studio Import page.",
        }),
      });

      const raw = await response.text();
      let payload = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (_) {
        payload = {};
      }

      const serverError =
        payload && (payload.error || payload.message)
          ? String(payload.error || payload.message)
          : "";

      if (!response.ok) {
        throw new Error(
          serverError || raw || `HTTP ${response.status}${response.status === 502 ? " (relay unavailable)" : ""}`
        );
      }
      if (!payload || payload.ok !== true) {
        throw new Error(serverError || raw || "Import request was not accepted.");
      }

      setStatus(
        "Sent — Recipe Site Studio will extract this and add it to the shelf.",
        "ok"
      );
    } catch (error) {
      const message = error && error.message ? error.message : "Network error";
      setStatus("Could not send to Recipe Site Studio: " + message, "err");
    } finally {
      if (sendStudioBtn) sendStudioBtn.disabled = false;
    }
  }

  if (parseBtn) parseBtn.addEventListener("click", doParse);
  if (sendStudioBtn) sendStudioBtn.addEventListener("click", sendToStudio);
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.addEventListener("click", saveCurrent);
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (pasteEl) pasteEl.value = "";
      if (sourceUrlEl) sourceUrlEl.value = "";
      current = null;
      renderPreview(null);
      setStatus("");
      if (saveBtn) saveBtn.disabled = true;
    });
  }

  renderPreview(null);
})();
