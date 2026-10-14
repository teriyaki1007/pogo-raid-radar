/**
 * Soft client-side password gate (not real auth).
 * Hides page content until sessionStorage has a verified unlock for this app path.
 */
(function () {
  var PASS = "pufferfish1007";
  var parts = location.pathname.split("/").filter(Boolean);
  var appPath = "/" + (parts[0] || "") + "/";
  var KEY = "pw_gate_" + appPath;
  var MARK = "ok";

  if (sessionStorage.getItem(KEY) === MARK) return;

  var style = document.createElement("style");
  style.id = "pw-gate-style";
  style.textContent =
    "html.pw-gated body>*:not(#pw-gate){visibility:hidden!important}" +
    "#pw-gate{visibility:visible!important;position:fixed;inset:0;z-index:2147483647;" +
    "display:flex;align-items:center;justify-content:center;" +
    "background:#0b1020;color:#e8ecf4;font:16px/1.45 system-ui,sans-serif}" +
    "#pw-gate .box{width:min(92vw,360px);padding:1.5rem;border-radius:12px;" +
    "background:#151b2e;border:1px solid #2a3350;box-shadow:0 12px 40px rgba(0,0,0,.45)}" +
    "#pw-gate h1{margin:0 0 .35rem;font-size:1.15rem;font-weight:650}" +
    "#pw-gate p{margin:0 0 1rem;opacity:.75;font-size:.9rem}" +
    "#pw-gate form{display:flex;flex-direction:column;gap:.65rem}" +
    "#pw-gate input{padding:.65rem .75rem;border-radius:8px;border:1px solid #3a4566;" +
    "background:#0b1020;color:#e8ecf4;font:inherit}" +
    "#pw-gate button{padding:.65rem .9rem;border-radius:8px;border:0;" +
    "background:#5b8cff;color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
    "#pw-gate button:hover{filter:brightness(1.08)}" +
    "#pw-gate .err{color:#ff8a8a;font-size:.85rem;min-height:1.2em;margin:0}";
  document.documentElement.classList.add("pw-gated");
  (document.head || document.documentElement).appendChild(style);

  function mount() {
    if (document.getElementById("pw-gate")) return;
    var root = document.createElement("div");
    root.id = "pw-gate";
    root.innerHTML =
      '<div class="box" role="dialog" aria-modal="true" aria-labelledby="pw-gate-title">' +
      '<h1 id="pw-gate-title">Password required</h1>' +
      "<p>Enter the password to continue.</p>" +
      '<form autocomplete="off">' +
      '<label for="pw-gate-input" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Password</label>' +
      '<input id="pw-gate-input" type="password" name="password" autocomplete="current-password" autofocus required />' +
      '<button type="submit">Unlock</button>' +
      '<p class="err" id="pw-gate-err" aria-live="polite"></p>' +
      "</form></div>";
    (document.body || document.documentElement).appendChild(root);

    var form = root.querySelector("form");
    var input = root.querySelector("#pw-gate-input");
    var err = root.querySelector("#pw-gate-err");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (input.value === PASS) {
        sessionStorage.setItem(KEY, MARK);
        document.documentElement.classList.remove("pw-gated");
        style.remove();
        root.remove();
      } else {
        err.textContent = "Incorrect password.";
        input.select();
      }
    });
    try { input.focus(); } catch (_) {}
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
