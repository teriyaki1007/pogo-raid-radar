/* Battle logic (pure, no DOM). Works in browsers (window.MarvelBattle) and node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarvelBattle = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // P(A wins) = rA / (rA + rB)
  function winChance(rA, rB) {
    return rA / (rA + rB);
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

  return { winChance: winChance, drawWinner: drawWinner, planFight: planFight, splitInt: splitInt };
});
