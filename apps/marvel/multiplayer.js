/* Party-code multiplayer (PeerJS). Host-authoritative turn-based battles. No API key. */
(function (root) {
  'use strict';
  var B = root.MarvelBattle;
  var CODE_ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var PEER_PREFIX = 'mhv1';

  function genCode() {
    var s = '';
    for (var i = 0; i < 4; i++) s += CODE_ALPH[Math.floor(Math.random() * CODE_ALPH.length)];
    return s;
  }
  function peerIdFor(code) { return PEER_PREFIX + String(code || '').toUpperCase(); }
  function normalizeCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }

  function uid() {
    return 'p' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Create a PartySession.
   * opts: {
   *   byId: {charId: character},
   *   onState: function(state),
   *   onLog: function(msg),
   *   onError: function(err),
   *   playerName: string
   * }
   */
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
    this.conns = {}; // peerId -> DataConnection (host only)
    this.hostConn = null; // guest -> host
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
        charId: null,
        ready: false,
        hp: 100,
        shield: 0,
        stunned: false,
        connected: true
      }],
      turnOrder: [],
      turnIndex: 0,
      log: [],
      winnerId: null,
      lastAction: null
    };
  };

  /** Map PeerJS / WebRTC errors to short actionable copy. */
  PartySession.prototype._friendlyError = function (err) {
    var type = (err && err.type) ? String(err.type) : '';
    var raw = String((err && err.message) || err || '');
    var low = (type + ' ' + raw).toLowerCase();
    if (/peer-unavailable|could not connect to peer/i.test(low)) {
      return new Error('No open room for that code. Host may have left or refreshed — ask them to Create room again and share the new code. Keep both tabs open.');
    }
    if (/negotiation-failed|could not negotiate|ice|webrtc/i.test(low)) {
      return new Error('Could not link devices (network blocked direct play). Try: same Wi-Fi, disable VPN/adblock, both keep the tab open, or host creates a fresh code. Cross-network needs a free relay — retry in a moment.');
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
    // PeerJS config REPLACES library defaults — must re-include their free TURN
    // (turn:*.turn.peerjs.com) or cross-NAT joins fail with "Could not negotiate".
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          {
            urls: [
              'turn:eu-0.turn.peerjs.com:3478',
              'turn:us-0.turn.peerjs.com:3478'
            ],
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
      // unavailable-id only matters while claiming a host id — surface it for retry
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
    // Mark matching player disconnected if we stored peer map — guests send player id on join
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
          // One automatic retry helps flaky ICE / brief broker lag
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
        peer.on('error', function (err) {
          // peer-unavailable = host id not on broker (left / wrong code / refreshed)
          fail(err);
        });
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
        this._send(conn, { type: 'err', message: 'Battle already started.' });
        return;
      }
      if (st.players.length >= 6) {
        this._send(conn, { type: 'err', message: 'Room is full (max 6).' });
        return;
      }
      var p = msg.player;
      if (!p || !p.id) return;
      if (st.players.some(function (x) { return x.id === p.id; })) {
        this._broadcastState();
        return;
      }
      st.players.push({
        id: p.id,
        name: String(p.name || 'Player').slice(0, 18),
        charId: null,
        ready: false,
        hp: 100,
        shield: 0,
        stunned: false,
        connected: true,
        _peer: conn.peer
      });
      this._log((p.name || 'Player') + ' joined.');
      this._broadcastState();
      return;
    }
    if (msg.type === 'pick') {
      this._setPick(msg.playerId, msg.charId);
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

  PartySession.prototype.pickCharacter = function (charId) {
    if (this.isHost) this._setPick(this.localId, charId);
    else if (this.hostConn) this._send(this.hostConn, { type: 'pick', playerId: this.localId, charId: charId });
  };

  PartySession.prototype.setReady = function (ready) {
    if (this.isHost) this._setReady(this.localId, ready);
    else if (this.hostConn) this._send(this.hostConn, { type: 'ready', playerId: this.localId, ready: !!ready });
  };

  PartySession.prototype._setPick = function (playerId, charId) {
    if (!this.isHost || !this.state || this.state.phase !== 'lobby') return;
    if (!this.byId[charId]) return;
    var p = this._player(playerId);
    if (!p) return;
    p.charId = charId;
    p.ready = false;
    this._broadcastState();
  };

  PartySession.prototype._setReady = function (playerId, ready) {
    if (!this.isHost || !this.state || this.state.phase !== 'lobby') return;
    var p = this._player(playerId);
    if (!p || !p.charId) return;
    p.ready = !!ready;
    this._broadcastState();
  };

  PartySession.prototype.requestStart = function () {
    if (this.isHost) this.startBattle();
    else if (this.hostConn) this._send(this.hostConn, { type: 'start', playerId: this.localId });
  };

  PartySession.prototype.startBattle = function () {
    if (!this.isHost || !this.state || this.state.phase !== 'lobby') return;
    var ready = this.state.players.filter(function (p) { return p.ready && p.charId && p.connected !== false; });
    if (ready.length < 2) {
      this._log('Need at least 2 ready players to start.');
      return;
    }
    // Drop unready from this fight
    this.state.players = ready.map(function (p) {
      return {
        id: p.id, name: p.name, charId: p.charId, ready: true,
        hp: 100, shield: 0, stunned: false, connected: true, _peer: p._peer
      };
    });
    var self = this;
    var order = B.initiativeOrder(this.state.players.map(function (p) {
      var c = self.byId[p.charId];
      return { id: p.id, power: c ? c.power : 50 };
    }));
    this.state.turnOrder = order;
    this.state.turnIndex = 0;
    this.state.phase = 'fighting';
    this.state.winnerId = null;
    this.state.log = ['Battle start! Initiative set.'];
    this.state.lastAction = null;
    this._log('Battle started.');
    this._broadcastState();
  };

  PartySession.prototype.currentTurnId = function () {
    if (!this.state || this.state.phase !== 'fighting') return null;
    return this.state.turnOrder[this.state.turnIndex % this.state.turnOrder.length] || null;
  };

  PartySession.prototype.alivePlayers = function () {
    if (!this.state) return [];
    return this.state.players.filter(function (p) { return p.hp > 0; });
  };

  PartySession.prototype.submitMove = function (ability, targetId) {
    if (this.isHost) this._applyMove(this.localId, ability, targetId);
    else if (this.hostConn) {
      this._send(this.hostConn, { type: 'move', playerId: this.localId, ability: ability, targetId: targetId });
    }
  };

  PartySession.prototype._applyMove = function (playerId, ability, targetId) {
    if (!this.isHost || !this.state || this.state.phase !== 'fighting') return;
    if (this.currentTurnId() !== playerId) return;
    var atkP = this._player(playerId);
    if (!atkP || atkP.hp <= 0) return;
    var atkC = this.byId[atkP.charId];
    if (!atkC) return;

    var resolved = B.resolveAbility(atkC.abilities, ability);
    var needsTarget = resolved.needsTarget;
    var defP = null;
    var defC = null;

    if (needsTarget) {
      var alive = this.alivePlayers().filter(function (p) { return p.id !== playerId; });
      if (!alive.length) return;
      if (targetId) defP = this._player(targetId);
      if (!defP || defP.hp <= 0 || defP.id === playerId) defP = alive[0];
      defC = this.byId[defP.charId];
      if (!defC) return;
    }

    var result = B.applyAbility(
      { hp: atkP.hp, shield: atkP.shield || 0, power: atkC.power, typePrimary: atkC.typePrimary },
      defP ? { hp: defP.hp, shield: defP.shield || 0, power: defC.power, stunned: !!defP.stunned, typePrimary: defC.typePrimary } : null,
      resolved
    );

    atkP.hp = result.atkHp;
    atkP.shield = result.atkShield;
    if (defP) {
      defP.hp = result.defHp;
      defP.shield = result.defShield;
      defP.stunned = !!result.defStunned;
    }

    var line = B.formatAbilityLine(atkC.name, defC ? defC.name : atkC.name, result);
    this.state.log = (this.state.log || []).concat([line]).slice(-14);
    this.state.lastAction = {
      atkId: playerId,
      defId: defP ? defP.id : playerId,
      ability: resolved.name,
      type: resolved.type,
      damage: result.damage,
      crit: result.crit,
      healed: result.healed,
      shieldGained: result.shieldGained,
      stunned: result.stunned,
      pierced: result.pierced,
      absorbed: result.absorbed,
      defHp: defP ? defP.hp : atkP.hp,
      defShield: defP ? defP.shield : atkP.shield,
      atkHp: atkP.hp,
      atkShield: atkP.shield
    };

    var still = this.alivePlayers();
    if (still.length <= 1) {
      this.state.phase = 'done';
      this.state.winnerId = still.length ? still[0].id : playerId;
      var w = this._player(this.state.winnerId);
      var wc = w && this.byId[w.charId];
      this.state.log.push((wc ? wc.name : 'Someone') + ' wins the party battle!');
      this._broadcastState();
      return;
    }

    this._advanceTurn();
    this._broadcastState();
  };

  PartySession.prototype._advanceTurn = function () {
    if (!this.state || this.state.phase !== 'fighting') return;
    var n = this.state.turnOrder.length;
    if (!n) return;
    for (var guard = 0; guard < n * 2; guard++) {
      this.state.turnIndex = (this.state.turnIndex + 1) % n;
      var nid = this.currentTurnId();
      var np = this._player(nid);
      if (!np || np.hp <= 0) continue;
      if (np.stunned) {
        np.stunned = false;
        var nc = this.byId[np.charId];
        var skipLine = (nc ? nc.name : np.name) + ' is stunned and skips a turn!';
        this.state.log = (this.state.log || []).concat([skipLine]).slice(-14);
        continue;
      }
      break;
    }
  };

  PartySession.prototype.rematch = function () {
    if (!this.isHost || !this.state) return;
    var self = this;
    this.state.phase = 'lobby';
    this.state.turnOrder = [];
    this.state.turnIndex = 0;
    this.state.winnerId = null;
    this.state.lastAction = null;
    this.state.log = [];
    this.state.players.forEach(function (p) {
      p.hp = 100;
      p.shield = 0;
      p.stunned = false;
      p.ready = false;
      // keep charId for convenience
    });
    this._log('Rematch — pick & ready up again.');
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

  root.MarvelParty = { PartySession: PartySession, genCode: genCode, normalizeCode: normalizeCode };
})(typeof self !== 'undefined' ? self : this);
