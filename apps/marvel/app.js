(function () {
  'use strict';
  var B = window.MarvelBattle;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var chars = [], byId = {};
  var state = { q: '', group: 'all', align: 'all', sort: 'name' };
  var GROUPS = [['all', 'All'], ['avengers', 'Avengers'], ['guardians', 'Guardians'], ['villains', 'Villains'], ['other', 'Street-level / Other']];
  var GROUP_LABEL = { avengers: 'Avengers', guardians: 'Guardians', villains: 'Villains', other: 'Street-level / Other' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function tier(p) { return p >= 90 ? 'Cosmic' : p >= 75 ? 'Elite' : p >= 60 ? 'Heavy hitter' : p >= 50 ? 'Skilled' : 'Scrappy'; }

  /* ---------- original avatar art (inline SVG) ---------- */
  var uid = 0;
  function patternDefs(c, id) {
    var a = c.theme.accent, p = c.pattern;
    var inner;
    switch (p) {
      case 'hex': inner = '<path d="M14 2l12 7v14l-12 7L2 23V9z" fill="none" stroke="' + a + '" stroke-width="1.2"/>'; return [28, 30, inner];
      case 'stripes': inner = '<rect width="8" height="16" fill="' + a + '"/>'; return [16, 16, inner];
      case 'bolt': inner = '<path d="M14 0L4 16h7l-3 14 12-18h-8z" fill="' + a + '"/>'; return [28, 30, inner];
      case 'burst': inner = '<path d="M20 2v36M2 20h36M7 7l26 26M33 7L7 33" stroke="' + a + '" stroke-width="1.5"/>'; return [40, 40, inner];
      case 'diamonds': inner = '<path d="M12 1l11 11-11 11L1 12z" fill="none" stroke="' + a + '" stroke-width="1.4"/>'; return [24, 24, inner];
      case 'chevrons': inner = '<path d="M0 8l12 8 12-8M0 20l12 8 12-8" fill="none" stroke="' + a + '" stroke-width="2"/>'; return [24, 28, inner];
      case 'grid': inner = '<path d="M0 0h20v20H0z" fill="none" stroke="' + a + '" stroke-width="1"/><circle cx="10" cy="10" r="1.6" fill="' + a + '"/>'; return [20, 20, inner];
      case 'dots': inner = '<circle cx="8" cy="8" r="3" fill="' + a + '"/>'; return [16, 16, inner];
      case 'rings': inner = '<circle cx="20" cy="20" r="6" fill="none" stroke="' + a + '" stroke-width="1.4"/><circle cx="20" cy="20" r="13" fill="none" stroke="' + a + '" stroke-width="1"/>'; return [40, 40, inner];
      case 'waves': inner = '<path d="M0 10q10-10 20 0t20 0" fill="none" stroke="' + a + '" stroke-width="1.6"/>'; return [40, 20, inner];
      default: inner = '<circle cx="8" cy="8" r="2" fill="' + a + '"/>'; return [16, 16, inner];
    }
  }
  function emblemPath(e, a) {
    var s = 'fill="none" stroke="' + a + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
    switch (e) {
      case 'star': return '<path d="M50 14l10.6 21.5 23.7 3.4-17.2 16.7 4.1 23.6L50 68l-21.2 11.2 4.1-23.6L15.7 38.9l23.7-3.4z" ' + s + '/>';
      case 'bolt': return '<path d="M56 12L28 54h20l-6 34 30-46H52z" ' + s + '/>';
      case 'hex': return '<path d="M50 12l32 18v38L50 86 18 68V30z" ' + s + '/>';
      case 'diamond': return '<path d="M50 10l34 40-34 40-34-40z" ' + s + '/>';
      case 'triangle': return '<path d="M50 14l38 68H12z" ' + s + '/>';
      case 'shield': return '<path d="M50 12l34 10v26c0 20-14 34-34 42-20-8-34-22-34-42V22z" ' + s + '/>';
      case 'crescent': return '<path d="M66 18a36 36 0 1 0 0 64 28 28 0 1 1 0-64z" ' + s + '/>';
      case 'claw': return '<path d="M26 18c6 22 6 42 0 64M50 12c7 26 7 50 0 76M74 18c6 22 6 42 0 64" ' + s + '/>';
      case 'flame': return '<path d="M50 10c4 16 26 26 26 50a26 26 0 0 1-52 0c0-12 8-18 12-28 4 8 8 10 14-22z" ' + s + '/>';
      default: return '<circle cx="50" cy="50" r="36" ' + s + '/><circle cx="50" cy="50" r="22" ' + s + '/>';
    }
  }
  function portrait(c, cls) {
    var id = 'p' + (++uid);
    var d = patternDefs(c, id);
    var t = c.theme;
    var fs = c.initials.length > 1 ? 44 : 56;
    return '<svg class="portrait ' + (cls || '') + '" viewBox="0 0 100 100" role="img" aria-label="' + esc(c.name) + ' avatar card" preserveAspectRatio="xMidYMid slice">' +
      '<defs><linearGradient id="g' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + t.c1 + '"/><stop offset="1" stop-color="' + t.c2 + '"/></linearGradient>' +
      '<pattern id="pt' + id + '" width="' + d[0] + '" height="' + d[1] + '" patternUnits="userSpaceOnUse" patternTransform="scale(.55) rotate(-12)">' + d[2] + '</pattern>' +
      '<radialGradient id="r' + id + '" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient></defs>' +
      '<rect width="100" height="100" fill="url(#g' + id + ')"/>' +
      '<rect width="100" height="100" fill="url(#pt' + id + ')" opacity=".22"/>' +
      '<rect width="100" height="100" fill="url(#r' + id + ')"/>' +
      '<g class="emb" opacity=".55">' + emblemPath(c.emblem, t.accent) + '</g>' +
      '<text x="50" y="' + (c.initials.length > 1 ? 62 : 66) + '" text-anchor="middle" font-family="Impact, Haettenschweiler, \'Arial Narrow Bold\', sans-serif" font-weight="900" font-size="' + fs + '" fill="#fff" stroke="rgba(0,0,0,.45)" stroke-width="1.2" paint-order="stroke" letter-spacing="1">' + esc(c.initials) + '</text>' +
      '</svg>';
  }

  /* ---------- real photos (actor photos from Wikimedia Commons) with avatar fallback ---------- */
  function art(c, cls, eager) {
    // Prefer Marvel Hub costume art when present; else actor photo; else illustrated avatar.
    var src = c.costumeArt || c.photo;
    if (!src) return portrait(c, cls);
    var pc = c.photoCredit || {};
    var isCostume = !!c.costumeArt;
    var alt = isCostume
      ? (c.name + ' costume art')
      : ('Photo of ' + (pc.actor || 'the actor') + ', who plays ' + c.name);
    return '<img class="photo ' + (cls || '') + (isCostume ? ' costume' : '') + '" src="' + esc(src) + '" alt="' + esc(alt) + '"' +
      ' data-cid="' + esc(c.id) + '" decoding="async"' + (eager ? '' : ' loading="lazy"') + ' draggable="false">';
  }
  // <img> error events do not bubble, so listen in the capture phase and swap in the clean generated avatar.
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG' || !t.classList.contains('photo')) return;
    var c = byId[t.getAttribute('data-cid')];
    if (!c) return;
    var holder = document.createElement('span');
    holder.innerHTML = portrait(c, t.className.replace(/\bphoto\b/, '').trim());
    if (t.parentNode) t.parentNode.replaceChild(holder.firstChild, t);
    $$('[data-credit-for="' + c.id + '"]').forEach(function (n) { n.textContent = 'Photo unavailable; showing an illustrated avatar.'; n.removeAttribute('title'); });
    $$('[data-actor-for="' + c.id + '"]').forEach(function (n) { n.hidden = true; });
    c._photoFailed = true;
  }, true);

  /* ---------- spoiler preference ---------- */
  var SPOIL_KEY = 'marvel.spoilers.default';
  function spoilPref() { try { return localStorage.getItem(SPOIL_KEY) === '1'; } catch (e) { return false; } }
  function setSpoilPref(v) { try { localStorage.setItem(SPOIL_KEY, v ? '1' : '0'); } catch (e) { /* storage blocked: session only */ } }
  function syncSpoilChecks() { $$('[data-spoil-pref]').forEach(function (i) { i.checked = spoilPref(); }); }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches('[data-spoil-pref]')) return;
    setSpoilPref(t.checked); syncSpoilChecks();
    if (t.checked) $$('.spoil.hidden', dialog).forEach(function (b) { setSpoil(b, true); });
  });
  function setSpoil(box, show) {
    box.classList.toggle('hidden', !show);
    var head = $('.spoil-head', box), txt = $('.spoil-text', box);
    head.setAttribute('aria-expanded', show ? 'true' : 'false');
    head.querySelector('small').textContent = show ? 'tap to hide' : 'tap to reveal';
    if (show) txt.removeAttribute('aria-hidden'); else txt.setAttribute('aria-hidden', 'true');
  }

  /* ---------- gallery ---------- */
  function sortFn() {
    if (state.sort === 'power') return function (a, b) { return b.power - a.power || a.name.localeCompare(b.name); };
    if (state.sort === 'year') return function (a, b) { return a.firstAppearance.year - b.firstAppearance.year || a.name.localeCompare(b.name); };
    return function (a, b) { return a.name.localeCompare(b.name); };
  }
  function matches(c) {
    if (state.group !== 'all') {
      if (state.group === 'villains') { if (c.alignment !== 'villain' && c.group !== 'villains') return false; }
      else if (c.group !== state.group) return false;
    }
    if (state.align !== 'all' && c.alignment !== state.align) return false;
    if (state.q) {
      var hay = (c.name + ' ' + c.alias + ' ' + c.abilities.join(' ') + ' ' + c.firstAppearance.title + ' ' + GROUP_LABEL[c.group]).toLowerCase();
      var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) < 0) return false;
    }
    return true;
  }
  function rarityBadge(c) {
    var A = window.MarvelAccounts;
    var r = A ? A.rarityOf(c) : 'common';
    var lab = A ? A.RARITY_LABEL[r] : r;
    return '<span class="badge rarity ' + r + '">' + lab + '</span>';
  }
  function cardHTML(c) {
    return '<button type="button" class="card" data-id="' + c.id + '" aria-haspopup="dialog" style="--a:' + c.theme.accent + ';--c1:' + c.theme.c1 + ';--c2:' + c.theme.c2 + '">' +
      '<span class="art">' + art(c) + '<span class="badge ' + c.alignment + '">' + (c.alignment === 'villain' ? 'Villain' : 'Hero') + '</span>' + rarityBadge(c) + '</span>' +
      '<span class="meta"><strong>' + esc(c.name) + '</strong><span class="al">' + esc(c.alias) + '</span>' +
      '<span class="mini"><i style="width:' + c.power + '%"></i></span><span class="pw">' + c.power + ' · ' + tier(c.power) + '</span></span></button>';
  }
  function renderGrid() {
    var list = chars.filter(matches).sort(sortFn());
    $('#grid').innerHTML = list.map(cardHTML).join('');
    $('#empty').hidden = list.length > 0;
    $('#count').textContent = list.length + ' of ' + chars.length + ' characters';
  }
  function buildControls() {
    $('#chips').innerHTML = GROUPS.map(function (g) {
      return '<button type="button" class="chip" data-g="' + g[0] + '" aria-pressed="' + (g[0] === state.group) + '">' + g[1] + '</button>';
    }).join('');
    $('#chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      state.group = b.dataset.g;
      $$('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      renderGrid();
    });
    $('#align').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.align = b.dataset.v;
      $$('#align button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      renderGrid();
    });
    $('#q').addEventListener('input', function (e) { state.q = e.target.value.trim(); renderGrid(); });
    $('#sort').addEventListener('change', function (e) { state.sort = e.target.value; renderGrid(); });
    $('#grid').addEventListener('click', function (e) {
      var b = e.target.closest('.card'); if (b) openDetail(b.dataset.id, b);
    });
  }

  /* ---------- modal with focus management ---------- */
  var lastFocus = null;
  var overlay = $('#overlay'), dialog = $('#dialog');
  function openDialog(html, opener) {
    lastFocus = opener || document.activeElement;
    dialog.innerHTML = html;
    overlay.hidden = false;
    document.body.classList.add('locked');
    requestAnimationFrame(function () {
      overlay.classList.add('open');
      var f = $('[data-autofocus]', dialog) || dialog;
      f.focus({ preventScroll: true });
    });
    $$('[data-close]', dialog).forEach(function (b) { b.addEventListener('click', closeDialog); });
  }
  function closeDialog() {
    if (overlay.hidden) return;
    overlay.classList.remove('open');
    overlay.hidden = true;
    dialog.innerHTML = '';
    document.body.classList.remove('locked');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeDialog(); });
  document.addEventListener('keydown', function (e) {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (e.key === 'Tab') {
      var f = $$('button, [href], input, select, [tabindex]:not([tabindex="-1"])', dialog).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function creditLine(c) {
    var pc = c.photoCredit;
    if (c.photo && pc) {
      var tip = 'Photo of ' + pc.actor + ' by ' + pc.author + ', ' + pc.license + ', via Wikimedia Commons';
      return '<p class="credit" data-credit-for="' + esc(c.id) + '" title="' + esc(tip) + '">Photo: ' + esc(pc.author) + ' · ' +
        (pc.licenseUrl ? '<a href="' + esc(pc.licenseUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(pc.license) + '</a>' : esc(pc.license)) +
        ' · <a href="' + esc(pc.source) + '" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> · <a href="#credits" data-credits-link>all credits</a></p>';
    }
    return '<p class="credit" data-credit-for="' + esc(c.id) + '">' + esc(c.photoNote || 'Illustrated avatar: no freely licensed photo of the actor is available.') + '</p>';
  }
  function spoilerBlock(c) {
    if (!c.spoilers) return '';
    var show = spoilPref();
    return '<div class="spoil' + (show ? '' : ' hidden') + '">' +
      '<button type="button" class="spoil-head" aria-expanded="' + show + '" aria-controls="spoil-' + esc(c.id) + '"><span>⚠ Spoilers</span><small>' + (show ? 'tap to hide' : 'tap to reveal') + '</small></button>' +
      '<div class="spoil-body"><div class="spoil-text" id="spoil-' + esc(c.id) + '"' + (show ? '' : ' aria-hidden="true"') + '>' +
      '<p>' + esc(c.spoilers) + '</p>' +
      (c.spoilersMore ? '<p class="more-h">Later on</p><p>' + esc(c.spoilersMore) + '</p>' : '') +
      '</div></div>' +
      '<label class="spoil-pref" style="padding:0 .9rem .7rem"><input type="checkbox" data-spoil-pref /> Show spoilers by default</label></div>';
  }
  function openDetail(id, opener) {
    var c = byId[id]; if (!c) return;
    var fa = c.firstAppearance;
    var html = '<div class="dlg-hero" style="--a:' + c.theme.accent + ';--c1:' + c.theme.c1 + ';--c2:' + c.theme.c2 + '">' +
      '<div class="dlg-art">' + art(c, '', true) + '</div>' +
      '<div class="dlg-head"><span class="badge inline ' + c.alignment + '">' + (c.alignment === 'villain' ? 'Villain' : 'Hero') + '</span> <span class="badge inline grp">' + GROUP_LABEL[c.group] + '</span>' +
      '<h3 id="dlgTitle">' + esc(c.name) + '</h3><p class="alias">' + esc(c.alias) + '</p>' + (c.photo && c.photoCredit ? '<p class="cast" data-actor-for="' + esc(c.id) + '">' + esc(c.photoCredit.actor) + ' <span class="muted">as ' + esc(c.name) + '</span></p>' : '') + '<p class="tag">“' + esc(c.tagline) + '”</p></div>' +
      '<button type="button" class="x" data-close data-autofocus aria-label="Close (Esc)">&times;</button></div>' +
      '<div class="dlg-body">' +
      creditLine(c) +
      '<dl class="facts"><div><dt>First appearance</dt><dd>' + esc(fa.title) + ' <span class="muted">(' + fa.type + ', ' + fa.year + ')</span></dd></div></dl>' +
      '<p>' + esc(c.description) + '</p>' +
      '<h4>Why they matter to the MCU</h4><p>' + esc(c.importance) + '</p>' +
      spoilerBlock(c) +
      '<h4>Power rating <span class="muted">· ' + tier(c.power) + ' · ' + (window.MarvelAccounts ? window.MarvelAccounts.RARITY_LABEL[window.MarvelAccounts.rarityOf(c)] : '') + '</span></h4>' +
      '<div class="power" role="meter" aria-valuemin="1" aria-valuemax="100" aria-valuenow="' + c.power + '" aria-label="Power rating"><i style="--w:' + c.power + '%"></i><b>' + c.power + '</b></div>' +
      '<h4>Abilities</h4><ul class="tags">' + c.abilities.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' +
      '<div class="dlg-actions"><button type="button" class="btn primary" data-fight="A">Send to Arena</button></div>' +
      '<p class="mini-note">Spoilers are hidden until you reveal them · ratings are fan-estimated, just for fun.</p></div>';
    openDialog(html, opener);
    syncSpoilChecks();
    $$('.spoil', dialog).forEach(function (box) {
      var reveal = function () { if (box.classList.contains('hidden')) setSpoil(box, true); };
      $('.spoil-head', box).addEventListener('click', function () { setSpoil(box, box.classList.contains('hidden')); });
      $('.spoil-body', box).addEventListener('click', reveal);
    });
    $$('[data-fight]', dialog).forEach(function (b) {
      b.addEventListener('click', function () {
        setFighter(b.dataset.fight, id);
        closeDialog(); showTab('arena', true);
      });
    });
  }

  /* ---------- tabs ---------- */
  function showTab(name, focus) {
    var all = ['gallery', 'collection', 'gacha', 'arena', 'party', 'account', 'credits'];
    all.forEach(function (n) {
      var panel = $('#panel-' + n); if (panel) panel.hidden = n !== name;
      var t = $('#tab-' + n);
      if (t) { t.setAttribute('aria-selected', n === name); t.tabIndex = n === name ? 0 : -1; }
    });
    if (name === 'credits') {
      ['gallery', 'collection', 'gacha', 'arena', 'party'].forEach(function (n) {
        var t = $('#tab-' + n); if (!t) return;
        t.setAttribute('aria-selected', 'false'); t.tabIndex = n === 'gallery' ? 0 : -1;
      });
      renderCredits();
    }
    if (history.replaceState) {
      var hashMap = { arena: '#arena', credits: '#credits', party: '#party', gacha: '#gacha', collection: '#collection', account: '#account' };
      var hash = hashMap[name] || (location.pathname + location.search);
      history.replaceState(null, '', hash);
    }
    if (name === 'arena') { refreshOwnedPickers(); }
    if (name === 'party') { fillPartySelect(); updateOwnGates(); renderParty(); }
    if (name === 'collection') { renderCollection(); }
    if (name === 'gacha') { renderGacha(); }
    if (name === 'account') { renderAccount(); }
    if (focus) window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
  }
  function renderCredits() {
    var withPhoto = chars.filter(function (c) { return c.photo && c.photoCredit; });
    var fb = chars.filter(function (c) { return !(c.photo && c.photoCredit); });
    $('#creditsList').innerHTML = withPhoto.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) {
      var p = c.photoCredit;
      return '<div class="cr"><span class="cr-img">' + art(c) + '</span><p><strong>' + esc(p.actor) + '</strong> as ' + esc(c.name) + '<br>' +
        'Photo by ' + esc(p.author) + ' · ' +
        (p.licenseUrl ? '<a href="' + esc(p.licenseUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(p.license) + '</a>' : esc(p.license)) + '<br>' +
        '<a href="' + esc(p.source) + '" target="_blank" rel="noopener noreferrer">File page on Wikimedia Commons</a></p></div>';
    }).join('');
    $('#creditsFallback').innerHTML = fb.map(function (c) { return '<li><strong>' + esc(c.name) + '</strong>: ' + esc(c.photoNote || 'No freely licensed photo of the actor was found; original illustrated avatar used.') + '</li>'; }).join('');
  }
  function bindTabs() {
    var tabs = $$('[role=tab]');
    $('#creditsLink').addEventListener('click', function (e) { e.preventDefault(); showTab('credits', true); });
    $('#creditsBack').addEventListener('click', function () { showTab('gallery', true); });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-credits-link]');
      if (a) { e.preventDefault(); closeDialog(); showTab('credits', true); }
    });
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { showTab(t.id.replace('tab-', ''), true); });
      t.addEventListener('keydown', function (e) {
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
        if (j < 0) return; e.preventDefault();
        var n = tabs[(j + tabs.length) % tabs.length]; n.focus(); n.click();
      });
    });
  }

  /* ---------- battle arena (turn-based vs AI) ---------- */
  var sel = { A: 'iron-man' };
  var tally = { w: 0, l: 0 };
  var running = false, timers = [];
  var selectsBound = false;
  var arena = null; // { phase, you, foe, player, enemy, turn, log, difficulty }

  /** Characters the current user may pick in Arena / Party (owned only). */
  function ownedChars() {
    if (!window.MarvelAccounts) return chars.slice();
    return window.MarvelAccounts.ownedList(chars).map(function (o) { return o.char; });
  }
  function clampSelToOwned() {
    var list = ownedChars();
    var ids = list.map(function (c) { return c.id; });
    if (!ids.length) return false;
    if (ids.indexOf(sel.A) < 0) sel.A = ids[0];
    return true;
  }
  function ownGateHtml(where) {
    var A = window.MarvelAccounts;
    var logged = A && A.currentUser();
    var lead = logged
      ? 'You need owned characters to fight here. Pull on Gacha to grow your roster.'
      : 'Fighters must be from your collection. Register for a free starter pack, or sign in — then pull on Gacha.';
    return '<div class="own-gate" role="status">' +
      '<p><strong>Owned fighters only</strong> — ' + lead + '</p>' +
      '<p class="own-gate-actions">' +
      (logged ? '' : '<button type="button" class="btn primary" data-goto="account">Account / Register</button>') +
      '<button type="button" class="btn' + (logged ? ' primary' : '') + '" data-goto="gacha">Open Gacha</button>' +
      '<button type="button" class="btn ghost" data-goto="collection">Collection</button>' +
      '</p></div>';
  }
  function updateOwnGates() {
    var list = ownedChars();
    var has = list.length > 0;
    var ag = $('#arenaOwnGate');
    var pg = $('#partyOwnGate');
    if (ag) {
      ag.hidden = has;
      if (!has) ag.innerHTML = ownGateHtml('arena');
    }
    if (pg) {
      pg.hidden = has;
      if (!has) pg.innerHTML = ownGateHtml('party');
    }
    var fight = $('#fight'), random = $('#random');
    var busy = running || (arena && arena.phase === 'fighting');
    if (fight) fight.disabled = !has || busy;
    if (random) random.disabled = !has || busy;
    $$('#panel-arena .pick-row select, #panel-arena [data-browse], #arenaBrowse').forEach(function (x) {
      x.disabled = !has || busy;
    });
    var pc = $('#partyChar'), pb = $('#partyBrowse');
    if (pc) pc.disabled = !has;
    if (pb) pb.disabled = !has;
  }
  function refreshOwnedPickers() {
    fillSelects();
    fillPartySelect();
    updateOwnGates();
    if (ownedChars().length) {
      updateOdds();
      renderFighters();
    }
  }
  function bindOwnGateClicks(root) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-goto]'); if (!b) return;
      showTab(b.dataset.goto, true);
    });
  }

  function typeBadge(c) {
    if (!c || !c.typePrimary) return '';
    var sec = c.typeSecondary ? ' / ' + esc(c.typeSecondary) : '';
    return '<span class="type-pill type-' + esc(c.typePrimary) + '">' + esc(c.typePrimary) + sec + '</span>';
  }

  function fillSelects() {
    var list = ownedChars().slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    clampSelToOwned();
    var opts = list.length
      ? list.map(function (c) {
        var t = c.typePrimary ? ' · ' + c.typePrimary : '';
        return '<option value="' + c.id + '">' + esc(c.name) + ' (' + c.power + t + ')</option>';
      }).join('')
      : '<option value="">No owned fighters</option>';
    var el = $('#selA'); if (!el) return;
    el.innerHTML = opts;
    if (list.length) el.value = sel.A;
    if (!selectsBound) {
      el.addEventListener('change', function () {
        if (running || (arena && arena.phase === 'fighting')) { el.value = sel.A; return; }
        if (!el.value) return;
        sel.A = el.value; resetStage();
      });
      selectsBound = true;
    }
  }
  function setFighter(side, id) {
    if (running || (arena && arena.phase === 'fighting')) return;
    if (side !== 'A') side = 'A';
    if (window.MarvelAccounts && !window.MarvelAccounts.owns(id)) return;
    sel.A = id;
    var el = $('#selA'); if (el) el.value = id;
    resetStage();
  }
  function renderFighters() {
    if (!clampSelToOwned()) {
      ['A', 'B'].forEach(function (s) {
        var el = $('#f' + s);
        if (!el) return;
        el.className = 'fighter';
        el.innerHTML = '<div class="f-card muted"><span class="f-name">—</span></div>';
      });
      var ch = $('#champ'); if (ch) ch.textContent = '—';
      return;
    }
    var a = byId[sel.A];
    var enemy = arena && arena.enemy ? arena.enemy : null;
    var youHp = arena ? arena.you.hp : 100;
    var foeHp = arena ? arena.foe.hp : 100;
    var youSh = arena ? (arena.you.shield || 0) : 0;
    var foeSh = arena ? (arena.foe.shield || 0) : 0;
    var youStun = arena && arena.you.stunned;
    var foeStun = arena && arena.foe.stunned;

    var elA = $('#fA');
    elA.style.setProperty('--a', a.theme.accent);
    elA.className = 'fighter champ' + (arena && arena.phase === 'done' && arena.you.hp <= 0 ? ' loser' : '') +
      (arena && arena.phase === 'done' && arena.you.hp > 0 ? ' winner' : '') +
      (youStun ? ' stunned' : '');
    elA.innerHTML = '<div class="f-card" aria-label="' + esc(a.name) + ', you">' +
      '<span class="f-art">' + art(a, '', true) + '<span class="hit-flash"></span></span>' +
      '<span class="f-name">' + esc(a.name) + '</span>' + typeBadge(a) +
      (youStun ? '<span class="pf-stun">STUN</span>' : '') +
      '</div>' +
      '<div class="hp' + (youHp <= 30 ? ' low' : '') + '" role="progressbar" aria-valuenow="' + youHp + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + youHp + '%"></i><span>' + Math.round(youHp) + '</span></div>' +
      (youSh ? '<div class="shield arena-shield" role="progressbar"><i style="width:' + Math.min(100, (youSh / 45) * 100) + '%"></i><span>Shield ' + youSh + '</span></div>' : '') +
      '<div class="dmg-layer"></div>';

    var elB = $('#fB');
    if (!enemy) {
      elB.style.setProperty('--a', '#666');
      elB.className = 'fighter enemy-hidden';
      elB.innerHTML = '<div class="f-card muted"><span class="f-art f-mystery">?</span><span class="f-name">Mystery foe</span></div>' +
        '<div class="hp" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100"><i style="width:100%"></i><span>?</span></div>';
    } else {
      elB.style.setProperty('--a', enemy.theme.accent);
      elB.className = 'fighter' + (arena && arena.phase === 'done' && arena.foe.hp <= 0 ? ' loser' : '') +
        (arena && arena.phase === 'done' && arena.foe.hp > 0 ? ' winner' : '') +
        (foeStun ? ' stunned' : '');
      elB.innerHTML = '<div class="f-card" aria-label="' + esc(enemy.name) + ', enemy">' +
        '<span class="f-art">' + art(enemy, '', true) + '<span class="hit-flash"></span></span>' +
        '<span class="f-name">' + esc(enemy.name) + '</span>' + typeBadge(enemy) +
        (foeStun ? '<span class="pf-stun">STUN</span>' : '') +
        '</div>' +
        '<div class="hp' + (foeHp <= 30 ? ' low' : '') + '" role="progressbar" aria-valuenow="' + foeHp + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + foeHp + '%"></i><span>' + Math.round(foeHp) + '</span></div>' +
        (foeSh ? '<div class="shield arena-shield" role="progressbar"><i style="width:' + Math.min(100, (foeSh / 45) * 100) + '%"></i><span>Shield ' + foeSh + '</span></div>' : '') +
        '<div class="dmg-layer"></div>';
    }
    $('#champ').textContent = a.name;
    var lab = $('#arenaEnemyLabel');
    if (lab) lab.innerHTML = enemy
      ? (esc(enemy.name) + ' · power ' + enemy.power + ' · ' + typeBadge(enemy))
      : '??? — revealed when you fight';
  }
  function updateOdds() {
    if (!clampSelToOwned()) {
      var oa = $('#oddsA'), ob = $('#oddsB'), om = $('#oddsMid'), th = $('#arenaTypeHint');
      if (oa) oa.textContent = '';
      if (ob) ob.textContent = '';
      if (om) om.textContent = 'own a fighter to begin';
      if (th) th.textContent = 'Owned fighters only.';
      return;
    }
    var a = byId[sel.A];
    var enemy = arena && arena.enemy;
    $('#oddsA').innerHTML = '<strong>' + esc(a.name) + '</strong> ' + a.power + (a.typePrimary ? ' · ' + esc(a.typePrimary) : '');
    if (enemy) {
      var multYou = B.typeMultiplier ? B.typeMultiplier(a.typePrimary, enemy.typePrimary) : 1;
      var multFoe = B.typeMultiplier ? B.typeMultiplier(enemy.typePrimary, a.typePrimary) : 1;
      $('#oddsB').innerHTML = enemy.power + (enemy.typePrimary ? ' · ' + esc(enemy.typePrimary) : '') + ' <strong>' + esc(enemy.name) + '</strong>';
      $('#oddsMid').textContent = 'type ×' + multYou + ' yours / ×' + multFoe + ' theirs';
      var th = $('#arenaTypeHint');
      if (th) {
        var hint = '';
        if (multYou >= 1.4) hint = 'Your type is strong here (×1.5).';
        else if (multYou <= 0.7) hint = 'Your type is weak here (×0.67).';
        else hint = 'Neutral type matchup for you.';
        th.textContent = hint + ' Enemy rolled near your power — not player-chosen.';
      }
    } else {
      $('#oddsB').textContent = '???';
      $('#oddsMid').textContent = 'waiting for fight';
      var th2 = $('#arenaTypeHint');
      if (th2) th2.textContent = 'Fight rolls a random foe near your power. You never pick the opponent.';
    }
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function resetStage() {
    clearTimers(); running = false; arena = null;
    $('#stage').className = 'stage';
    $('#banner').hidden = true;
    $('#roundLbl').textContent = 'VS';
    $('#log').textContent = 'Choose your fighter, then press Fight!';
    var al = $('#arenaLog'); if (al) { al.hidden = true; al.innerHTML = ''; }
    var am = $('#arenaMoves'); if (am) am.hidden = true;
    $('#fight').hidden = false; $('#rematch').hidden = true; $('#again').hidden = true; $('#random').hidden = false;
    stopConfetti();
    updateOdds(); renderFighters();
    updateOwnGates();
  }

  function arenaPushLog(line) {
    if (!arena) return;
    arena.log = (arena.log || []).concat([line]).slice(-16);
    var al = $('#arenaLog');
    if (al) {
      al.hidden = false;
      al.innerHTML = arena.log.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
    }
    $('#log').textContent = line;
  }

  function arenaRenderMoves() {
    var am = $('#arenaMoves');
    var box = $('#arenaAbilities');
    if (!am || !box || !arena || arena.phase !== 'fighting') return;
    var myTurn = arena.turn === 'you' && !running;
    am.hidden = !myTurn;
    if (!myTurn) { box.innerHTML = ''; return; }
    var kit = B.abilityKit(arena.player.abilities);
    box.innerHTML = kit.map(function (a) {
      var tip = a.needsTarget
        ? (a.type === 'pierce' ? 'Pierce — ignores shield' : a.type === 'stun' ? 'Stun — damage + skip their next turn' : 'Attack')
        : (a.type === 'heal' ? 'Heal yourself' : 'Gain shield');
      return '<button type="button" class="ab ab-' + a.type + '" data-ability="' + esc(a.name) + '" title="' + esc(tip) + '">' +
        '<span class="ab-tag">' + esc(a.label) + '</span> ' + esc(a.name) + '</button>';
    }).join('');
  }

  function arenaFinish(youWon) {
    if (!arena || arena.phase === 'done') return;
    arena.phase = 'done';
    running = false;
    clearTimers();
    var am = $('#arenaMoves'); if (am) am.hidden = true;
    $('#stage').className = 'stage done';
    $('#roundLbl').textContent = 'K.O.';
    tally[youWon ? 'w' : 'l']++;
    $('#tW').textContent = tally.w; $('#tL').textContent = tally.l;
    var wc = youWon ? arena.player : arena.enemy;
    var lc = youWon ? arena.enemy : arena.player;
    $('#bKicker').textContent = youWon ? 'Victory!' : 'Defeat';
    $('#bName').textContent = wc.name + ' wins';
    $('#bArt').innerHTML = art(wc, '', true);
    var diff = arena.difficulty || 1;
    $('#bSub').textContent = (youWon ? 'You beat ' : 'Fallen to ') + lc.name +
      ' · difficulty ×' + diff.toFixed(2) +
      ' · ' + (arena.player.typePrimary || '?') + ' vs ' + (arena.enemy.typePrimary || '?');
    $('#banner').hidden = false;
    arenaPushLog(lc.name + ' is down. ' + wc.name + ' stands victorious!');
    $('#fight').hidden = true; $('#rematch').hidden = false; $('#again').hidden = false; $('#random').hidden = false;
    renderFighters();
    updateOwnGates();
    if (!reduce.matches && youWon) startConfetti(wc.theme);
    if (window.MarvelAccounts) {
      var reward = window.MarvelAccounts.grantBattleReward('arena', youWon, { difficulty: diff });
      refreshAcctChip();
      $('#log').textContent = (youWon ? 'Victory!' : 'Defeat.') + ' +' + reward.shards + ' shards, +' + reward.xp + ' XP (diff ×' + diff.toFixed(2) + ')';
    }
    $('#rematch').focus({ preventScroll: true });
  }

  function arenaApplySide(side, abilityName) {
    if (!arena || arena.phase !== 'fighting') return;
    var atkC = side === 'you' ? arena.player : arena.enemy;
    var defC = side === 'you' ? arena.enemy : arena.player;
    var atkS = side === 'you' ? arena.you : arena.foe;
    var defS = side === 'you' ? arena.foe : arena.you;
    var resolved = B.resolveAbility(atkC.abilities, abilityName);
    var result = B.applyAbility(
      { hp: atkS.hp, shield: atkS.shield || 0, power: atkC.power, typePrimary: atkC.typePrimary },
      resolved.needsTarget ? { hp: defS.hp, shield: defS.shield || 0, power: defC.power, stunned: !!defS.stunned, typePrimary: defC.typePrimary } : null,
      resolved
    );
    atkS.hp = result.atkHp;
    atkS.shield = result.atkShield;
    if (resolved.needsTarget) {
      defS.hp = result.defHp;
      defS.shield = result.defShield;
      defS.stunned = !!result.defStunned;
    }
    var line = B.formatAbilityLine(atkC.name, resolved.needsTarget ? defC.name : atkC.name, result);
    arenaPushLog(line);
    renderFighters();
    updateOdds();

    if (arena.you.hp <= 0 || arena.foe.hp <= 0) {
      arenaFinish(arena.you.hp > 0);
      return true;
    }
    return false;
  }

  function arenaAdvanceTurn() {
    if (!arena || arena.phase !== 'fighting') return;
    // Flip turn; skip if stunned
    var next = arena.turn === 'you' ? 'cpu' : 'you';
    var st = next === 'you' ? arena.you : arena.foe;
    var c = next === 'you' ? arena.player : arena.enemy;
    if (st.stunned) {
      st.stunned = false;
      arenaPushLog((c.name) + ' is stunned and skips a turn!');
      arena.turn = next;
      renderFighters();
      // skip to the following turn
      later(function () { arenaAdvanceTurn(); }, reduce.matches ? 200 : 550);
      return;
    }
    arena.turn = next;
    $('#roundLbl').textContent = next === 'you' ? 'YOU' : 'CPU';
    renderFighters();
    if (next === 'you') {
      running = false;
      arenaRenderMoves();
      $('#log').textContent = 'Your turn — pick an ability.';
    } else {
      running = true;
      arenaRenderMoves();
      $('#log').textContent = arena.enemy.name + ' is thinking…';
      later(arenaCpuTurn, reduce.matches ? 280 : 700);
    }
  }

  function arenaCpuTurn() {
    if (!arena || arena.phase !== 'fighting' || arena.turn !== 'cpu') return;
    var kit = B.abilityKit(arena.enemy.abilities);
    var pick = B.cpuPickAbility(kit, arena.foe, arena.you);
    var done = arenaApplySide('cpu', pick && pick.name);
    if (done) return;
    later(arenaAdvanceTurn, reduce.matches ? 220 : 500);
  }

  function startFight() {
    if (running || (arena && arena.phase === 'fighting')) return;
    if (!clampSelToOwned()) {
      updateOwnGates();
      var log = $('#log'); if (log) log.textContent = 'Own some fighters first — register or pull on Gacha.';
      return;
    }
    var player = byId[sel.A];
    var enemy = B.pickArenaEnemy(player, chars);
    if (!enemy) {
      $('#log').textContent = 'Could not roll an enemy. Try again.';
      return;
    }
    var difficulty = (+enemy.power || 1) / Math.max(1, +player.power || 1);
    difficulty = Math.max(0.6, Math.min(1.85, difficulty));
    arena = {
      phase: 'fighting',
      player: player,
      enemy: enemy,
      you: { hp: 100, shield: 0, stunned: false },
      foe: { hp: 100, shield: 0, stunned: false },
      turn: 'you',
      log: [],
      difficulty: difficulty
    };
    clearTimers(); stopConfetti();
    $('#banner').hidden = true;
    $('#stage').className = 'stage fighting';
    $('#fight').hidden = true; $('#rematch').hidden = true; $('#again').hidden = true; $('#random').hidden = true;
    updateOwnGates();
    var order = B.initiativeOrder([
      { id: 'you', power: player.power },
      { id: 'cpu', power: enemy.power }
    ]);
    arena.turn = order[0] === 'you' ? 'you' : 'cpu';
    arenaPushLog('Fight! ' + player.name + ' vs ' + enemy.name + ' (' + (player.typePrimary || '?') + ' vs ' + (enemy.typePrimary || '?') + ')');
    arenaPushLog('Enemy difficulty ×' + difficulty.toFixed(2) + '. Initiative: ' + (arena.turn === 'you' ? 'you' : enemy.name) + '.');
    updateOdds();
    renderFighters();
    if (arena.turn === 'you') {
      running = false;
      arenaRenderMoves();
      $('#roundLbl').textContent = 'YOU';
      $('#log').textContent = 'Your turn — pick an ability.';
    } else {
      running = true;
      arenaRenderMoves();
      $('#roundLbl').textContent = 'CPU';
      $('#log').textContent = enemy.name + ' moves first…';
      later(arenaCpuTurn, reduce.matches ? 300 : 800);
    }
  }

  function rematch() {
    resetStage();
    // keep same owned fighter, new random enemy
    startFight();
  }
  function randomPair() {
    if (running || (arena && arena.phase === 'fighting')) return;
    var list = ownedChars();
    if (!list.length) { updateOwnGates(); return; }
    var a = list[Math.floor(Math.random() * list.length)];
    sel.A = a.id; $('#selA').value = a.id; resetStage();
  }

  function browse(side) {
    var list = ownedChars().slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!list.length) {
      var emptyHtml = '<div class="dlg-hero slim"><div class="dlg-head"><h3 id="dlgTitle">No owned fighters</h3><p class="alias">Arena uses your collection only</p></div>' +
        '<button type="button" class="x" data-close data-autofocus aria-label="Close (Esc)">&times;</button></div>' +
        '<div class="dlg-body">' + ownGateHtml('arena') + '</div>';
      openDialog(emptyHtml, document.activeElement);
      bindOwnGateClicks($('.dlg-body', dialog));
      return;
    }
    var html = '<div class="dlg-hero slim"><div class="dlg-head"><h3 id="dlgTitle">Pick your fighter</h3><p class="alias">Owned only · enemy is random</p></div>' +
      '<button type="button" class="x" data-close data-autofocus aria-label="Close (Esc)">&times;</button></div>' +
      '<div class="dlg-body"><div class="pick-grid">' + list.map(function (c) {
        return '<button type="button" class="mini-card" data-id="' + c.id + '" style="--a:' + c.theme.accent + '">' + art(c) + '<span>' + esc(c.name) + '</span>' +
          (c.typePrimary ? '<small class="muted">' + esc(c.typePrimary) + '</small>' : '') + '</button>';
      }).join('') + '</div></div>';
    openDialog(html, document.activeElement);
    $('.pick-grid', dialog).addEventListener('click', function (e) {
      var b = e.target.closest('.mini-card'); if (!b) return;
      setFighter('A', b.dataset.id); closeDialog();
    });
  }

  function bindArena() {
    $('#fight').addEventListener('click', startFight);
    $('#rematch').addEventListener('click', rematch);
    $('#again').addEventListener('click', function () { resetStage(); $('#selA').focus(); });
    $('#random').addEventListener('click', randomPair);
    var br = $('#arenaBrowse') || $('[data-browse="A"]');
    if (br) br.addEventListener('click', function () { browse('A'); });
    var abox = $('#arenaAbilities');
    if (abox) {
      abox.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ability]');
        if (!b || !arena || arena.phase !== 'fighting' || arena.turn !== 'you' || running) return;
        running = true;
        arenaRenderMoves();
        var done = arenaApplySide('you', b.dataset.ability);
        if (done) return;
        later(arenaAdvanceTurn, reduce.matches ? 220 : 480);
      });
    }
  }


  /* ---------- party battle (PeerJS) ---------- */
  var party = null;
  var partyTargetId = null;
  var partyReadyOn = false;

  function partyNameVal() {
    var n = ($('#partyName') && $('#partyName').value || '').trim();
    return n || 'Player';
  }
  function fillPartySelect() {
    var el = $('#partyChar'); if (!el) return;
    var list = ownedChars().slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var prev = el.value;
    var opts = list.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + ' (' + c.power + ')</option>';
    }).join('');
    el.innerHTML = '<option value="">Choose…</option>' + opts;
    if (prev && list.some(function (c) { return c.id === prev; })) el.value = prev;
  }
  function ensureParty(cb) {
    if (typeof window.Peer !== 'function') {
      $('#partyStatus').textContent = 'Loading multiplayer library…';
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload = function () { cb(); };
      s.onerror = function () {
        $('#partyStatus').textContent = 'Could not load PeerJS. Check your network and retry.';
      };
      document.head.appendChild(s);
      return;
    }
    cb();
  }
  function makeSession() {
    if (party) { try { party.destroy(); } catch (e) {} party = null; }
    party = new window.MarvelParty.PartySession({
      byId: byId,
      playerName: partyNameVal(),
      onState: function () { renderParty(); },
      onLog: function (m) { $('#partyStatus').textContent = m; },
      onError: function (err) {
        var msg = (err && err.message) ? err.message : String(err);
        $('#partyStatus').textContent = msg;
      }
    });
    return party;
  }
  function renderParty() {
    var setup = $('#partySetup'), room = $('#partyRoom');
    if (!setup) return;
    if (!party || !party.state) {
      setup.hidden = false; room.hidden = true;
      return;
    }
    setup.hidden = true; room.hidden = false;
    var st = party.state;
    $('#partyCodeOut').textContent = st.code || party.code || '----';
    var isHost = party.isHost;
    $('#partyStart').hidden = !isHost || st.phase !== 'lobby';
    $('#partyRematch').hidden = !(isHost && st.phase === 'done');
    $('#partyLobby').hidden = st.phase !== 'lobby';
    $('#partyFight').hidden = st.phase === 'lobby';

    if (st.phase === 'lobby') {
      $('#partyPlayers').innerHTML = st.players.map(function (p) {
        var c = p.charId && byId[p.charId];
        var you = p.id === party.localId;
        return '<li>' +
          '<span class="p-art">' + (c ? art(c) : '<span class="muted">?</span>') + '</span>' +
          '<span class="p-meta"><strong>' + esc(p.name) + (you ? ' (you)' : '') + (p.id === st.hostId ? ' · host' : '') + '</strong>' +
          '<span>' + (c ? esc(c.name) + ' · ' + c.power : 'picking…') + '</span></span>' +
          '<span class="pill-ready' + (p.ready ? ' on' : '') + '">' + (p.ready ? 'Ready' : 'Wait') + '</span></li>';
      }).join('');
      var me = st.players.filter(function (p) { return p.id === party.localId; })[0];
      if (me && me.charId) $('#partyChar').value = me.charId;
      partyReadyOn = !!(me && me.ready);
      $('#partyReady').textContent = partyReadyOn ? 'Unready' : 'Ready';
      $('#partyReady').disabled = !(me && me.charId);
    }

    if (st.phase === 'fighting' || st.phase === 'done') {
      var turnId = party.currentTurnId && party.currentTurnId();
      var turnP = turnId && st.players.filter(function (p) { return p.id === turnId; })[0];
      var turnC = turnP && byId[turnP.charId];
      if (st.phase === 'done') {
        var w = st.players.filter(function (p) { return p.id === st.winnerId; })[0];
        var wc = w && byId[w.charId];
        $('#partyTurn').textContent = wc ? (wc.name + ' wins!') : 'Battle over';
        if (window.MarvelAccounts) {
          var battleId = (st.code || '') + ':' + (st.winnerId || '') + ':' + (st.log && st.log.length);
          var iWon = st.winnerId === party.localId;
          var pr = window.MarvelAccounts.grantPartyOnce(battleId, iWon);
          if (!pr.skipped) {
            refreshAcctChip();
            $('#partyStatus').textContent = (iWon ? 'Victory' : 'Defeat') + ' — +' + pr.shards + ' shards, +' + pr.xp + ' XP';
          }
        }
      } else {
        $('#partyTurn').textContent = turnC ? ('Turn: ' + turnC.name + (turnP.id === party.localId ? ' — your move!' : ' (' + turnP.name + ')')) : 'Fight!';
      }
      $('#partyFighters').innerHTML = st.players.map(function (p) {
        var c = byId[p.charId]; if (!c) return '';
        var dead = p.hp <= 0;
        var sh = Math.max(0, +p.shield || 0);
        var stunned = !!p.stunned;
        return '<div class="pf' + (p.id === turnId && st.phase === 'fighting' ? ' turn' : '') + (dead ? ' dead' : '') + (stunned ? ' stunned' : '') + '" style="--a:' + c.theme.accent + '">' +
          '<div class="pf-art">' + art(c) + '</div>' +
          '<div class="pf-name">' + esc(c.name) + (stunned ? ' <span class="pf-stun">STUN</span>' : '') + '</div>' +
          '<div class="pf-player">' + esc(p.name) + '</div>' +
          '<div class="hp' + (p.hp <= 30 ? ' low' : '') + '" role="progressbar" aria-valuenow="' + p.hp + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + p.hp + '%"></i><span>' + p.hp + '</span></div>' +
          (sh ? '<div class="shield" role="progressbar" aria-valuenow="' + sh + '" aria-valuemin="0" aria-valuemax="45"><i style="width:' + Math.min(100, (sh / 45) * 100) + '%"></i><span>Shield ' + sh + '</span></div>' : '') +
          '</div>';
      }).join('');
      $('#partyLog').innerHTML = (st.log || []).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');

      var myTurn = st.phase === 'fighting' && turnId === party.localId;
      $('#partyMoves').hidden = !myTurn;
      if (myTurn) {
        var me2 = st.players.filter(function (p) { return p.id === party.localId; })[0];
        var mc = me2 && byId[me2.charId];
        var foes = st.players.filter(function (p) { return p.id !== party.localId && p.hp > 0; });
        var kit = (window.MarvelBattle && window.MarvelBattle.abilityKit)
          ? window.MarvelBattle.abilityKit(mc && mc.abilities)
          : (mc && mc.abilities ? mc.abilities : ['Strike']).map(function (a) {
            return { name: a, type: 'damage', label: 'ATK', needsTarget: true };
          });
        if (!partyTargetId || !foes.some(function (f) { return f.id === partyTargetId; })) {
          partyTargetId = foes[0] ? foes[0].id : null;
        }
        var showTargets = foes.length > 1;
        $('#partyTargetLbl').hidden = !showTargets;
        $('#partyTargets').innerHTML = !showTargets ? '' : foes.map(function (f) {
          var fc = byId[f.charId];
          return '<button type="button" data-target="' + f.id + '" aria-pressed="' + (f.id === partyTargetId) + '">' + esc(fc ? fc.name : f.name) + '</button>';
        }).join('');
        $('#partyAbilities').innerHTML = kit.map(function (a) {
          var tip = a.needsTarget
            ? (a.type === 'pierce' ? 'Pierce — ignores shield' : a.type === 'stun' ? 'Stun — damage + skip their next turn' : 'Attack')
            : (a.type === 'heal' ? 'Heal yourself' : 'Gain shield');
          return '<button type="button" class="ab ab-' + a.type + '" data-ability="' + esc(a.name) + '" data-needs-target="' + (a.needsTarget ? '1' : '0') + '" title="' + esc(tip) + '">' +
            '<span class="ab-tag">' + esc(a.label) + '</span> ' + esc(a.name) + '</button>';
        }).join('');
        var moveHint = $('#partyMoveHint');
        if (moveHint) {
          moveHint.textContent = 'Pick an ability — ATK / PIERCE / STUN need a target; HEAL / SHIELD are self.';
        }
      }
    }
  }

  function bindParty() {
    fillPartySelect();
    try {
      var saved = localStorage.getItem('marvel.partyName');
      if (saved && $('#partyName')) $('#partyName').value = saved;
    } catch (e) {}
    $('#partyName').addEventListener('change', function () {
      try { localStorage.setItem('marvel.partyName', partyNameVal()); } catch (e) {}
    });
    $('#partyHost').addEventListener('click', function () {
      ensureParty(function () {
        $('#partyStatus').textContent = 'Creating room…';
        makeSession().host(function (err, code) {
          if (err) return;
          $('#partyStatus').textContent = 'Room ready — share code ' + code;
          renderParty();
        });
      });
    });
    function doPartyJoin() {
      ensureParty(function () {
        var code = window.MarvelParty.normalizeCode($('#partyCodeIn').value);
        if (!code || code.length < 4) {
          $('#partyStatus').textContent = 'Enter the 4-character party code from the host.';
          return;
        }
        $('#partyStatus').textContent = 'Joining ' + code + '…';
        makeSession().join(code, function (err) {
          if (err) return;
          renderParty();
        });
      });
    }
    $('#partyJoin').addEventListener('click', doPartyJoin);
    $('#partyCodeIn').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doPartyJoin(); }
    });
    $('#partyCopy').addEventListener('click', function () {
      var c = $('#partyCodeOut').textContent;
      if (navigator.clipboard && c) navigator.clipboard.writeText(c).then(function () {
        $('#partyStatus').textContent = 'Copied ' + c;
      }).catch(function () { $('#partyStatus').textContent = 'Code: ' + c; });
    });
    $('#partyLeave').addEventListener('click', function () {
      if (party) { try { party.destroy(); } catch (e) {} party = null; }
      partyReadyOn = false; partyTargetId = null;
      $('#partyStatus').textContent = 'Left the room.';
      renderParty();
      $('#partySetup').hidden = false; $('#partyRoom').hidden = true;
    });
    $('#partyChar').addEventListener('change', function () {
      if (!party) return;
      var id = $('#partyChar').value;
      if (!id) return;
      if (window.MarvelAccounts && !window.MarvelAccounts.owns(id)) {
        updateOwnGates();
        fillPartySelect();
        return;
      }
      party.pickCharacter(id);
    });
    $('#partyBrowse').addEventListener('click', function () {
      var list = ownedChars().slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
      if (!list.length) {
        var emptyHtml = '<div class="dlg-hero slim"><div class="dlg-head"><h3 id="dlgTitle">No owned fighters</h3><p class="alias">Party uses your collection only</p></div>' +
          '<button type="button" class="x" data-close data-autofocus aria-label="Close (Esc)">&times;</button></div>' +
          '<div class="dlg-body">' + ownGateHtml('party') + '</div>';
        openDialog(emptyHtml, document.activeElement);
        bindOwnGateClicks($('.dlg-body', dialog));
        return;
      }
      var html = '<div class="dlg-hero slim"><div class="dlg-head"><h3 id="dlgTitle">Pick your fighter</h3><p class="alias">Owned characters only</p></div>' +
        '<button type="button" class="x" data-close data-autofocus aria-label="Close (Esc)">&times;</button></div>' +
        '<div class="dlg-body"><div class="pick-grid">' + list.map(function (c) {
          return '<button type="button" class="mini-card" data-id="' + c.id + '" style="--a:' + c.theme.accent + '">' + art(c) + '<span>' + esc(c.name) + '</span></button>';
        }).join('') + '</div></div>';
      openDialog(html, document.activeElement);
      $('.pick-grid', dialog).addEventListener('click', function (e) {
        var b = e.target.closest('.mini-card'); if (!b) return;
        $('#partyChar').value = b.dataset.id;
        if (party) party.pickCharacter(b.dataset.id);
        closeDialog();
      });
    });
    $('#partyReady').addEventListener('click', function () {
      if (!party) return;
      partyReadyOn = !partyReadyOn;
      party.setReady(partyReadyOn);
    });
    $('#partyStart').addEventListener('click', function () { if (party) party.requestStart(); });
    $('#partyRematch').addEventListener('click', function () { if (party) party.requestRematch(); });
    $('#partyTargets').addEventListener('click', function (e) {
      var b = e.target.closest('[data-target]'); if (!b) return;
      partyTargetId = b.dataset.target;
      $$('#partyTargets [data-target]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    });
    $('#partyAbilities').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ability]'); if (!b || !party) return;
      party.submitMove(b.dataset.ability, partyTargetId);
    });
  }



  /* ---------- accounts / gacha / collection ---------- */
  function refreshAcctChip() {
    var A = window.MarvelAccounts; if (!A) return;
    var u = A.currentUser();
    var p = A.progress();
    var lvl = A.levelFromXp(p.xp);
    var who = u || 'Guest';
    var el = $('#acctSummary');
    if (el) el.textContent = who + ' · ' + p.shards + ' shards · Lv ' + lvl;
    var w = $('#gachaWallet');
    if (w) w.innerHTML = '<strong>' + p.shards + '</strong> shards · <strong>' + p.xp + '</strong> XP (Lv ' + lvl + ')' +
      (u ? '' : ' · <span class="muted">playing as Guest — register to keep progress</span>');
  }
  function renderAccount() {
    var A = window.MarvelAccounts; if (!A) return;
    var u = A.currentUser();
    var out = $('#acctLoggedOut'), inn = $('#acctLoggedIn');
    if (u) {
      out.hidden = true; inn.hidden = false;
      $('#acctName').textContent = u;
      var p = A.progress();
      $('#acctShards').textContent = p.shards;
      $('#acctXp').textContent = p.xp + ' / Lv ' + A.levelFromXp(p.xp);
      $('#acctOwned').textContent = Object.keys(p.owned).length;
      $('#acctPulls').textContent = p.pullCount;
    } else {
      out.hidden = false; inn.hidden = true;
    }
    refreshAcctChip();
  }
  function renderCollection() {
    var A = window.MarvelAccounts; if (!A) return;
    var list = A.ownedList(chars).sort(function (a, b) {
      return b.char.power - a.char.power || a.char.name.localeCompare(b.char.name);
    });
    var p = A.progress();
    $('#collectionStats').textContent = list.length + ' owned · ' + p.shards + ' shards · ' + p.pullCount + ' pulls';
    $('#collectionGrid').innerHTML = list.map(function (o) {
      var c = o.char;
      return '<button type="button" class="card owned" data-id="' + c.id + '" aria-haspopup="dialog" style="--a:' + c.theme.accent + ';--c1:' + c.theme.c1 + ';--c2:' + c.theme.c2 + '">' +
        '<span class="art">' + art(c) + rarityBadge(c) +
        (o.count > 1 ? '<span class="badge count">×' + o.count + '</span>' : '') + '</span>' +
        '<span class="meta"><strong>' + esc(c.name) + '</strong><span class="al">' + esc(c.alias) + '</span>' +
        '<span class="pw">' + c.power + ' · ' + tier(c.power) + '</span></span></button>';
    }).join('');
    $('#collectionEmpty').hidden = list.length > 0;
  }
  function renderGacha() {
    var A = window.MarvelAccounts; if (!A) return;
    $('#gachaRates').innerHTML = A.RARITY_ORDER.map(function (r) {
      return '<span class="rate-pill ' + r + '"><b>' + A.RARITY_LABEL[r] + '</b> ' + Math.round(A.RATES[r] * 100) + '%</span>';
    }).join('');
    refreshAcctChip();
  }
  function showPullResults(res) {
    var A = window.MarvelAccounts;
    if (!res.ok) {
      $('#gachaResults').innerHTML = '<p class="empty">' + esc(res.error || 'Pull failed') + '</p>';
      return;
    }
    $('#gachaResults').innerHTML = '<div class="pull-grid">' + res.results.map(function (r) {
      if (!r.ok) return '';
      var c = byId[r.id];
      return '<div class="pull-card ' + r.rarity + '">' +
        '<div class="pull-art">' + (c ? art(c, '', true) : '') + '</div>' +
        '<span class="badge rarity ' + r.rarity + '">' + A.RARITY_LABEL[r.rarity] + '</span>' +
        '<strong>' + esc(r.name) + '</strong>' +
        '<span class="muted">' + r.power + (r.duplicate ? ' · dup +' + r.shardBack + ' shards' : ' · NEW') + '</span></div>';
    }).join('') + '</div>';
    refreshAcctChip();
  }
  function bindAccount() {
    var A = window.MarvelAccounts; if (!A) return;
    $('#acctOpen').addEventListener('click', function () { showTab('account', true); });
    $('#formRegister').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      $('#acctMsg').textContent = 'Creating…';
      A.register(fd.get('user'), fd.get('pass')).then(function () {
        $('#acctMsg').textContent = 'Welcome! Starter pack unlocked.';
        e.target.reset();
        renderAccount(); refreshAcctChip(); refreshOwnedPickers();
      }).catch(function (err) { $('#acctMsg').textContent = err.message || String(err); });
    });
    $('#formLogin').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      $('#acctMsg').textContent = 'Signing in…';
      A.login(fd.get('user'), fd.get('pass')).then(function () {
        $('#acctMsg').textContent = 'Signed in.';
        e.target.reset();
        renderAccount(); refreshAcctChip(); refreshOwnedPickers();
      }).catch(function (err) { $('#acctMsg').textContent = err.message || String(err); });
    });
    $('#acctLogout').addEventListener('click', function () {
      A.logout(); renderAccount(); refreshAcctChip(); refreshOwnedPickers();
      $('#acctMsg').textContent = 'Signed out. Guest progress is separate.';
    });
    $('#collectionGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.card'); if (b) openDetail(b.dataset.id, b);
    });
    $('#gachaPull1').addEventListener('click', function () {
      showPullResults(A.doPull(chars, 1));
      refreshOwnedPickers();
    });
    $('#gachaPull10').addEventListener('click', function () {
      showPullResults(A.doPull(chars, 10));
      refreshOwnedPickers();
    });
    refreshAcctChip();
  }

  /* ---------- confetti (canvas, no deps) ---------- */
  var cv = $('#confetti'), cx = cv.getContext('2d'), parts = [], raf = 0;
  function sizeCv() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  window.addEventListener('resize', sizeCv); sizeCv();
  function startConfetti(theme) {
    stopConfetti();
    var colors = [theme.c2, theme.accent, '#ffffff', '#f5c542', '#e23636', '#4aa8ff'];
    var n = Math.min(160, Math.round(window.innerWidth / 6));
    for (var i = 0; i < n; i++) parts.push({
      x: window.innerWidth / 2 + (Math.random() - .5) * 120, y: window.innerHeight * .45,
      vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, g: .28 + Math.random() * .12,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
      c: colors[i % colors.length], life: 0
    });
    cv.classList.add('on');
    (function loop() {
      cx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(function (p) {
        p.vy += p.g; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
        cx.globalAlpha = Math.max(0, 1 - p.life / 170); cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
      });
      parts = parts.filter(function (p) { return p.life < 170 && p.y < cv.height + 20; });
      if (parts.length) raf = requestAnimationFrame(loop); else stopConfetti();
    })();
  }
  function stopConfetti() { cancelAnimationFrame(raf); parts = []; cx.clearRect(0, 0, cv.width, cv.height); cv.classList.remove('on'); }

  /* ---------- init ---------- */
  fetch('data/characters.json?v=20261014portraits229').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (d) {
    chars = d.characters; chars.forEach(function (c) { byId[c.id] = c; });
    function boot() {
      buildControls(); bindTabs(); fillSelects(); bindArena(); bindParty(); bindAccount();
      bindOwnGateClicks($('#arenaOwnGate')); bindOwnGateClicks($('#partyOwnGate'));
      renderGrid(); refreshOwnedPickers();
      syncSpoilChecks(); refreshAcctChip();
      if (location.hash === '#credits') showTab('credits');
      else if (location.hash === '#arena') showTab('arena');
      else if (location.hash === '#party') showTab('party');
      else if (location.hash === '#gacha') showTab('gacha');
      else if (location.hash === '#collection') showTab('collection');
      else if (location.hash === '#account') showTab('account');
      else { updateOdds(); renderFighters(); updateOwnGates(); }
    }
    var ids = chars.map(function (c) { return c.id; });
    if (window.MarvelAccounts && window.MarvelAccounts.ensureSeedAccount) {
      window.MarvelAccounts.ensureSeedAccount(ids).then(boot).catch(function (err) {
        console.warn('Seed account setup failed', err);
        boot();
      });
    } else {
      boot();
    }
  }).catch(function (err) {
    $('#grid').innerHTML = '<p class="empty">Could not load character data (' + esc(err.message) + '). Serve this page over http(s), not file://.</p>';
  });
})();
