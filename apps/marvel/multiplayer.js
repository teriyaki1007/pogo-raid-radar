/* Party-code multiplayer (PeerJS). Host-authoritative Bo5 lineups + brackets. */
(function (root) {
  'use strict';
  var B = root.MarvelBattle;
  var CODE_ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var PEER_PREFIX = 'mhv1';
  var LINEUP_SIZE = 5;
  var SERIES_WINS = 3; // best of 5

  function genCode() {
    var s = '';
    for (var i = 0; i < 4; i++) s += CODE_ALPH[Math.floor(Math.random() * CODE_ALPH.length)];
    return s;
  }
  function peerIdFor(code) { return PEER_PREFIX + String(code || '').toUpperCase(); }
  function normalizeCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }
  function uid() { return 'p' + Math.random().toString(36).slice(2, 10); }
  function emptyLineup() { return [null, null, null, null, null]; }
  function lineupFull(lineup) {
    if (!lineup || lineup.length < LINEUP_SIZE) return false;
    for (var i = 0; i < LINEUP_SIZE; i++) if (!lineup[i]) return false;
    return true;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function PartySession(opts) {
    this.byId = opts.byId || {};
    this.onState = opts.onState || function () {};
    this.onLog = opts.onLog || function () {};
    this.onError = opts.onError || function () {};
    this.playerName = (opts.playerName || 'Player').slice(0, 18);
    this.localId = uid();
    this.isHost = false;
    this.code = '';
    this.peer = null;
    this.conns = {};
    this.hostConn = null;
    this.state = null;
  }

  PartySession.prototype._emit = function () {
    this.onState(this.state && JSON.parse(JSON.stringify(this.state)));
  };
  PartySession.prototype._log = function (m) { this.onLog(m); };

  PartySession.prototype._emptyLobby = function (code) {
    return {
      phase: 'lobby', // lobby | fighting | done
      code: code,
      hostId: this.localId,
      players: [{
        id: this.localId,
        name: this.playerName,
        lineup: emptyLineup(),
        ready: false,
        connected: true
      }],
      mode: null, // series | tournament
      bracket: null,
      match: null,
      championId: null,
      log: []
    };
  };

  PartySession.prototype._mkPlayer = function (id, name, peerKey) {
    return {
      id: id,
      name: String(name || 'Player').slice(0, 18),
      lineup: emptyLineup(),
      ready: false,
      connected: true,
      _peer: peerKey || null
    };
  };

  PartySession.prototype._friendlyError = function (err) {
    var type = (err && err.type) ? String(err.type) : '';
    var raw = String((err && err.message) || err || '');
    var low = (type + ' ' + raw).toLowerCase();
    if (/peer-unavailable|could not connect to peer/i.test(low)) {
      return new Error('No open room for that code. Host may have left or refreshed — ask them to Create room again and share the new code. Keep both tabs open.');
    }
    if (/negotiation-failed|could not negotiate|ice|webrtc/i.test(low)) {
      return new Error('Could not link devices (network blocked direct play). Try: same Wi-Fi, disable VPN/adblock, both keep the tab open, or host creates a fresh code.');
    }
    if (/network|socket|server-error|disconnected|ssl/i.test(low)) {
      return new Error('Lobby server hiccup. Check internet, wait a few seconds, then Create/Join again. Adblock can block PeerJS — try allowing unpkg.com / 0.peerjs.com.');
    }
    if (/browser-incompatible/i.test(low)) {
      return new Error('This browser cannot do party battles. Try Chrome, Edge, or Firefox on the latest version.');
    }
    if (/unavailable-id|taken/i.test(low)) {
      return new Error('Room code was busy — creating another…');
    }
    if (err instanceof Error) return err;
    return new Error(raw || 'Party connection failed.');
  };

  PartySession.prototype._peerOpts = function () {
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          {
            urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
            username: 'peerjs',
            credential: 'peerjsp'
          }
        ],
        sdpSemantics: 'unified-plan'
      }
    };
  };

  PartySession.prototype._mkPeer = function (id, cb) {
    if (typeof root.Peer !== 'function') {
      cb(new Error('PeerJS failed to load. Check your network / disable adblock for this site.'));
      return;
    }
    var self = this;
    var opts = this._peerOpts();
    var peer = id ? new root.Peer(id, opts) : new root.Peer(opts);
    var done = false;
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      try { peer.destroy(); } catch (e) {}
      cb(new Error('Could not reach the free PeerJS lobby (0.peerjs.com). Check internet, disable VPN/adblock, then retry.'));
    }, 18000);
    peer.on('open', function (openId) {
      if (done) return;
      done = true;
      clearTimeout(t);
      cb(null, peer, openId);
    });
    peer.on('error', function (err) {
      if (done) return;
      done = true;
      clearTimeout(t);
      cb(self._friendlyError(err));
    });
  };

  PartySession.prototype.host = function (cb) {
    var self = this;
    var attempts = 0;
    function tryOnce() {
      attempts++;
      var code = genCode();
      var pid = peerIdFor(code);
      self._mkPeer(pid, function (err, peer) {
        if (err) {
          if (attempts < 5 && /taken|unavailable|Error/i.test(String(err.type || err.message || err))) {
            tryOnce();
            return;
          }
          self.onError(err);
          if (cb) cb(err);
          return;
        }
        self.isHost = true;
        self.code = code;
        self.peer = peer;
        self.state = self._emptyLobby(code);
        self._bindHost(peer);
        self._log('Room created. Share code ' + code);
        self._emit();
        if (cb) cb(null, code);
      });
    }
    tryOnce();
  };

  PartySession.prototype._bindHost = function (peer) {
    var self = this;
    peer.on('connection', function (conn) {
      conn.on('open', function () {
        self.conns[conn.peer] = conn;
        self._wireConn(conn);
        self._send(conn, { type: 'hello', youMayJoin: true });
      });
      conn.on('close', function () { self._onGuestGone(conn.peer); });
      conn.on('error', function (err) {
        self._log('Guest link failed — they may need to rejoin.');
        self._onGuestGone(conn.peer);
        if (err) self.onError(self._friendlyError(err));
      });
    });
    peer.on('disconnected', function () {
      self._log('Lobby dropped — trying to reconnect…');
      try { peer.reconnect(); } catch (e) {}
    });
    peer.on('error', function (err) { self.onError(self._friendlyError(err)); });
  };

  PartySession.prototype._onGuestGone = function (peerKey) {
    delete this.conns[peerKey];
    if (!this.state) return;
    var changed = false;
    (this.state.players || []).forEach(function (p) {
      if (p._peer === peerKey) { p.connected = false; changed = true; }
    });
    if (changed) {
      this._log('A player disconnected.');
      this._broadcastState();
    }
  };

  PartySession.prototype.join = function (code, cb) {
    var self = this;
    code = normalizeCode(code);
    if (code.length < 4) {
      var e = new Error('Enter the 4-character party code.');
      self.onError(e);
      if (cb) cb(e);
      return;
    }
    var attempts = 0;
    function attempt() {
      attempts++;
      self._mkPeer(null, function (err, peer) {
        if (err) { self.onError(err); if (cb) cb(err); return; }
        self.isHost = false;
        self.code = code;
        self.peer = peer;
        var target = peerIdFor(code);
        var conn = peer.connect(target, { reliable: true });
        var opened = false;
        var finished = false;
        function fail(errObj) {
          if (finished || opened) return;
          finished = true;
          clearTimeout(timer);
          var friendly = self._friendlyError(errObj);
          if (attempts < 2 && /negotiate|network|timeout|webrtc|ice/i.test(String(friendly.message))) {
            self._log('Link failed — retrying once…');
            try { peer.destroy(); } catch (e) {}
            setTimeout(attempt, 800);
            return;
          }
          try { peer.destroy(); } catch (e) {}
          self.peer = null;
          self.onError(friendly);
          if (cb) cb(friendly);
        }
        var timer = setTimeout(function () {
          fail(new Error('No room found for code ' + code + '. Check the code (4 chars), keep the host tab open, or ask them to Create room again and share a new code.'));
        }, 20000);
        conn.on('open', function () {
          if (finished) return;
          opened = true;
          finished = true;
          clearTimeout(timer);
          self.hostConn = conn;
          self._wireConn(conn);
          self._send(conn, {
            type: 'join',
            player: { id: self.localId, name: self.playerName }
          });
          self._log('Joined room ' + code);
          if (cb) cb(null, code);
        });
        conn.on('error', function (err) { fail(err); });
        conn.on('close', function () {
          if (!opened) {
            fail(new Error('peer-unavailable'));
            return;
          }
          self._log('Disconnected from host. Ask them to recreate the room if needed.');
          if (self.state) { self.state.phase = 'disconnected'; self._emit(); }
        });
        peer.on('error', function (err) { fail(err); });
      });
    }
    attempt();
  };

  PartySession.prototype._wireConn = function (conn) {
    var self = this;
    conn.on('data', function (msg) {
      try { self._onMsg(msg, conn); } catch (e) { self.onError(e); }
    });
  };
  PartySession.prototype._send = function (conn, msg) {
    if (conn && conn.open) conn.send(msg);
  };
  PartySession.prototype._broadcast = function (msg, exceptPeer) {
    var self = this;
    Object.keys(self.conns).forEach(function (k) {
      if (k === exceptPeer) return;
      self._send(self.conns[k], msg);
    });
  };
  PartySession.prototype._broadcastState = function () {
    this._emit();
    this._broadcast({ type: 'state', state: this.state });
  };
  PartySession.prototype._onMsg = function (msg, conn) {
    if (!msg || !msg.type) return;
    if (this.isHost) this._hostHandle(msg, conn);
    else this._guestHandle(msg);
  };

  PartySession.prototype._hostHandle = function (msg, conn) {
    var st = this.state;
    if (!st) return;
    if (msg.type === 'join') {
      if (st.phase !== 'lobby') {
        this._send(conn, { type: 'err', message: 'Match already started.' });
        return;
      }
      if (st.players.length >= 8) {
        this._send(conn, { type: 'err', message: 'Room is full (max 8).' });
        return;
      }
      var p = msg.player;
      if (!p || !p.id) return;
      if (st.players.some(function (x) { return x.id === p.id; })) {
        this._broadcastState();
        return;
      }
      st.players.push(this._mkPlayer(p.id, p.name, conn.peer));
      this._log((p.name || 'Player') + ' joined.');
      this._broadcastState();
      return;
    }
    if (msg.type === 'lineup') {
      this._setLineup(msg.playerId, msg.lineup);
      return;
    }
    if (msg.type === 'ready') {
      this._setReady(msg.playerId, !!msg.ready);
      return;
    }
    if (msg.type === 'start') {
      if (msg.playerId === st.hostId) this.startBattle();
      return;
    }
    if (msg.type === 'move') {
      this._applyMove(msg.playerId, msg.ability, msg.targetId);
      return;
    }
    if (msg.type === 'rematch') {
      if (msg.playerId === st.hostId) this.rematch();
    }
  };

  PartySession.prototype._guestHandle = function (msg) {
    if (msg.type === 'state') {
      this.state = msg.state;
      this._emit();
      return;
    }
    if (msg.type === 'err') {
      this.onError(new Error(msg.message || 'Host error'));
    }
  };

  PartySession.prototype._player = function (id) {
    if (!this.state) return null;
    for (var i = 0; i < this.state.players.length; i++) {
      if (this.state.players[i].id === id) return this.state.players[i];
    }
    return null;
  };

  PartySession.prototype.setLineupSlot = function (slot, charId) {
    slot = +slot;
    if (slot < 0 || slot >= LINEUP_SIZE) return;
    var lineup;
    if (this.isHost) {
      var me = this._player(this.localId);
      if (!me) return;
      lineup = (me.lineup || emptyLineup()).slice();
      lineup[slot] = charId || null;
      this._setLineup(this.localId, lineup);
    } else if (this.hostConn) {
      var cur = this.state && this._player(this.localId);
      lineup = (cur && cur.lineup ? cur.lineup.slice() : emptyLineup());
      lineup[slot] = charId || null;
      this._send(this.hostConn, { type: 'lineup', playerId: this.localId, lineup: lineup });
    }
  };

  PartySession.prototype.setReady = function (ready) {
    if (this.isHost) this._setReady(this.localId, ready);
    else if (this.hostConn) this._send(this.hostConn, { type: 'ready', playerId: this.localId, ready: !!ready });
  };

  PartySession.prototype._setLineup = function (playerId, lineup) {
    if (!this.isHost || !this.state || this.state.phase !== 'lobby') return;
    var p = this._player(playerId);
    if (!p) return;
    var next = emptyLineup();
    var seen = {};
    for (var i = 0; i < LINEUP_SIZE; i++) {
      var id = lineup && lineup[i] ? String(lineup[i]) : null;
      if (id && this.byId[id] && !seen[id]) {
        next[i] = id;
        seen[id] = true;
      }
    }
    p.lineup = next;
    p.ready = false;
    this._broadcastState();
  };

  PartySession.prototype._setReady = function (playerId, ready) {
    if (!this.isHost || !this.state || this.state.phase !== 'lobby') return;
    var p = this._player(playerId);
    if (!p || !lineupFull(p.lineup)) return;
    p.ready = !!ready;
    this._broadcastState();
  };

  PartySession.prototype.requestStart = function () {
    if (this.isHost) this.startBattle();
    else if (this.hostConn) this._send(this.hostConn, { type: 'start', playerId: this.localId });
  };

  PartySession.prototype._buildBracket = function (ids) {
    var seeded = shuffle(ids);
    // pad to next power of 2 with byes (null)
    var n = 1;
    while (n < seeded.length) n *= 2;
    while (seeded.length < n) seeded.push(null);
    var round0 = [];
    for (var i = 0; i < seeded.length; i += 2) {
      round0.push({ a: seeded[i], b: seeded[i + 1], winner: null, scoreA: 0, scoreB: 0 });
    }
    return { rounds: [round0], roundIdx: 0, matchIdx: 0 };
  };

  PartySession.prototype.startBattle = function () {
    if (!this.isHost || !this.state || this.state.phase !== 'lobby') return;
    var ready = this.state.players.filter(function (p) {
      return p.ready && lineupFull(p.lineup) && p.connected !== false;
    });
    if (ready.length < 2) {
      this._log('Need at least 2 ready players with full 5-char lineups.');
      return;
    }
    this.state.players = ready;
    this.state.championId = null;
    this.state.log = [];
    if (ready.length === 2) {
      this.state.mode = 'series';
      this.state.bracket = null;
      this._startMatch(ready[0].id, ready[1].id);
    } else {
      this.state.mode = 'tournament';
      this.state.bracket = this._buildBracket(ready.map(function (p) { return p.id; }));
      this._log('Tournament bracket set — winner advances.');
      this._startNextBracketMatch();
    }
  };

  PartySession.prototype._startNextBracketMatch = function () {
    var br = this.state.bracket;
    if (!br) return;
    while (br.roundIdx < br.rounds.length) {
      var round = br.rounds[br.roundIdx];
      while (br.matchIdx < round.length) {
        var m = round[br.matchIdx];
        if (m.winner) { br.matchIdx++; continue; }
        // bye handling
        if (!m.a && m.b) { m.winner = m.b; br.matchIdx++; continue; }
        if (m.a && !m.b) { m.winner = m.a; br.matchIdx++; continue; }
        if (!m.a && !m.b) { br.matchIdx++; continue; }
        this._startMatch(m.a, m.b);
        return;
      }
      // round complete — build next or crown champion
      var winners = round.map(function (x) { return x.winner; }).filter(Boolean);
      if (winners.length <= 1) {
        this.state.phase = 'done';
        this.state.championId = winners[0] || null;
        this.state.match = null;
        var champ = this._player(this.state.championId);
        this.state.log.push((champ ? champ.name : 'Someone') + ' wins the tournament!');
        this._broadcastState();
        return;
      }
      var next = [];
      for (var i = 0; i < winners.length; i += 2) {
        next.push({ a: winners[i], b: winners[i + 1] || null, winner: null, scoreA: 0, scoreB: 0 });
      }
      br.rounds.push(next);
      br.roundIdx++;
      br.matchIdx = 0;
    }
  };

  PartySession.prototype._startMatch = function (aId, bId) {
    this.state.match = {
      aId: aId,
      bId: bId,
      scoreA: 0,
      scoreB: 0,
      gameIndex: 0,
      fighters: [],
      turnOrder: [],
      turnIndex: 0,
      log: [],
      lastAction: null,
      gameWinnerId: null
    };
    // sync bracket scores if present
    if (this.state.bracket) {
      var m = this.state.bracket.rounds[this.state.bracket.roundIdx][this.state.bracket.matchIdx];
      if (m) { m.scoreA = 0; m.scoreB = 0; }
    }
    this._startGame();
  };

  PartySession.prototype._startGame = function () {
    var match = this.state.match;
    if (!match) return;
    var a = this._player(match.aId);
    var b = this._player(match.bId);
    if (!a || !b) return;
    var gi = match.gameIndex;
    var aChar = a.lineup[gi];
    var bChar = b.lineup[gi];
    if (!aChar || !bChar) {
      this._log('Missing lineup slot for game ' + (gi + 1));
      return;
    }
    match.fighters = [
      { id: a.id, charId: aChar, hp: 100, shield: 0, stunned: false },
      { id: b.id, charId: bChar, hp: 100, shield: 0, stunned: false }
    ];
    match.gameWinnerId = null;
    match.lastAction = null;
    var self = this;
    match.turnOrder = B.initiativeOrder(match.fighters.map(function (f) {
      var c = self.byId[f.charId];
      return { id: f.id, power: c ? c.power : 50 };
    }));
    match.turnIndex = 0;
    var ac = this.byId[aChar];
    var bc = this.byId[bChar];
    var line = 'Game ' + (gi + 1) + ': ' + (ac ? ac.name : '?') + ' vs ' + (bc ? bc.name : '?') +
      ' · Series ' + match.scoreA + '-' + match.scoreB;
    match.log = [line];
    this.state.phase = 'fighting';
    this.state.log = (this.state.log || []).concat([line]).slice(-20);
    this._log(line);
    this._broadcastState();
  };

  PartySession.prototype._fighter = function (playerId) {
    var match = this.state && this.state.match;
    if (!match) return null;
    for (var i = 0; i < match.fighters.length; i++) {
      if (match.fighters[i].id === playerId) return match.fighters[i];
    }
    return null;
  };

  PartySession.prototype.currentTurnId = function () {
    if (!this.state || this.state.phase !== 'fighting' || !this.state.match) return null;
    var m = this.state.match;
    return m.turnOrder[m.turnIndex % m.turnOrder.length] || null;
  };

  PartySession.prototype.aliveFighters = function () {
    if (!this.state || !this.state.match) return [];
    return this.state.match.fighters.filter(function (f) { return f.hp > 0; });
  };

  // Back-compat alias used by older UI
  PartySession.prototype.alivePlayers = function () {
    return this.aliveFighters().map(function (f) {
      return { id: f.id, hp: f.hp, charId: f.charId, shield: f.shield, stunned: f.stunned };
    });
  };

  PartySession.prototype.submitMove = function (ability, targetId) {
    if (this.isHost) this._applyMove(this.localId, ability, targetId);
    else if (this.hostConn) {
      this._send(this.hostConn, { type: 'move', playerId: this.localId, ability: ability, targetId: targetId });
    }
  };

  PartySession.prototype._applyMove = function (playerId, ability, targetId) {
    if (!this.isHost || !this.state || this.state.phase !== 'fighting' || !this.state.match) return;
    if (this.currentTurnId() !== playerId) return;
    var match = this.state.match;
    var atkF = this._fighter(playerId);
    if (!atkF || atkF.hp <= 0) return;
    var atkC = this.byId[atkF.charId];
    if (!atkC) return;

    var resolved = B.resolveAbility(atkC.abilities, ability);
    var needsTarget = resolved.needsTarget;
    var defF = null;
    var defC = null;

    if (needsTarget) {
      var alive = this.aliveFighters().filter(function (f) { return f.id !== playerId; });
      if (!alive.length) return;
      if (targetId) defF = this._fighter(targetId);
      if (!defF || defF.hp <= 0 || defF.id === playerId) defF = alive[0];
      defC = this.byId[defF.charId];
      if (!defC) return;
    }

    var result = B.applyAbility(
      { hp: atkF.hp, shield: atkF.shield || 0, power: atkC.power, typePrimary: atkC.typePrimary },
      defF ? { hp: defF.hp, shield: defF.shield || 0, power: defC.power, stunned: !!defF.stunned, typePrimary: defC.typePrimary } : null,
      resolved
    );

    atkF.hp = result.atkHp;
    atkF.shield = result.atkShield;
    if (defF) {
      defF.hp = result.defHp;
      defF.shield = result.defShield;
      defF.stunned = !!result.defStunned;
    }

    var line = B.formatAbilityLine(atkC.name, defC ? defC.name : atkC.name, result);
    match.log = (match.log || []).concat([line]).slice(-14);
    match.lastAction = {
      atkId: playerId,
      defId: defF ? defF.id : playerId,
      ability: resolved.name,
      type: resolved.type,
      damage: result.damage,
      crit: result.crit,
      healed: result.healed,
      shieldGained: result.shieldGained,
      stunned: result.stunned,
      pierced: result.pierced,
      absorbed: result.absorbed,
      defHp: defF ? defF.hp : atkF.hp,
      defShield: defF ? defF.shield : atkF.shield,
      atkHp: atkF.hp,
      atkShield: atkF.shield
    };

    var still = this.aliveFighters();
    if (still.length <= 1) {
      var winId = still.length ? still[0].id : playerId;
      match.gameWinnerId = winId;
      if (winId === match.aId) match.scoreA++;
      else match.scoreB++;
      if (this.state.bracket) {
        var bm = this.state.bracket.rounds[this.state.bracket.roundIdx][this.state.bracket.matchIdx];
        if (bm) { bm.scoreA = match.scoreA; bm.scoreB = match.scoreB; }
      }
      var wp = this._player(winId);
      var wc = wp && this.byId[this._fighter(winId) ? this._fighter(winId).charId : null];
      var gline = (wc ? wc.name : (wp ? wp.name : 'Someone')) + ' takes game ' + (match.gameIndex + 1) +
        ' · Series ' + match.scoreA + '-' + match.scoreB;
      match.log.push(gline);
      this.state.log = (this.state.log || []).concat([gline]).slice(-20);

      if (match.scoreA >= SERIES_WINS || match.scoreB >= SERIES_WINS) {
        this._finishMatch(match.scoreA >= SERIES_WINS ? match.aId : match.bId);
        return;
      }
      // next game
      match.gameIndex++;
      if (match.gameIndex >= LINEUP_SIZE) {
        // safety: decide by score
        this._finishMatch(match.scoreA >= match.scoreB ? match.aId : match.bId);
        return;
      }
      this._broadcastState();
      var self = this;
      setTimeout(function () { self._startGame(); }, 600);
      return;
    }

    this._advanceTurn();
    this._broadcastState();
  };

  PartySession.prototype._finishMatch = function (winnerId) {
    var match = this.state.match;
    if (!match) return;
    if (this.state.mode === 'series') {
      this.state.phase = 'done';
      this.state.championId = winnerId;
      var w = this._player(winnerId);
      this.state.log.push((w ? w.name : 'Someone') + ' wins best of 5!');
      this._broadcastState();
      return;
    }
    // tournament: record winner and advance
    var br = this.state.bracket;
    var bm = br.rounds[br.roundIdx][br.matchIdx];
    bm.winner = winnerId;
    bm.scoreA = match.scoreA;
    bm.scoreB = match.scoreB;
    var wp = this._player(winnerId);
    this.state.log.push((wp ? wp.name : 'Someone') + ' advances!');
    br.matchIdx++;
    this.state.match = null;
    this._broadcastState();
    var self = this;
    setTimeout(function () { self._startNextBracketMatch(); }, 700);
  };

  PartySession.prototype._advanceTurn = function () {
    var match = this.state && this.state.match;
    if (!match || this.state.phase !== 'fighting') return;
    var n = match.turnOrder.length;
    if (!n) return;
    for (var guard = 0; guard < n * 2; guard++) {
      match.turnIndex = (match.turnIndex + 1) % n;
      var nid = match.turnOrder[match.turnIndex % n];
      var nf = this._fighter(nid);
      if (!nf || nf.hp <= 0) continue;
      if (nf.stunned) {
        nf.stunned = false;
        var nc = this.byId[nf.charId];
        var skipLine = (nc ? nc.name : 'Fighter') + ' is stunned and skips a turn!';
        match.log = (match.log || []).concat([skipLine]).slice(-14);
        continue;
      }
      break;
    }
  };

  PartySession.prototype.rematch = function () {
    if (!this.isHost || !this.state) return;
    this.state.phase = 'lobby';
    this.state.mode = null;
    this.state.bracket = null;
    this.state.match = null;
    this.state.championId = null;
    this.state.log = [];
    this.state.players.forEach(function (p) {
      p.ready = false;
      // keep lineup
    });
    this._log('Rematch — ready up with your lineups again.');
    this._broadcastState();
  };

  PartySession.prototype.requestRematch = function () {
    if (this.isHost) this.rematch();
    else if (this.hostConn) this._send(this.hostConn, { type: 'rematch', playerId: this.localId });
  };

  PartySession.prototype.destroy = function () {
    try {
      Object.keys(this.conns).forEach(function (k) { try { this.conns[k].close(); } catch (e) {} }.bind(this));
      if (this.hostConn) try { this.hostConn.close(); } catch (e) {}
      if (this.peer) try { this.peer.destroy(); } catch (e) {}
    } catch (e) {}
    this.conns = {};
    this.hostConn = null;
    this.peer = null;
    this.state = null;
  };

  // Legacy no-op so old UI calls don't throw before reload
  PartySession.prototype.pickCharacter = function (charId) {
    this.setLineupSlot(0, charId);
  };

  root.MarvelParty = {
    PartySession: PartySession,
    genCode: genCode,
    normalizeCode: normalizeCode,
    LINEUP_SIZE: LINEUP_SIZE,
    SERIES_WINS: SERIES_WINS
  };
})(typeof self !== 'undefined' ? self : this);
