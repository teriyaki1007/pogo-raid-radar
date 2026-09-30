(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var loadingEl = $('loading'), errorEl = $('error');

  function showError(msg) {
    if (msg) $('error-msg').textContent = msg;
    loadingEl.hidden = true; errorEl.hidden = false;
  }
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  if (!hasWebGL()) return showError();
  if (typeof Globe !== 'function') return showError('The globe library failed to load. Please check your connection and reload.');

  // Small places missing from the 110m map: [iso2, name, lat, lng]
  var MICRO = [
    ['HK', 'Hong Kong', 22.32, 114.17], ['MO', 'Macao', 22.2, 113.55], ['SG', 'Singapore', 1.35, 103.82],
    ['MT', 'Malta', 35.9, 14.45], ['BH', 'Bahrain', 26.05, 50.55], ['MV', 'Maldives', 3.2, 73.22],
    ['MU', 'Mauritius', -20.3, 57.58], ['LI', 'Liechtenstein', 47.16, 9.55], ['MC', 'Monaco', 43.74, 7.42],
    ['SM', 'San Marino', 43.94, 12.46], ['AD', 'Andorra', 42.55, 1.6], ['VA', 'Vatican City', 41.9, 12.45],
    ['SC', 'Seychelles', -4.68, 55.49], ['BB', 'Barbados', 13.19, -59.54], ['GD', 'Grenada', 12.12, -61.68],
    ['LC', 'Saint Lucia', 13.91, -60.98], ['TT', 'Trinidad and Tobago', 10.69, -61.22], ['KN', 'Saint Kitts and Nevis', 17.36, -62.78],
    ['AG', 'Antigua and Barbuda', 17.06, -61.8], ['DM', 'Dominica', 15.41, -61.37], ['VC', 'Saint Vincent and the Grenadines', 13.25, -61.2],
    ['KM', 'Comoros', -11.88, 43.87], ['ST', 'São Tomé and Príncipe', 0.19, 6.61], ['CV', 'Cape Verde', 16.0, -24.0],
    ['FJ', 'Fiji', -17.7, 178.0], ['WS', 'Samoa', -13.76, -172.1], ['TO', 'Tonga', -21.18, -175.2],
    ['KI', 'Kiribati', 1.87, -157.4], ['TV', 'Tuvalu', -7.48, 178.68], ['NR', 'Nauru', -0.52, 166.93],
    ['MH', 'Marshall Islands', 7.1, 171.4], ['FM', 'Micronesia', 6.9, 158.2], ['PW', 'Palau', 7.5, 134.6],
    ['PR', 'Puerto Rico', 18.22, -66.59], ['TW', 'Taiwan', 23.7, 121.0], ['PS', 'Palestine', 31.9, 35.2]
  ];

  function flag(iso) {
    if (!/^[A-Za-z]{2}$/.test(iso || '')) return '🏳️';
    return String.fromCodePoint.apply(null, iso.toUpperCase().split('').map(function (c) { return 0x1f1a5 + c.charCodeAt(0); }));
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function safeUrl(u) {
    try { var x = new URL(u, location.href); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null; } catch (e) { return null; }
  }
  var rtf = (typeof Intl !== 'undefined' && Intl.RelativeTimeFormat) ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;
  function relTime(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.round((t - Date.now()) / 1000), a = Math.abs(s);
    var units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (var i = 0; i < units.length; i++) {
      if (a >= units[i][1]) {
        var v = Math.round(s / units[i][1]);
        return rtf ? rtf.format(v, units[i][0]) : Math.abs(v) + ' ' + units[i][0] + '(s) ago';
      }
    }
    return 'just now';
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function fetchJSON(url, opts) {
    return fetch(url, opts || { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  // ---- state ----
  var features = [], byIso = {}, fresh = {}, selectedIso = null, hoverD = null;
  var searchList = [], idleTimer = null, panelOpen = false, reqId = 0;

  // ---- geometry helpers ----
  function featureCenter(f) {
    var g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates, best = null, bestA = -1;
    polys.forEach(function (p) {
      var b = bbox(p[0]), a = (b[2] - b[0]) * (b[3] - b[1]);
      if (a > bestA) { bestA = a; best = b; }
    });
    return { lat: (best[1] + best[3]) / 2, lng: (best[0] + best[2]) / 2, span: Math.max(best[2] - best[0], best[3] - best[1]) };
  }
  function bbox(ring) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ring.forEach(function (c) { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; });
    return [x0, y0, x1, y1];
  }

  // ---- starfield background ----
  function starfield() {
    var c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 1024);
    g.addColorStop(0, '#02040b'); g.addColorStop(1, '#0a1026');
    x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 1400; i++) {
      var r = rnd() * 1.2 + 0.2, a = 0.3 + rnd() * 0.7;
      x.fillStyle = 'rgba(' + (200 + rnd() * 55 | 0) + ',' + (210 + rnd() * 45 | 0) + ',255,' + a + ')';
      x.beginPath(); x.arc(rnd() * 2048, rnd() * 1024, r, 0, 6.283); x.fill();
    }
    return c.toDataURL('image/png');
  }

  // ---- globe ----
  var world;
  try {
    world = Globe({ animateIn: true })($('globe'))
      .backgroundImageUrl(starfield())
      .showAtmosphere(true).atmosphereColor('#5b8cff').atmosphereAltitude(0.18)
      .polygonsTransitionDuration(150)
      .polygonCapColor(capColor)
      .polygonSideColor(function () { return 'rgba(40,60,100,0.15)'; })
      .polygonStrokeColor(function () { return 'rgba(150,180,230,0.45)'; })
      .polygonAltitude(function (d) { return d === hoverD ? 0.03 : (d.properties.ISO_A2 === selectedIso ? 0.02 : 0.006); })
      .polygonLabel(function (d) { return '<div class="tip">' + flag(d.properties.ISO_A2) + ' ' + esc(d.properties.NAME || '') + '</div>'; })
      .onPolygonHover(function (d) {
        hoverD = d || null;
        $('globe').style.cursor = d ? 'pointer' : 'grab';
        refresh();
      })
      .onPolygonClick(function (d) { if (d) openCountry(d.properties.ISO_A2 || '', d.properties.NAME); })
      .pointLat('lat').pointLng('lng')
      .pointColor(function (p) { return fresh[p.iso] ? '#f5c542' : '#7fa4e8'; })
      .pointAltitude(0.03).pointRadius(0.45)
      .pointLabel(function (p) { return '<div class="tip">' + flag(p.iso) + ' ' + esc(p.name) + '</div>'; })
      .onPointClick(function (p) { openCountry(p.iso, p.name); })
      .width(window.innerWidth).height(window.innerHeight);
    var mat = world.globeMaterial();
    mat.color.set('#0b1a3a'); mat.emissive.set('#050c1e'); mat.emissiveIntensity = 0.6; mat.shininess = 8;
    var ctl = world.controls();
    ctl.autoRotate = true; ctl.autoRotateSpeed = 0.35; ctl.enableDamping = true;
    ctl.minDistance = 130; ctl.maxDistance = 500;
    ctl.addEventListener('start', function () { ctl.autoRotate = false; clearTimeout(idleTimer); });
    ctl.addEventListener('end', scheduleResume);
    world.pointOfView({ lat: 22, lng: 105, altitude: 2.4 });
  } catch (e) {
    return showError();
  }
  function scheduleResume() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (!panelOpen) world.controls().autoRotate = true; }, 6000);
  }
  function capColor(d) {
    var iso = d.properties.ISO_A2;
    if (d === hoverD) return 'rgba(255,255,255,0.75)';
    if (iso === selectedIso) return 'rgba(245,197,66,0.85)';
    if (fresh[iso]) return 'rgba(245,197,66,0.38)';
    return 'rgba(70,110,180,0.28)';
  }
  function refresh() {
    world.polygonCapColor(capColor).polygonAltitude(function (d) { return d === hoverD ? 0.03 : (d.properties.ISO_A2 === selectedIso ? 0.02 : 0.006); });
  }
  window.addEventListener('resize', function () { world.width(window.innerWidth).height(window.innerHeight); });

  // ---- panel ----
  var panel = $('panel');
  function closePanel() {
    panelOpen = false; selectedIso = null; reqId++;
    panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true');
    refresh(); scheduleResume();
  }
  $('close').addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('results').hidden) { hideResults(); return; }
      if (panelOpen) closePanel();
    }
  });

  function fly(iso, name) {
    var ctl = world.controls(); ctl.autoRotate = false; clearTimeout(idleTimer);
    var f = byIso[iso], m = MICRO.filter(function (x) { return x[0] === iso; })[0], lat, lng, alt;
    if (f) { var c = featureCenter(f); lat = c.lat; lng = c.lng; alt = Math.min(2.2, Math.max(0.45, c.span / 35 + 0.3)); }
    else if (m) { lat = m[2]; lng = m[3]; alt = 0.35; }
    else return;
    // shift target slightly so the country isn't hidden behind the side panel on wide screens
    world.pointOfView({ lat: lat, lng: lng, altitude: alt }, 1200);
  }

  function setBlock(list, pairs) {
    list.textContent = '';
    pairs.forEach(function (p) { list.appendChild(el('dt', null, p[0])); list.appendChild(el('dd', null, p[1])); });
  }

  function render(iso, name, data, extra) {
    $('flag').textContent = flag(iso);
    $('c-name').textContent = (data && data.name) || name || iso;
    $('badge-sample').hidden = !(data && data.sample === true);
    $('c-updated').textContent = data && data.updatedAt ? 'Updated ' + fmtDate(data.updatedAt) + ' (' + relTime(data.updatedAt) + ')' : '';
    var facts = [];
    if (data && Array.isArray(data.facts)) data.facts.forEach(function (f) { if (f) facts.push([String(f.label), String(f.value)]); });
    if (extra) facts = facts.concat(extra);
    var dl = $('facts');
    if (facts.length) setBlock(dl, facts); else { dl.textContent = ''; dl.appendChild(el('dd', 'muted', 'No facts available.')); }
    var ul = $('headlines'); ul.textContent = '';
    var hs = data && Array.isArray(data.headlines) ? data.headlines.slice() : [];
    hs.sort(function (a, b) { return (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0); });
    if (!hs.length) {
      ul.appendChild(el('li', 'empty', 'No recent updates yet'));
    }
    hs.slice(0, 12).forEach(function (h) {
      var li = el('li'), href = safeUrl(h.url), title = String(h.title || 'Untitled');
      if (href) {
        var a = el('a', null, title); a.href = href; a.target = '_blank'; a.rel = 'noopener'; li.appendChild(a);
      } else li.appendChild(el('span', null, title));
      var meta = el('span', 'meta', [h.source, relTime(h.publishedAt)].filter(Boolean).join(' · '));
      li.appendChild(meta);
      if (h.summary) li.appendChild(el('p', null, String(h.summary)));
      ul.appendChild(li);
    });
    $('c-note').textContent = data && data.sample === true ? 'Sample data for UI testing — not real news.' : '';
  }

  function fmtNum(n) { return typeof n === 'number' ? n.toLocaleString() : ''; }
  function basicFacts(j) {
    var r = Array.isArray(j) ? j[0] : j, out = [];
    if (!r) return out;
    if (r.capital && r.capital.length) out.push(['Capital', r.capital.join(', ')]);
    if (r.region) out.push(['Region', r.region]);
    if (typeof r.population === 'number') out.push(['Population', fmtNum(r.population)]);
    if (typeof r.area === 'number') out.push(['Area', fmtNum(r.area) + ' km²']);
    if (r.languages) out.push(['Languages', Object.keys(r.languages).map(function (k) { return r.languages[k]; }).join(', ')]);
    return out;
  }

  function openCountry(iso, name) {
    iso = (iso || '').toUpperCase();
    selectedIso = iso; panelOpen = true; var my = ++reqId;
    refresh();
    if (iso) fly(iso, name);
    panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); panel.scrollTop = 0;
    hideResults();
    if (!/^[A-Z]{2}$/.test(iso)) { render('', name, null, null); $('c-note').textContent = 'No data for this territory.'; return; }
    render(iso, name, { name: name, headlines: [], facts: [] }, null);
    $('c-updated').textContent = 'Loading…';
    var dataP = fetchJSON('data/countries/' + iso + '.json').then(function (d) { return d && typeof d === 'object' ? d : null; }).catch(function () { return null; });
    dataP.then(function (data) {
      if (my !== reqId) return;
      if (data) { render(iso, name, data, null); return; }
      render(iso, name, { name: name, headlines: [], facts: [] }, null);
      $('c-updated').textContent = '';
      $('c-note').textContent = 'Loading basic facts…';
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
      fetchJSON('https://restcountries.com/v3.1/alpha/' + iso + '?fields=name,capital,population,region,flags,area,languages', { signal: ctrl && ctrl.signal })
        .then(function (j) { if (my !== reqId) return; render(iso, name, { name: name, headlines: [], facts: [] }, basicFacts(j)); $('c-note').textContent = 'Basic facts from restcountries.com'; })
        .catch(function () { if (my !== reqId) return; $('c-note').textContent = 'Basic facts unavailable (offline?).'; })
        .then(function () { clearTimeout(to); });
    });
  }

  // ---- search ----
  var resultsEl = $('results'), searchEl = $('search'), activeIdx = -1, shown = [];
  function hideResults() { resultsEl.hidden = true; activeIdx = -1; }
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function updateResults() {
    var q = norm(searchEl.value.trim());
    resultsEl.textContent = '';
    if (!q) return hideResults();
    shown = searchList.filter(function (c) { return c._n.indexOf(q) !== -1 || c.iso.toLowerCase() === q; })
      .sort(function (a, b) { return (a._n.indexOf(q) === 0 ? 0 : 1) - (b._n.indexOf(q) === 0 ? 0 : 1) || a.name.localeCompare(b.name); }).slice(0, 8);
    if (!shown.length) { var li = el('li', null, 'No matches'); li.style.cursor = 'default'; resultsEl.appendChild(li); resultsEl.hidden = false; return; }
    shown.forEach(function (c, i) {
      var li = el('li'); li.setAttribute('role', 'option');
      li.appendChild(el('span', null, flag(c.iso))); li.appendChild(el('span', null, c.name));
      if (fresh[c.iso]) li.appendChild(el('span', 'dot'));
      li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(c); });
      li.addEventListener('touchend', function (e) { e.preventDefault(); choose(c); });
      resultsEl.appendChild(li);
    });
    activeIdx = 0; markActive(); resultsEl.hidden = false;
  }
  function markActive() { Array.prototype.forEach.call(resultsEl.children, function (li, i) { li.classList.toggle('active', i === activeIdx); }); }
  function choose(c) { searchEl.value = c.name; searchEl.blur(); openCountry(c.iso, c.name); }
  searchEl.addEventListener('input', updateResults);
  searchEl.addEventListener('focus', function () { if (searchEl.value) updateResults(); });
  searchEl.addEventListener('blur', function () { setTimeout(hideResults, 150); });
  searchEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (shown.length) { activeIdx = (activeIdx + 1) % shown.length; markActive(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { activeIdx = (activeIdx - 1 + shown.length) % shown.length; markActive(); } }
    else if (e.key === 'Enter') { if (shown[activeIdx] && !resultsEl.hidden) { e.preventDefault(); choose(shown[activeIdx]); } }
  });

  // ---- load data ----
  Promise.all([
    fetchJSON('vendor/countries.geojson', { cache: 'force-cache' }),
    fetchJSON('data/index.json').catch(function () { return { countries: [] }; })
  ]).then(function (res) {
    var geo = res[0], idx = res[1] || {};
    (idx.countries || []).forEach(function (c) { if (typeof c === 'string') fresh[c.toUpperCase()] = true; });
    features = geo.features.filter(function (f) { return f.properties.ISO_A2 !== 'AQ'; });
    features.forEach(function (f) { if (f.properties.ISO_A2) byIso[f.properties.ISO_A2] = f; });
    var seen = {};
    features.forEach(function (f) { var p = f.properties; if (p.ISO_A2 && !seen[p.ISO_A2]) { seen[p.ISO_A2] = 1; searchList.push({ iso: p.ISO_A2, name: p.NAME }); } });
    var pts = [];
    MICRO.forEach(function (m) {
      if (!seen[m[0]]) { seen[m[0]] = 1; searchList.push({ iso: m[0], name: m[1] }); }
      if (!byIso[m[0]]) pts.push({ iso: m[0], name: m[1], lat: m[2], lng: m[3] });
    });
    // index entries unknown to map/micro list are still searchable by code only
    searchList.forEach(function (c) { c._n = norm(c.name); });
    world.polygonsData(features).pointsData(pts);
    if (idx.updatedAt) $('updated-global').textContent = '· data ' + relTime(idx.updatedAt);
    loadingEl.hidden = true;
    scheduleResume();
  }).catch(function () { showError('Could not load the map data. Please reload the page.'); });
})();
