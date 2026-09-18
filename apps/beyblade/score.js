/**
 * Beyblade X combo scorer — transparent coach estimates.
 *
 * Formula overview (all outputs clamped 0–100):
 *
 *  BASIC / UX mode (blade + ratchet + bit):
 *    competitiveness =
 *      0.50 * blade.scoreBase
 *    + 0.25 * ratchet.scoreBase
 *    + 0.25 * bit.scoreBase
 *    + synergyBonus (− mismatch)
 *    + light usage nudge when usagePct present (see usageNudge)
 *
 *  CX mode (lock + main + assist + ratchet + bit):
 *    competitiveness =
 *      0.12 * lock.scoreBase
 *    + 0.38 * main.scoreBase
 *    + 0.15 * assist.scoreBase
 *    + 0.175 * ratchet.scoreBase
 *    + 0.175 * bit.scoreBase
 *    + cxMassBonus (metal lock / Heavy assist)
 *    + synergy / − mismatch
 *    + usage nudge (averaged across parts with usagePct)
 *
 *  metaBreak / value / overall grade: same structure as before.
 *
 * usagePct (0–100) is BEYWATCH top-cut share when present. We only apply a
 * small ±3 competitiveness nudge — never invent usage, and never let usage
 * dominate tier bases. Missing usagePct → nudge 0.
 *
 * Weights are tunable via WEIGHTS. Scores are coach estimates.
 */

export const WEIGHTS = {
  blade: 0.5,
  ratchet: 0.25,
  bit: 0.25,
  // CX stack weights (sum ≈ 1.0)
  cxLock: 0.12,
  cxMain: 0.38,
  cxAssist: 0.15,
  cxRatchet: 0.175,
  cxBit: 0.175,
  synergyMax: 12,
  mismatchMax: 10,
  metaCapOverComp: 8,
  metaPerformanceFactor: 0.85,
  valueScale: 55,
  valueCostFloor: 80,
  /** Max ± competitiveness points from usagePct when present */
  usageNudgeMax: 3,
};

const TIER_RANK = { S: 5, A: 4, B: 3, C: 2, D: 1, Unranked: 2 };

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function midHkd(part) {
  if (!part) return 0;
  const a = Number(part.hkdMin) || 0;
  const b = Number(part.hkdMax) || a;
  return (a + b) / 2;
}

/**
 * Light competitiveness nudge from tournament usage share.
 * Maps usagePct into roughly [-usageNudgeMax, +usageNudgeMax] around a 10% baseline.
 * Returns 0 when usagePct is null/undefined.
 */
function usageNudge(...parts) {
  const vals = parts
    .filter(Boolean)
    .map((p) => p.usagePct)
    .filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  // 0% → -3, 10% → 0, 40%+ → +3 (soft)
  const raw = ((avg - 10) / 30) * WEIGHTS.usageNudgeMax;
  return Math.max(-WEIGHTS.usageNudgeMax, Math.min(WEIGHTS.usageNudgeMax, raw));
}

