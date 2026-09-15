(function () {
  const STORAGE_KEY = "ap-csa-checkboxes-v2";

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
  }

  const state = loadState();
  const boxes = document.querySelectorAll('input[type="checkbox"][data-key]');

  boxes.forEach((box) => {
    const key = box.getAttribute("data-key");
    if (state[key]) box.checked = true;
    box.addEventListener("change", () => {
      state[key] = box.checked;
      saveState(state);
    });
  });

  const jot = document.getElementById("jot-template");
  const copyBtn = document.getElementById("copy-jot");
  if (jot && copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = jot.textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(jot);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("copy");
        sel.removeAllRanges();
      }
      copyBtn.textContent = "Copied";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("copied");
      }, 1500);
    });
  }

  /* Smooth-scroll for sticky TOC (respects reduced-motion via CSS/html) */
  document.querySelectorAll('.toc-list a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href").slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", "#" + id);
    });
  });
})();
