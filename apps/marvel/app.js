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
  function cardHTML(c) {
    return '<button type="button" class="card" data-id="' + c.id + '" aria-haspopup="dialog" style="--a:' + c.theme.accent + ';--c1:' + c.theme.c1 + ';--c2:' + c.theme.c2 + '">' +
      '<span class="art">' + portrait(c) + '<span class="badge ' + c.alignment + '">' + (c.alignment === 'villain' ? 'Villain' : 'Hero') + '</span></span>' +
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

  function openDetail(id, opener) {
    var c = byId[id]; if (!c) return;
    var fa = c.firstAppearance;
    var html = '<div class="dlg-hero" style="--a:' + c.theme.accent + ';--c1:' + c.theme.c1 + ';--c2:' + c.theme.c2 + '">' +
      '<div class="dlg-art">' + portrait(c) + '</div>' +
      '<div class="dlg-head"><span class="badge inline ' + c.alignment + '">' + (c.alignment === 'villain' ? 'Villain' : 'Hero') + '</span> <span class="badge inline grp">' + GROUP_LABEL[c.group] + '</span>' +
      '<h3 id="dlgTitle">' + esc(c.name) + '</h3><p class="alias">' + esc(c.alias) + '</p><p class="tag">“' + esc(c.tagline) + '”</p></div>' +
      '<button type="button" class="x" data-close data-autofocus aria-label="Close (Esc)">&times;</button></div>' +
      '<div class="dlg-body">' +
      '<dl class="facts"><div><dt>First appearance</dt><dd>' + esc(fa.title) + ' <span class="muted">(' + fa.type + ', ' + fa.year + ')</span></dd></div></dl>' +
      '<p>' + esc(c.description) + '</p>' +
      '<h4>Why they matter to the MCU</h4><p>' + esc(c.importance) + '</p>' +
      '<h4>Power rating <span class="muted">· ' + tier(c.power) + '</span></h4>' +
      '<div class="power" role="meter" aria-valuemin="1" aria-valuemax="100" aria-valuenow="' + c.power + '" aria-label="Power rating"><i style="--w:' + c.power + '%"></i><b>' + c.power + '</b></div>' +
      '<h4>Abilities</h4><ul class="tags">' + c.abilities.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' +
      '<div class="dlg-actions"><button type="button" class="btn primary" data-fight="A">Send to Arena as Fighter A</button><button type="button" class="btn" data-fight="B">as Fighter B</button></div>' +
      '<p class="mini-note">Spoiler-light · ratings are fan-estimated, just for fun.</p></div>';
    openDialog(html, opener);
    $$('[data-fight]', dialog).forEach(function (b) {
      b.addEventListener('click', function () {
        setFighter(b.dataset.fight, id);
        closeDialog(); showTab('arena', true);
      });
    });
  }

  /* ---------- tabs ---------- */
  function showTab(name, focus) {
    ['gallery', 'arena'].forEach(function (n) {
      var on = n === name;
      $('#panel-' + n).hidden = !on;
      var t = $('#tab-' + n); t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
    });
    if (history.replaceState) history.replaceState(null, '', name === 'arena' ? '#arena' : location.pathname + location.search);
    if (name === 'arena') { updateOdds(); renderFighters(); }
    if (focus) window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
  }
  function bindTabs() {
    var tabs = $$('[role=tab]');
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { showTab(t.id.replace('tab-', ''), true); });
      t.addEventListener('keydown', function (e) {
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
        if (j < 0) return; e.preventDefault();
        var n = tabs[(j + tabs.length) % tabs.length]; n.focus(); n.click();
      });
    });
  }

  /* ---------- battle arena ---------- */
  var sel = { A: 'iron-man', B: 'thanos' };
  var tally = { w: 0, l: 0 }, champSide = 'A';
  var running = false, timers = [], plan = null, currentFight = null;

  function fillSelects() {
    var opts = chars.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + ' (' + c.power + ')</option>'; }).join('');
    ['A', 'B'].forEach(function (s) {
      var el = $('#sel' + s); el.innerHTML = opts; el.value = sel[s];
      el.addEventListener('change', function () { if (running) { el.value = sel[s]; return; } sel[s] = el.value; resetStage(); });
    });
  }
  function setFighter(side, id) {
    if (running) return;
    sel[side] = id; $('#sel' + side).value = id; resetStage();
  }
  function renderFighters() {
    ['A', 'B'].forEach(function (s) {
      var c = byId[sel[s]];
      var el = $('#f' + s);
      el.style.setProperty('--a', c.theme.accent);
      el.className = 'fighter' + (champSide === s ? ' champ' : '');
      el.innerHTML = '<button type="button" class="f-card" data-side="' + s + '" aria-pressed="' + (champSide === s) + '" aria-label="' + esc(c.name) + (champSide === s ? ', your champion' : ', tap to make your champion') + '">' +
        '<span class="f-art">' + portrait(c) + '<span class="hit-flash"></span></span><span class="f-name">' + esc(c.name) + '</span></button>' +
        '<div class="hp" role="progressbar" aria-label="' + esc(c.name) + ' health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i><span>100</span></div>' +
        '<div class="dmg-layer"></div>';
    });
    $('#champ').textContent = byId[sel[champSide]].name;
  }
  function updateOdds() {
    var a = byId[sel.A], b = byId[sel.B];
    var p = B.winChance(a.power, b.power), pa = Math.round(p * 1000) / 10, pb = Math.round((1 - p) * 1000) / 10;
    $('#oddsA').innerHTML = '<strong>' + esc(a.name) + '</strong> ' + pa.toFixed(1) + '%';
    $('#oddsB').innerHTML = pb.toFixed(1) + '% <strong>' + esc(b.name) + '</strong>';
    $('#oddsMid').textContent = sel.A === sel.B ? 'mirror match' : a.power + ' vs ' + b.power;
    $('#oddsFillA').style.width = (p * 100) + '%';
    $('#oddsFillB').style.width = ((1 - p) * 100) + '%';
    $('#oddsFillA').style.background = a.theme.c2; $('#oddsFillB').style.background = b.theme.c2;
    $('#oddsBar').setAttribute('aria-label', a.name + ' ' + pa.toFixed(1) + ' percent, ' + b.name + ' ' + pb.toFixed(1) + ' percent');
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function resetStage() {
    clearTimers(); running = false; plan = null;
    $('#stage').className = 'stage';
    $('#banner').hidden = true;
    $('#roundLbl').textContent = 'VS';
    $('#log').textContent = 'Choose your fighters, then press Fight!';
    $('#fight').hidden = false; $('#fight').disabled = false; $('#skip').hidden = true; $('#rematch').hidden = true; $('#again').hidden = true; $('#random').hidden = false;
    $$('.pick-row select, [data-browse]').forEach(function (x) { x.disabled = false; });
    stopConfetti();
    updateOdds(); renderFighters();
  }

  function setHp(side, hp) {
    var el = $('#f' + side + ' .hp');
    el.firstChild.style.width = hp + '%';
    el.lastChild.textContent = Math.round(hp);
    el.setAttribute('aria-valuenow', Math.round(hp));
    el.classList.toggle('low', hp <= 30);
  }

  function startFight() {
    if (running) return;
    var a = byId[sel.A], b = byId[sel.B];
    var side = B.drawWinner(a.power, b.power);               // decided BEFORE animating
    plan = B.planFight(a, b, side);
    currentFight = { a: a, b: b, side: side };
    running = true;
    clearTimers(); stopConfetti();
    renderFighters();
    $('#banner').hidden = true;
    $('#stage').className = 'stage fighting';
    $('#fight').hidden = true; $('#skip').hidden = false; $('#rematch').hidden = true; $('#again').hidden = true; $('#random').hidden = true;
    $$('.pick-row select, [data-browse]').forEach(function (x) { x.disabled = true; });
    $('#fightStatus') && ($('#fightStatus').textContent = '');
    var fast = reduce.matches;
    var t0 = fast ? 250 : 900, step = fast ? 350 : 720;
    $('#log').textContent = a.name + ' vs ' + b.name + '… FIGHT!';
    $('#roundLbl').textContent = 'FIGHT!';
    plan.hits.forEach(function (h, i) {
      later(function () { doHit(h, i); }, t0 + i * step);
    });
    later(function () { finish(); }, t0 + plan.hits.length * step + (fast ? 200 : 700));
  }

  function doHit(h, i) {
    var atk = h.side, def = h.side === 'A' ? 'B' : 'A';
    var stage = $('#stage');
    $('#roundLbl').textContent = 'R' + (i + 1);
    $('#log').textContent = h.text;
    var fa = $('#f' + atk), fd = $('#f' + def);
    if (!reduce.matches) {
      fa.classList.remove('lunge-A', 'lunge-B'); void fa.offsetWidth; fa.classList.add('lunge-' + atk);
      later(function () {
        fd.classList.remove('shake'); void fd.offsetWidth; fd.classList.add('shake');
        stage.classList.remove('quake'); void stage.offsetWidth; if (h.crit || h.last) stage.classList.add('quake');
      }, 160);
    }
    later(function () {
      var fl = $('.hit-flash', fd); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
      setHp(atk === 'A' ? 'B' : 'A', atk === 'A' ? h.hpB : h.hpA);
      var n = document.createElement('span');
      n.className = 'dmg' + (h.crit || h.last ? ' big' : '');
      n.textContent = '-' + h.damage + (h.crit ? '!' : '');
      n.style.left = (30 + Math.random() * 40) + '%';
      $('.dmg-layer', fd).appendChild(n);
      setTimeout(function () { n.remove(); }, 1100);
    }, reduce.matches ? 0 : 170);
  }

  function finish() {
    if (!running) return;
    running = false;
    // enforce final state exactly as planned
    var last = plan.hits[plan.hits.length - 1];
    setHp('A', last.hpA); setHp('B', last.hpB);
    var W = plan.winner, L = plan.loser;
    var wc = currentFight[W === 'A' ? 'a' : 'b'], lc = currentFight[L === 'A' ? 'a' : 'b'];
    $('#f' + W).classList.add('winner'); $('#f' + L).classList.add('loser');
    $('#stage').className = 'stage done';
    $('#roundLbl').textContent = 'K.O.';
    var mine = champSide === W;
    tally[mine ? 'w' : 'l']++;
    $('#tW').textContent = tally.w; $('#tL').textContent = tally.l;
    $('#bKicker').textContent = mine ? 'Your champion wins!' : 'Your champion falls!';
    $('#bName').textContent = wc.name + ' wins';
    var chance = Math.round(plan.pWinner * 100);
    var verdict = sel.A === sel.B ? 'Mirror match: a coin flip.' : plan.winnerFinalHp < 18 ? 'A photo finish!' : plan.winnerFinalHp > 60 ? 'A total stomp.' : 'A solid win.';
    $('#bSub').textContent = verdict + ' ' + wc.name + ' had a ' + chance + '% chance' + (chance < 50 ? ' (upset!)' : '') + ' and ended with ' + plan.winnerFinalHp + ' HP.';
    $('#banner').hidden = false;
    $('#log').textContent = lc.name + ' is down. ' + wc.name + ' stands victorious!';
    $('#skip').hidden = true; $('#rematch').hidden = false; $('#again').hidden = false; $('#random').hidden = false;
    $$('.pick-row select, [data-browse]').forEach(function (x) { x.disabled = false; });
    if (!reduce.matches) startConfetti(wc.theme);
    $('#rematch').focus({ preventScroll: true });
  }

  function skip() {
    if (!running) return;
    clearTimers();
    finish();
  }
  function rematch() {
    resetStage(); startFight();
  }
  function randomPair() {
    if (running) return;
    var a = chars[Math.floor(Math.random() * chars.length)], b;
    do { b = chars[Math.floor(Math.random() * chars.length)]; } while (b === a);
    sel.A = a.id; sel.B = b.id; $('#selA').value = a.id; $('#selB').value = b.id; resetStage();
  }

  function browse(side) {
    var html = '<div class="dlg-hero slim"><div class="dlg-head"><h3 id="dlgTitle">Pick Fighter ' + side + '</h3><p class="alias">Choose a character for the arena</p></div>' +
      '<button type="button" class="x" data-close data-autofocus aria-label="Close (Esc)">&times;</button></div>' +
      '<div class="dlg-body"><div class="pick-grid">' + chars.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) {
        return '<button type="button" class="mini-card" data-id="' + c.id + '" style="--a:' + c.theme.accent + '">' + portrait(c) + '<span>' + esc(c.name) + '</span></button>';
      }).join('') + '</div></div>';
    openDialog(html, document.activeElement);
    $('.pick-grid', dialog).addEventListener('click', function (e) {
      var b = e.target.closest('.mini-card'); if (!b) return;
      setFighter(side, b.dataset.id); closeDialog();
    });
  }

  function bindArena() {
    $('#fight').addEventListener('click', startFight);
    $('#skip').addEventListener('click', skip);
    $('#rematch').addEventListener('click', rematch);
    $('#again').addEventListener('click', function () { resetStage(); $('#selA').focus(); });
    $('#random').addEventListener('click', randomPair);
    $$('[data-browse]').forEach(function (b) { b.addEventListener('click', function () { browse(b.dataset.browse); }); });
    ['A', 'B'].forEach(function (s) {
      $('#sel' + s).addEventListener('change', function () { updateOdds(); });
    });
    $('.fighters').addEventListener('click', function (e) {
      var b = e.target.closest('.f-card'); if (!b || running) return;
      champSide = b.dataset.side; renderFighters();
      $('.f-card[data-side="' + champSide + '"]').focus();
    });
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
  fetch('data/characters.json').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (d) {
    chars = d.characters; chars.forEach(function (c) { byId[c.id] = c; });
    buildControls(); bindTabs(); fillSelects(); bindArena(); renderGrid();
    $('#champ').textContent = byId[sel.A].name;
    if (location.hash === '#arena') showTab('arena'); else { updateOdds(); renderFighters(); }
  }).catch(function (err) {
    $('#grid').innerHTML = '<p class="empty">Could not load character data (' + esc(err.message) + '). Serve this page over http(s), not file://.</p>';
  });
})();
