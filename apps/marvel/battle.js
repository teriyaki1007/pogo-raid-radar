/* Battle logic (pure, no DOM). Works in browsers (window.MarvelBattle) and node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarvelBattle = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // P(A wins) = rA^3 / (rA^3 + rB^3) — sharper gaps (Legendary vs Common ~90%+)
  function winChance(rA, rB) {
    var a = Math.pow(+rA || 0, 3);
    var b = Math.pow(+rB || 0, 3);
    var s = a + b;
    return s > 0 ? a / s : 0.5;
  }

  // Decide the winner BEFORE any animation. Returns 'A' or 'B'.
  function drawWinner(rA, rB, rng) {
    rng = rng || Math.random;
    return rng() < winChance(rA, rB) ? 'A' : 'B';
  }

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // Split `total` into n positive integers with random weights (sum exactly total, each >= 1).
  function splitInt(total, n, rng) {
    if (n <= 0) return [];
    total = Math.max(total, n);
    var w = [], sum = 0, i;
    for (i = 0; i < n; i++) { var x = 0.5 + rng(); w.push(x); sum += x; }
    var out = w.map(function (x) { return Math.max(1, Math.floor((x / sum) * (total - n)) + 1); });
    var diff = total - out.reduce(function (a, b) { return a + b; }, 0);
    var k = 0;
    while (diff !== 0) {
      var j = k % n;
      if (diff > 0) { out[j]++; diff--; }
      else if (out[j] > 1) { out[j]--; diff++; }
      k++;
    }
    return out;
  }

  var HIT = [
    '{A} uses {ab} on {D}!',
    '{A} presses the attack with {ab}.',
    '{ab}! {D} takes the hit from {A}.',
    '{A} turns to {ab}; {D} staggers!',
    '{D} can\'t dodge {A}\'s {ab}!'
  ];
  var CRIT = [
    'CRITICAL! {A}\'s {ab} crashes into {D}!',
    'Huge hit! {A} unleashes {ab}!',
    '{A} goes all out with {ab}!'
  ];
  var LIGHT = [
    '{A} probes with a quick strike; {D} shrugs it off.',
    '{A} tests {D}\'s defences.',
    '{D} blocks most of {A}\'s attack.'
  ];
  var FINISH = [
    '{A} finishes it with {ab}. {D} is down!',
    'One last {ab} from {A}, and {D} hits the floor!'
  ];

  function fill(t, A, D, ab) {
    return t.replace(/\{A\}/g, A).replace(/\{D\}/g, D).replace(/\{ab\}/g, ab);
  }

  /**
   * Plan a whole fight for a pre-decided winner side ('A' | 'B').
   * a, b: {name, power, abilities[]}. Returns
   * { winner, loser, pWinner, winnerFinalHp, hits:[{side, damage, crit, text, hpA, hpB}] }
   * Guarantees: loser HP hits exactly 0 on the final hit only; winner ends with HP>=5.
   */
  function planFight(a, b, winnerSide, rng) {
    rng = rng || Math.random;
    var pA = winChance(a.power, b.power);
    var pW = winnerSide === 'A' ? pA : 1 - pA;       // the winner's pre-fight chance
    // Closer match / upset => winner barely survives. Lopsided favourite => stomp.
    var left = 8 + Math.pow(pW, 2) * 75 * (0.7 + 0.3 * rng());
    left = Math.round(Math.min(92, Math.max(5, left)));
    var N = 9;                                       // total blows
    var winnerDmgTaken = 100 - left;
    var loserHits = Math.round(N * winnerDmgTaken / (100 + winnerDmgTaken));
    loserHits = Math.min(4, Math.max(1, loserHits));
    var winnerHits = N - loserHits;
    // order: shuffled, but the last blow is always the winner's
    var seq = [], i;
    for (i = 0; i < winnerHits - 1; i++) seq.push('W');
    for (i = 0; i < loserHits; i++) seq.push('L');
    for (i = seq.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = seq[i]; seq[i] = seq[j]; seq[j] = t; }
    // never open with more than... just make sure first blow isn't always the same; fine. Finish:
    seq.push('W');
    var wDmg = splitInt(100, winnerHits, rng);
    var lDmg = splitInt(winnerDmgTaken, loserHits, rng);
    var wi = 0, li = 0, hpA = 100, hpB = 100, hits = [];
    var W = winnerSide === 'A' ? a : b, L = winnerSide === 'A' ? b : a;
    seq.forEach(function (who, idx) {
      var attacker = who === 'W' ? W : L, defender = who === 'W' ? L : W;
      var dmg = who === 'W' ? wDmg[wi++] : lDmg[li++];
      var ab = pick(attacker.abilities && attacker.abilities.length ? attacker.abilities : ['a mighty blow'], rng);
      var last = idx === seq.length - 1;
      var crit = !last && dmg >= 20;
      var pool = last ? FINISH : crit ? CRIT : dmg <= 6 ? LIGHT : HIT;
      var text = fill(pick(pool, rng), attacker.name, defender.name, ab);
      var side = (who === 'W') === (winnerSide === 'A') ? 'A' : 'B';   // who is attacking
      if (side === 'A') hpB = Math.max(0, hpB - dmg); else hpA = Math.max(0, hpA - dmg);
      hits.push({ side: side, damage: dmg, crit: crit, last: last, text: text, hpA: hpA, hpB: hpB });
    });
    return { winner: winnerSide, loser: winnerSide === 'A' ? 'B' : 'A', pWinner: pW, winnerFinalHp: left, hits: hits };
  }

  // --- Turn-based multiplayer helpers (host-authoritative) ---
  // Damage weighted by MCU power: stronger attackers hit harder; stronger defenders take less.
  function turnDamage(atkPower, defPower, rng) {
    rng = rng || Math.random;
    var atk = Math.max(1, +atkPower || 1);
    var def = Math.max(1, +defPower || 1);
    var ratio = atk / (atk + def * 0.55);
    var base = 10 + atk * 0.14;
    var roll = 0.72 + rng() * 0.56;
    var dmg = Math.round(base * ratio * roll);
    var critChance = 0.08 + Math.max(0, (atk - def) / 400);
    var crit = rng() < critChance;
    if (crit) dmg = Math.round(dmg * 1.55);
    dmg = Math.max(4, Math.min(38, dmg));
    return { damage: dmg, crit: crit };
  }

  function initiativeOrder(players, rng) {
    rng = rng || Math.random;
    // players: [{id, power}]
    return players
      .map(function (p) { return { id: p.id, score: (+p.power || 0) + rng() * 25 }; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (x) { return x.id; });
  }

  // Ability effect types for Party combat. Characters keep flavor ability names in
  // characters.json; Hub can later add explicit `effects` without breaking this.
  var EFFECT_TYPES = ['damage', 'pierce', 'shield', 'heal', 'stun'];
  var EFFECT_LABEL = {
    damage: 'ATK',
    pierce: 'PIERCE',
    shield: 'SHIELD',
    heal: 'HEAL',
    stun: 'STUN'
  };
  var EFFECT_NEEDS_TARGET = {
    damage: true,
    pierce: true,
    stun: true,
    shield: false,
    heal: false
  };

  function classifyAbilityKeyword(name) {
    var s = String(name || '').toLowerCase();
    if (/heal|regen|restor|vital|empath|life force|recover/.test(s)) return 'heal';
    if (/shield|armou?r|barrier|protect|guard|absorb|force field|ward|deflect/.test(s)) return 'shield';
    if (/stun|freeze|paralys|sleep|hypno|disable|knock.?out|mind control|mind influence|charm|confuse|petrif|bind|web/.test(s)) return 'stun';
    if (/pierce|penetrat|phase|precision|snipe|assassin|ignore|through|arrow|quantum|sonic|vibranium strike/.test(s)) return 'pierce';
    if (/blast|strike|punch|kick|slash|beam|bolt|lightning|fire|flame|hammer|strength|smash|shot|blast|rage|fury|godly|super.?soldier|claw|blade|repulsor|photon|energy|magic|chaos|odinf/.test(s)) return 'damage';
    return null;
  }

  /**
   * Build a strategic kit from a character's ability name list.
   * Keyword match first; fill remaining slots so every kit has real choices
   * (damage / pierce / shield / heal / stun) without editing characters.json.
   * Optional per-ability override: if abilities[i] is {name, effect} Hub can drop that later.
   */
  function abilityKit(abilities) {
    var raw = abilities && abilities.length ? abilities : ['Strike'];
    var names = [];
    var forced = [];
    for (var i = 0; i < raw.length; i++) {
      var a = raw[i];
      if (a && typeof a === 'object') {
        names.push(String(a.name || a.id || 'Strike'));
        var fe = String(a.effect || a.type || '').toLowerCase();
        forced.push(EFFECT_TYPES.indexOf(fe) >= 0 ? fe : null);
      } else {
        names.push(String(a || 'Strike'));
        forced.push(null);
      }
    }
    var types = names.map(function (n, idx) {
      return forced[idx] || classifyAbilityKeyword(n);
    });
    var have = {};
    types.forEach(function (t) { if (t) have[t] = true; });
    var fillOrder = ['damage', 'pierce', 'shield', 'stun', 'heal'];
    for (var j = 0; j < types.length; j++) {
      if (types[j]) continue;
      var pick = null;
      for (var k = 0; k < fillOrder.length; k++) {
        if (!have[fillOrder[k]]) { pick = fillOrder[k]; break; }
      }
      if (!pick) pick = fillOrder[j % fillOrder.length];
      types[j] = pick;
      have[pick] = true;
    }
    if (!have.damage) {
      types[0] = 'damage';
      have.damage = true;
    }
    return names.map(function (n, idx) {
      var t = types[idx];
      return {
        name: n,
        type: t,
        label: EFFECT_LABEL[t] || 'ATK',
        needsTarget: !!EFFECT_NEEDS_TARGET[t]
      };
    });
  }

  function resolveAbility(abilities, abilityName) {
    var kit = abilityKit(abilities);
    if (abilityName) {
      for (var i = 0; i < kit.length; i++) {
        if (kit[i].name === abilityName) return kit[i];
      }
    }
    return kit[0];
  }

  function absorbDamage(hp, shield, raw) {
    var s = Math.max(0, +shield || 0);
    var h = Math.max(0, +hp || 0);
    var d = Math.max(0, +raw || 0);
    var fromShield = Math.min(s, d);
    s -= fromShield;
    d -= fromShield;
    h = Math.max(0, h - d);
    return { hp: h, shield: s, absorbed: fromShield, hpLost: d };
  }

  /**
   * Apply one Party ability. Pure — returns next fighter stats + log bits.
   * atk/def: { hp, shield, stunned, power }
   * ability: from resolveAbility / abilityKit entry
   */
  function applyAbility(atk, def, ability, rng) {
    rng = rng || Math.random;
    var type = (ability && ability.type) || 'damage';
    var name = (ability && ability.name) || 'Strike';
    var atkHp = Math.max(0, +atk.hp || 0);
    var atkShield = Math.max(0, +atk.shield || 0);
    var defHp = def ? Math.max(0, +def.hp || 0) : 0;
    var defShield = def ? Math.max(0, +def.shield || 0) : 0;
    var defStunned = def ? !!def.stunned : false;
    var out = {
      type: type,
      ability: name,
      damage: 0,
      crit: false,
      healed: 0,
      shieldGained: 0,
      stunned: false,
      pierced: false,
      absorbed: 0,
      atkHp: atkHp,
      atkShield: atkShield,
      defHp: defHp,
      defShield: defShield,
      defStunned: defStunned,
      needsTarget: !!EFFECT_NEEDS_TARGET[type]
    };

    if (type === 'heal') {
      var heal = Math.round(14 + rng() * 10 + Math.min(8, (+atk.power || 50) * 0.06));
      heal = Math.max(12, Math.min(28, heal));
      var nh = Math.min(100, atkHp + heal);
      out.healed = nh - atkHp;
      out.atkHp = nh;
      return out;
    }

    if (type === 'shield') {
      var gain = Math.round(16 + rng() * 10 + Math.min(6, (+atk.power || 50) * 0.05));
      gain = Math.max(14, Math.min(30, gain));
      var ns = Math.min(45, atkShield + gain);
      out.shieldGained = ns - atkShield;
      out.atkShield = ns;
      return out;
    }

    // Offensive types need a living defender
    if (!def || defHp <= 0) return out;

    var scale = type === 'stun' ? 0.58 : type === 'pierce' ? 0.88 : 1;
    var hit = turnDamage(atk.power, def.power, rng);
    var dmg = Math.max(3, Math.round(hit.damage * scale));
    if (type === 'stun') dmg = Math.max(3, Math.min(22, dmg));
    out.damage = dmg;
    out.crit = !!hit.crit && type !== 'stun';

    if (type === 'pierce') {
      out.pierced = true;
      out.defHp = Math.max(0, defHp - dmg);
      out.defShield = defShield; // untouched
      out.absorbed = 0;
    } else {
      var ab = absorbDamage(defHp, defShield, dmg);
      out.defHp = ab.hp;
      out.defShield = ab.shield;
      out.absorbed = ab.absorbed;
    }

    if (type === 'stun') {
      out.stunned = true;
      out.defStunned = true;
    }
    return out;
  }

  function formatAbilityLine(atkName, defName, result) {
    var ab = result.ability;
    if (result.type === 'heal') {
      return atkName + ' uses ' + ab + ' and heals ' + result.healed + ' HP (' + result.atkHp + ' HP)';
    }
    if (result.type === 'shield') {
      return atkName + ' uses ' + ab + ' — shield +' + result.shieldGained + ' (shield ' + result.atkShield + ')';
    }
    var bits = atkName + ' uses ' + ab;
    if (result.type === 'pierce') bits += ' (pierce)';
    if (result.type === 'stun') bits += ' (stun)';
    bits += ' on ' + defName + ' for ' + result.damage;
    if (result.crit) bits += ' CRIT!';
    if (result.absorbed) bits += ' [' + result.absorbed + ' blocked]';
    if (result.stunned) bits += ' — stunned!';
    if (result.defHp <= 0) bits += ' — K.O.!';
    else bits += ' (' + result.defHp + ' HP' + (result.defShield ? ', shield ' + result.defShield : '') + ')';
    return bits;
  }

  return {
    winChance: winChance,
    drawWinner: drawWinner,
    planFight: planFight,
    splitInt: splitInt,
    turnDamage: turnDamage,
    initiativeOrder: initiativeOrder,
    EFFECT_TYPES: EFFECT_TYPES,
    EFFECT_LABEL: EFFECT_LABEL,
    abilityKit: abilityKit,
    resolveAbility: resolveAbility,
    applyAbility: applyAbility,
    absorbDamage: absorbDamage,
    formatAbilityLine: formatAbilityLine,
    classifyAbilityKeyword: classifyAbilityKeyword
  };
});