function formatUsage(part) {
  if (!part || part.usagePct == null) return "n/a";
  const n = Number(part.usagePct);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

function comboStringBasic(blade, ratchet, bit) {
  const expand =
    /valkyrie|griffon/i.test(blade.name) && blade.notes?.toLowerCase().includes("expand");
  const r = ratchet?.abbr || ratchet?.name || "";
  const bAbbr = bit?.abbr || bit?.name || "";
  if (expand && (!ratchet || ratchet.id === "integrated")) {
    return `${blade.name} ${bAbbr}`.trim();
  }
  return `${blade.name} ${r} ${bit?.name || bAbbr}`.replace(/\s+/g, " ").trim();
}

function comboStringCx(lock, main, assist, ratchet, bit) {
  const lockN = lock?.name || "";
  const mainN = main?.name || "";
  const assistN = assist?.name || "";
  const r = ratchet?.abbr || ratchet?.name || "";
  const bAbbr = bit?.abbr || bit?.name || "";
  // e.g. Emperor Blast Heavy 9-60 K
  return `${lockN} ${mainN} ${assistN} ${r} ${bAbbr}`.replace(/\s+/g, " ").trim();
}

function parseHeight(ratchet) {
  if (!ratchet) return 60;
  if (typeof ratchet.height === "number") return ratchet.height;
  const m = String(ratchet.abbr || ratchet.name || "").match(/-(\d+)/);
  return m ? Number(m[1]) : 60;
}

function synergyBonus(bladeLike, ratchet, bit) {
  let bonus = 0;
  const rAbbr = (ratchet.abbr || "").toLowerCase();
  const bAbbr = (bit.abbr || "").toLowerCase();
  const bName = (bit.name || "").toLowerCase();
  const comboHay = [
    ...(bladeLike.bestCombos || []),
    ...(bladeLike.bestPartners || []),
    ...(ratchet.bestPartners || []),
    ...(bit.bestPartners || []),
  ]
    .join(" ")
    .toLowerCase();

  if (rAbbr && comboHay.includes(rAbbr)) bonus += 4;
  if (
    bAbbr &&
    (comboHay.includes(` ${bAbbr}`) ||
      comboHay.includes(` ${bAbbr} `) ||
      comboHay.endsWith(` ${bAbbr}`) ||
      comboHay.includes(bAbbr.toLowerCase()))
  ) {
    bonus += 4;
  }
  if (bName && comboHay.includes(bName)) bonus += 3;

  const bladeId = bladeLike.id;
  const pairs = [
    ["wizard-rod", "1-60", ["h", "fb", "hexa", "free ball"]],
    ["shark-scale", "1-70", ["lr", "low rush"]],
    ["shark-scale", "3-60", ["lr", "low rush"]],
    ["shark-scale", "9-60", ["fb", "free ball"]],
    ["aero-pegasus", "1-60", ["r", "rush"]],
    ["aero-pegasus", "1-50", ["r", "rush"]],
    ["cobalt-dragoon", "5-60", ["e", "elevate"]],
    ["cobalt-dragoon", "9-60", ["e", "elevate"]],
    ["silver-wolf", "9-60", ["fb", "free ball", "h", "hexa"]],
    ["phoenix-wing", "1-60", ["r", "rush", "lr", "low rush"]],
    ["meteor-dragoon", "7-60", ["l", "level"]],
    ["impact-drake", "9-60", ["lr", "low rush"]],
    ["wyvern-hover", "9-60", ["k", "kick", "r", "rush"]],
    ["blast", "9-60", ["k", "kick", "lr", "low rush"]],
    ["blast", "7-60", ["lr", "low rush", "k", "kick"]],
  ];
  for (const [bid, rNeed, bitKeys] of pairs) {
    if (bladeId === bid && rAbbr === rNeed) {
      bonus += 3;
      if (bitKeys.some((k) => bAbbr === k || bName.includes(k))) bonus += 4;
    }
  }

  const bladeType = bladeLike.type || "";
  const bitType = bit.type || "";
  if (bladeType === "Stamina" && (bitType === "Stamina" || bitType === "Defense")) bonus += 2;
  if (bladeType === "Attack" && bitType === "Attack") bonus += 2;
  if (bladeType === "Defense" && (bitType === "Defense" || bitType === "Stamina")) bonus += 2;

  return Math.min(WEIGHTS.synergyMax, bonus);
}

/** Extra synergy for documented CX stacks (Emperor Blast Heavy, etc.) */
function cxStackBonus(lock, main, assist) {
  let bonus = 0;
  const L = (lock?.id || "").toLowerCase();
  const M = (main?.id || "").toLowerCase();
  const A = (assist?.id || "").toLowerCase();
  const stacks = [
    ["emperor", "blast", "heavy", 8],
    ["emperor", "blast", "assault", 5],
    ["emperor", "might", "heavy", 6],
    ["emperor", "delta", "heavy", 5],
    ["pegasus", "blast", "heavy", 5],
    ["pegasus", "blast", "assault", 4],
    ["bahamut", "blitz", "heavy", 5],
    ["valkyrie", "volt", "slash", 4],
    ["dran", "brave", "slash", 3],
    ["wizard", "arc", "free", 3],
    ["sol", "eclipse", "dual", 3],
    ["sol", "eclipse", "heavy", 4],
    ["wolf", "hunt", "free", 3],
    ["ragna", "rage", "heavy", 4],
  ];
  for (const [l, m, a, pts] of stacks) {
    if (L === l && M === m && A === a) bonus += pts;
  }
  // Partial: metal lock + Heavy still good on strong mains
  if ((lock?.metal || L === "emperor" || L === "valkyrie") && A === "heavy") bonus += 2;
  if (M === "blast" && A === "heavy") bonus += 2;
  return Math.min(10, bonus);
}

function cxMassBonus(lock, assist) {
  let b = 0;
  if (lock?.metal || lock?.id === "emperor" || lock?.id === "valkyrie") b += 4;
  if (assist?.id === "heavy") b += 5;
  if (assist?.id === "wheel" || assist?.id === "massive") b += 2;
  return b;
}

function mismatchPenalty(bladeLike, ratchet, bit) {
  let pen = 0;
  const h = parseHeight(ratchet);
  const bladeType = bladeLike.type || "";
  const bitType = bit.type || "";

  if (h >= 80) pen += 5;
  else if (h >= 70 && bladeType === "Attack" && bitType === "Attack") pen += 1;

  const prot = ratchet.protrusions;
  if (prot === 2) pen += 4;
  if (prot === 4 && h >= 60) pen += 2;

  if (bladeType === "Attack" && bitType === "Stamina" && (bladeLike.tier === "S" || bladeLike.tier === "A")) {
    if (bladeLike.id !== "shark-scale" && bit.id !== "free-ball") pen += 2;
  }
  if (bladeType === "Stamina" && bitType === "Attack") pen += 3;

  if (bladeLike.tier === "S" && (TIER_RANK[ratchet.tier] || 0) <= 1) pen += 3;
  if (bladeLike.tier === "S" && (TIER_RANK[bit.tier] || 0) <= 1) pen += 3;

  return Math.min(WEIGHTS.mismatchMax, pen);
}

function typeRole(bladeLike, bit) {
  const b = bladeLike.type || "Balance";
  const t = bit.type || "";
  if (b === "Balance" && t === "Attack") return "Attack";
  if (b === "Balance" && t === "Stamina") return "Stamina";
  if (b === "Balance" && t === "Defense") return "Defense";
  return b;
}

function coachNotes(bladeLike, ratchet, bit, scores, extraStrengths = []) {
  const strengths = [...extraStrengths];
  const risks = [];
  const syn = synergyBonus(bladeLike, ratchet, bit);
  const mis = mismatchPenalty(bladeLike, ratchet, bit);

  if ((bladeLike.tier === "S" || bladeLike.tier === "A") && syn >= 6) {
    strengths.push("Documented meta pairing — high tournament precedent.");
  } else if (bladeLike.tier === "S") {
    strengths.push(`${bladeLike.name} is a top-cut part; floor is high even on off-meta tips.`);
  }
  if ((bladeLike.pros || [])[0]) strengths.push(bladeLike.pros[0]);
  if ((bit.pros || [])[0]) strengths.push(`Bit: ${bit.pros[0]}`);
  if (parseHeight(ratchet) === 60) strengths.push("60-height ratchet — safest competitive stance.");

  if ((bladeLike.cons || [])[0]) risks.push(bladeLike.cons[0]);
  if (mis >= 5) risks.push("Part mismatch / tall or weak ratchet may leak bursts or scrapes.");
  if (scores.value < 40) risks.push("Pricey for the projected performance — check live HK listings.");
  if (bladeLike.tier === "Unranked" || bit.tier === "Unranked") {
    risks.push("Sparse tournament sample — treat scores as soft estimates.");
  }
  if (!strengths.length) strengths.push("Coherent type stack; verify on your stadium.");
  if (!risks.length) risks.push("Meta shifts weekly — re-check BEYWATCH before events.");

  return { strengths: strengths.slice(0, 4), risks: risks.slice(0, 3) };
}

function gradeFrom(comp, value) {
  const nudged = comp * 0.85 + value * 0.15;
  if (nudged >= 88) return "S";
  if (nudged >= 75) return "A";
  if (nudged >= 60) return "B";
  if (nudged >= 45) return "C";
  return "D";
}

function finishScores({
  rawComp,
  bladeLike,
  ratchet,
  bit,
  costParts,
  string,
  extraStrengths,
  breakdownExtra,
}) {
  const competitiveness = clamp(rawComp);

  let disrupt = 0;
  if (/left/i.test(bladeLike.notes || "") || /dragoon/i.test(bladeLike.name)) disrupt += 18;
  if (/expand/i.test(bladeLike.notes || "")) disrupt += 10;
  if (bladeLike.type === "Attack" && bit.type === "Stamina") disrupt += 12;
  if (bladeLike.type === "Stamina" && bit.type === "Attack") disrupt += 8;
  if (synergyBonus(bladeLike, ratchet, bit) >= 8) disrupt += 6;
  // CX mass stacks are disruptive into light UX walls
  if ((breakdownExtra?.cxMass || 0) >= 6) disrupt += 8;

  let metaBreak = disrupt * WEIGHTS.metaPerformanceFactor + (competitiveness - 50) * 0.35;
  metaBreak = Math.min(metaBreak, competitiveness + WEIGHTS.metaCapOverComp);
  if (competitiveness < 40) metaBreak = Math.min(metaBreak, competitiveness * 0.7);
  metaBreak = clamp(metaBreak);

  const cost = costParts.reduce((s, p) => s + midHkd(p), 0);
  const perf = Math.max(competitiveness, 1);
  const costSafe = Math.max(cost, WEIGHTS.valueCostFloor);
  const ratio = (perf / costSafe) * WEIGHTS.valueScale * 4.2;
  const value = clamp(ratio);

  const overall = gradeFrom(competitiveness, value);
  const role = typeRole(bladeLike, bit);
  const notes = coachNotes(bladeLike, ratchet, bit, { value, competitiveness }, extraStrengths);

  return {
    competitiveness,
    metaBreak,
    value,
    overall,
    estimatedHkd: Math.round(cost),
    hkdMin: Math.round(costParts.reduce((s, p) => s + (Number(p?.hkdMin) || 0), 0)),
    hkdMax: Math.round(costParts.reduce((s, p) => s + (Number(p?.hkdMax) || 0), 0)),
    typeRole: role,
    comboString: string,
    notes,
    mode: breakdownExtra?.mode || "basic",
    usage: breakdownExtra?.usage || null,
    breakdown: {
      bladeBase: bladeLike.scoreBase,
      ratchetBase: ratchet.scoreBase,
      bitBase: bit.scoreBase,
      synergy: synergyBonus(bladeLike, ratchet, bit),
      mismatch: mismatchPenalty(bladeLike, ratchet, bit),
      usageNudge: breakdownExtra?.usageNudge ?? 0,
      weights: { ...WEIGHTS },
      ...breakdownExtra,
    },
  };
}

/**
 * @param {{blade: object, ratchet: object, bit: object}} parts
 */
export function scoreCombo({ blade, ratchet, bit }) {
  if (!blade || !ratchet || !bit) return null;

  const syn = synergyBonus(blade, ratchet, bit);
  const mis = mismatchPenalty(blade, ratchet, bit);
  const uNudge = usageNudge(blade, ratchet, bit);

  const rawComp =
    WEIGHTS.blade * (blade.scoreBase || 45) +
    WEIGHTS.ratchet * (ratchet.scoreBase || 45) +
    WEIGHTS.bit * (bit.scoreBase || 45) +
    syn -
    mis +
    uNudge;

  return finishScores({
    rawComp,
    bladeLike: blade,
    ratchet,
    bit,
    costParts: [blade, ratchet, bit],
    string: comboStringBasic(blade, ratchet, bit),
    extraStrengths: [],
    breakdownExtra: {
      mode: "basic",
      usageNudge: uNudge,
      usage: {
        blade: formatUsage(blade),
        ratchet: formatUsage(ratchet),
        bit: formatUsage(bit),
      },
    },
  });
}

/**
 * Score a full CX Custom Line stack.
 * @param {{lockChip, mainBlade, assistBlade, ratchet, bit}} parts
 */
export function scoreCxCombo({ lockChip, mainBlade, assistBlade, ratchet, bit }) {
  if (!lockChip || !mainBlade || !assistBlade || !ratchet || !bit) return null;

  // Treat Main Blade as the primary "bladeLike" for role / mismatch / notes
  const bladeLike = {
    ...mainBlade,
    name: `${lockChip.name} ${mainBlade.name} ${assistBlade.name}`,
    bestPartners: [
      ...(mainBlade.bestPartners || []),
      ...(lockChip.bestPartners || []),
      ...(assistBlade.bestPartners || []),
    ],
    pros: [...(mainBlade.pros || []).slice(0, 2), ...(assistBlade.pros || []).slice(0, 1)],
    cons: mainBlade.cons || [],
    notes: [mainBlade.notes, lockChip.notes, assistBlade.notes].filter(Boolean).join(" · "),
  };

  const syn = synergyBonus(bladeLike, ratchet, bit) + cxStackBonus(lockChip, mainBlade, assistBlade);
  const synCapped = Math.min(WEIGHTS.synergyMax + 4, syn); // slightly higher cap for CX documented stacks
  const mis = mismatchPenalty(bladeLike, ratchet, bit);
  const mass = cxMassBonus(lockChip, assistBlade);
  const uNudge = usageNudge(lockChip, mainBlade, assistBlade, ratchet, bit);

  const rawComp =
    WEIGHTS.cxLock * (lockChip.scoreBase || 45) +
    WEIGHTS.cxMain * (mainBlade.scoreBase || 45) +
    WEIGHTS.cxAssist * (assistBlade.scoreBase || 45) +
    WEIGHTS.cxRatchet * (ratchet.scoreBase || 45) +
    WEIGHTS.cxBit * (bit.scoreBase || 45) +
    synCapped -
    mis +
    mass +
    uNudge;

  const extras = [];
  if (mass >= 6) extras.push("Metal lock + Heavy assist — high CX mass stack.");
  else if (assistBlade.id === "heavy") extras.push("Heavy Assist adds competitive CX mass.");
  if (cxStackBonus(lockChip, mainBlade, assistBlade) >= 5) {
    extras.push("Documented CX stack (Lock+Main+Assist) with tournament precedent.");
  }

  return finishScores({
    rawComp,
    bladeLike,
    ratchet,
    bit,
    costParts: [lockChip, mainBlade, assistBlade, ratchet, bit],
    string: comboStringCx(lockChip, mainBlade, assistBlade, ratchet, bit),
    extraStrengths: extras,
    breakdownExtra: {
      mode: "cx",
      lockBase: lockChip.scoreBase,
      mainBase: mainBlade.scoreBase,
      assistBase: assistBlade.scoreBase,
      cxMass: mass,
      cxStack: cxStackBonus(lockChip, mainBlade, assistBlade),
      synergy: synCapped,
      usageNudge: uNudge,
      usage: {
        lockChip: formatUsage(lockChip),
        mainBlade: formatUsage(mainBlade),
        assistBlade: formatUsage(assistBlade),
        ratchet: formatUsage(ratchet),
        bit: formatUsage(bit),
      },
    },
  });
}

export function gradeColor(g) {
  return { S: "#f5c542", A: "#6bcb77", B: "#8ec5ff", C: "#9aa8c7", D: "#ff6b6b" }[g] || "#9aa8c7";
}

export { formatUsage };
