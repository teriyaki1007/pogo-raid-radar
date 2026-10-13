/* Marvel Hub accounts, progress, and gacha (localStorage today; CF D1 optional later). */
(function (root) {
  'use strict';

  var ACC_KEY = 'marvel.accounts.v1';
  var SESS_KEY = 'marvel.session.v1';
  var PROG_PREFIX = 'marvel.progress.v1.';
  var RATES = { common: 0.55, uncommon: 0.28, rare: 0.12, epic: 0.04, legendary: 0.01 };
  var RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  var RARITY_LABEL = {
    common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary'
  };
  var PULL_COST = 100;
  var MULTI_COST = 900;
  var DUP_SHARDS = { common: 8, uncommon: 15, rare: 30, epic: 60, legendary: 120 };
  var STARTER_SHARDS = 300;
  var STARTER_OWNED = ['hawkeye', 'black-widow', 'happy-hogan', 'falcon', 'ant-man'];

  function nowIso() { return new Date().toISOString(); }

  function loadAccounts() {
    try {
      var raw = localStorage.getItem(ACC_KEY);
      if (!raw) return { users: {} };
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || !o.users) return { users: {} };
      return o;
    } catch (e) { return { users: {} }; }
  }
  function saveAccounts(a) {
    try { localStorage.setItem(ACC_KEY, JSON.stringify(a)); } catch (e) { /* quota */ }
  }

  function sessionUser() {
    try { return localStorage.getItem(SESS_KEY) || ''; } catch (e) { return ''; }
  }
  function setSession(u) {
    try {
      if (u) localStorage.setItem(SESS_KEY, u);
      else localStorage.removeItem(SESS_KEY);
    } catch (e) { /* */ }
  }

  function progKey(user) { return PROG_PREFIX + (user || '__guest__'); }

  function defaultProgress() {
    return {
      shards: 0,
      xp: 0,
      owned: {},
      pullCount: 0,
      battles: { arenaW: 0, arenaL: 0, partyW: 0, partyL: 0 },
      lastPartyRewardId: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function loadProgress(user) {
    try {
      var raw = localStorage.getItem(progKey(user));
      if (!raw) return defaultProgress();
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return defaultProgress();
      p.shards = +p.shards || 0;
      p.xp = +p.xp || 0;
      p.owned = p.owned && typeof p.owned === 'object' ? p.owned : {};
      p.pullCount = +p.pullCount || 0;
      p.battles = p.battles || { arenaW: 0, arenaL: 0, partyW: 0, partyL: 0 };
      return p;
    } catch (e) { return defaultProgress(); }
  }
  function saveProgress(user, p) {
    p.updatedAt = nowIso();
    try { localStorage.setItem(progKey(user), JSON.stringify(p)); } catch (e) { /* */ }
  }

  function bufToHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }
  function randomSalt() {
    var a = new Uint8Array(16);
    (root.crypto || window.crypto).getRandomValues(a);
    return bufToHex(a);
  }
  function hashPassword(password, salt) {
    var enc = new TextEncoder();
    var data = enc.encode(salt + '\n' + password);
    return root.crypto.subtle.digest('SHA-256', data).then(bufToHex);
  }

  function normalizeUser(u) {
    return String(u || '').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '').slice(0, 24);
  }

  function register(username, password) {
    username = normalizeUser(username);
    password = String(password || '');
    if (username.length < 3) return Promise.reject(new Error('Username needs at least 3 letters/numbers.'));
    if (password.length < 4) return Promise.reject(new Error('Password needs at least 4 characters.'));
    var acc = loadAccounts();
    if (acc.users[username]) return Promise.reject(new Error('That username is taken.'));
    var salt = randomSalt();
    return hashPassword(password, salt).then(function (hash) {
      acc.users[username] = { salt: salt, hash: hash, createdAt: nowIso() };
      saveAccounts(acc);
      var p = defaultProgress();
      p.shards = STARTER_SHARDS;
      STARTER_OWNED.forEach(function (id) { p.owned[id] = (p.owned[id] || 0) + 1; });
      // Migrate guest progress shards/owned if any
      var guest = loadProgress('__guest__');
      if (guest.shards > 0 || Object.keys(guest.owned).length) {
        p.shards += guest.shards;
        p.xp += guest.xp;
        Object.keys(guest.owned).forEach(function (id) {
          p.owned[id] = (p.owned[id] || 0) + guest.owned[id];
        });
        try { localStorage.removeItem(progKey('__guest__')); } catch (e) { /* */ }
      }
      saveProgress(username, p);
      setSession(username);
      return { username: username, progress: p };
    });
  }

  function login(username, password) {
    username = normalizeUser(username);
    password = String(password || '');
    var acc = loadAccounts();
    var u = acc.users[username];
    if (!u) return Promise.reject(new Error('Unknown username.'));
    return hashPassword(password, u.salt).then(function (hash) {
      if (hash !== u.hash) throw new Error('Wrong password.');
      setSession(username);
      return { username: username, progress: loadProgress(username) };
    });
  }

  function logout() { setSession(''); }

  function currentUser() { return sessionUser(); }

  function progress() {
    var u = sessionUser();
    return loadProgress(u || '__guest__');
  }

  function saveCurrent(p) {
    var u = sessionUser();
    saveProgress(u || '__guest__', p);
  }

  function rarityOf(c) {
    if (!c) return 'common';
    if (c.rarity) return c.rarity;
    var p = +c.power || 0;
    if (p <= 55) return 'common';
    if (p <= 70) return 'uncommon';
    if (p <= 82) return 'rare';
    if (p <= 92) return 'epic';
    return 'legendary';
  }

  function levelFromXp(xp) {
    return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  }

  function grantBattleReward(kind, won) {
    // kind: 'arena' | 'party'
    var p = progress();
    var shards, xp;
    if (kind === 'party') {
      if (won) { shards = 20; xp = 35; p.battles.partyW = (p.battles.partyW || 0) + 1; }
      else { shards = 8; xp = 12; p.battles.partyL = (p.battles.partyL || 0) + 1; }
    } else {
      if (won) { shards = 12; xp = 20; p.battles.arenaW = (p.battles.arenaW || 0) + 1; }
      else { shards = 5; xp = 8; p.battles.arenaL = (p.battles.arenaL || 0) + 1; }
    }
    p.shards += shards;
    p.xp += xp;
    saveCurrent(p);
    return { shards: shards, xp: xp, progress: p };
  }

  /** Deduplicate party rewards when state re-renders on 'done'. */
  function grantPartyOnce(battleId, won) {
    var p = progress();
    if (battleId && p.lastPartyRewardId === battleId) {
      return { shards: 0, xp: 0, progress: p, skipped: true };
    }
    var r = grantBattleReward('party', won);
    r.progress.lastPartyRewardId = battleId || null;
    saveCurrent(r.progress);
    r.skipped = false;
    return r;
  }

  function poolByRarity(chars) {
    var pools = { common: [], uncommon: [], rare: [], epic: [], legendary: [] };
    (chars || []).forEach(function (c) {
      var r = rarityOf(c);
      if (pools[r]) pools[r].push(c);
    });
    return pools;
  }

  function rollRarity(rng) {
    rng = rng || Math.random;
    var r = rng();
    var acc = 0;
    for (var i = 0; i < RARITY_ORDER.length; i++) {
      var k = RARITY_ORDER[i];
      acc += RATES[k];
      if (r < acc) return k;
    }
    return 'common';
  }

  function pickFromPool(pool, rng) {
    if (!pool || !pool.length) return null;
    return pool[Math.floor((rng || Math.random)() * pool.length)];
  }

  function doPull(chars, count) {
    count = count || 1;
    var cost = count >= 10 ? MULTI_COST : PULL_COST * count;
    var p = progress();
    if (p.shards < cost) {
      return { ok: false, error: 'Need ' + cost + ' shards (you have ' + p.shards + ').', progress: p };
    }
    var pools = poolByRarity(chars);
    // Fallback: if a band is empty, step down
    function resolveBand(band) {
      var idx = RARITY_ORDER.indexOf(band);
      for (var i = idx; i >= 0; i--) {
        if (pools[RARITY_ORDER[i]] && pools[RARITY_ORDER[i]].length) return RARITY_ORDER[i];
      }
      for (var j = 0; j < RARITY_ORDER.length; j++) {
        if (pools[RARITY_ORDER[j]] && pools[RARITY_ORDER[j]].length) return RARITY_ORDER[j];
      }
      return null;
    }
    var results = [];
    var refund = 0;
    p.shards -= cost;
    for (var n = 0; n < count; n++) {
      var band = resolveBand(rollRarity());
      var c = band ? pickFromPool(pools[band]) : null;
      if (!c) {
        refund += Math.floor(cost / count);
        results.push({ ok: false, error: 'Empty pool' });
        continue;
      }
      var ownedBefore = p.owned[c.id] || 0;
      var dup = ownedBefore > 0;
      p.owned[c.id] = ownedBefore + 1;
      p.pullCount += 1;
      var shardBack = 0;
      if (dup) {
        shardBack = DUP_SHARDS[rarityOf(c)] || 10;
        p.shards += shardBack;
      }
      results.push({
        ok: true,
        id: c.id,
        name: c.name,
        rarity: rarityOf(c),
        power: c.power,
        duplicate: dup,
        shardBack: shardBack
      });
    }
    if (refund) p.shards += refund;
    saveCurrent(p);
    return { ok: true, cost: cost, results: results, progress: p };
  }

  function owns(id) {
    var p = progress();
    return !!(p.owned && p.owned[id]);
  }

  function ownedList(chars) {
    var p = progress();
    return (chars || []).filter(function (c) { return p.owned[c.id]; })
      .map(function (c) { return { char: c, count: p.owned[c.id] }; });
  }

  root.MarvelAccounts = {
    RATES: RATES,
    RARITY_ORDER: RARITY_ORDER,
    RARITY_LABEL: RARITY_LABEL,
    PULL_COST: PULL_COST,
    MULTI_COST: MULTI_COST,
    STARTER_SHARDS: STARTER_SHARDS,
    register: register,
    login: login,
    logout: logout,
    currentUser: currentUser,
    progress: progress,
    saveCurrent: saveCurrent,
    rarityOf: rarityOf,
    levelFromXp: levelFromXp,
    grantBattleReward: grantBattleReward,
    grantPartyOnce: grantPartyOnce,
    doPull: doPull,
    owns: owns,
    ownedList: ownedList,
    normalizeUser: normalizeUser,
    DUP_SHARDS: DUP_SHARDS
  };
})(typeof self !== 'undefined' ? self : this);
