/**
 * Beyblade X combo scorer — transparent coach estimates.
 *
 * Formula overview (all outputs clamped 0–100):
 *
 *  competitiveness =
 *    0.50 * blade.scoreBase
 *  + 0.25 * ratchet.scoreBase
 *  + 0.25 * bit.scoreBase
 *  + synergyBonus   (known best-combo / meta partners, +0..12)
 *  − mismatchPenalty (height/role clashes, 0..10)
 *
 *  metaBreak =
 *    disruptiveness from role mismatch & left-spin / expand quirks
 *  × performanceFloor (caps so trash random combos cannot score high)
 *  Cap: min(metaBreak, competitiveness + 8)
 *
 *  value =
 *    normalize( performanceProxy / estimatedHkdMid ) → 0–100
 *    where performanceProxy ≈ competitiveness
 *    and HKD mid = average of part (hkdMin+hkdMax)/2 sums
 *
 *  overall grade from competitiveness primarily, nudged by value:
 *    S ≥ 88, A ≥ 75, B ≥ 60, C ≥ 45, else D
 *
 * Weights are tunable via WEIGHTS below. Scores are coach estimates —
 * meta shifts; HK prices are ranges labeled "estimate".
 */

export const WEIGHTS = {
  blade: 0.5,
  ratchet: 0.25,
  bit: 0.25,
  synergyMax: 12,
  mismatchMax: 10,
  metaCapOverComp: 8,
  /** Soft floor: metaBreak cannot exceed competitiveness * this + headroom */
  metaPerformanceFactor: 0.85,
  valueScale: 55, // maps (perf / cost) into 0–100 band for typical HKD
  valueCostFloor: 80, // avoid divide-by-tiny
};

const TIER_RANK = { S: 5, A: 4, B: 3, C: 2, D: 1, Unranked: 2 };

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function midHkd(part) {
  const a = Number(part.hkdMin) || 0;
  const b = Number(part.hkdMax) || a;
  return (a + b) / 2;
}

function comboString(blade, ratchet, bit) {
  // Expand blades (Glory Valkyrie, Bullet Griffon) may omit ratchet in display
  const expand = /valkyrie|griffon/i.test(blade.name) && blade.notes?.toLowerCase().includes("expand");
  const r = ratchet?.abbr || ratchet?.name || "";
  const bAbbr = bit?.abbr || bit?.name || "";
  if (expand && (!ratchet || ratchet.id === "integrated")) {
    return `${blade.name} ${bAbbr}`.trim();
  }
  return `${blade.name} ${r} ${bit?.name || bAbbr}`.replace(/\s+/g, " ").trim();
}

function parseHeight(ratchet) {
  if (typeof ratchet.height === "number") return ratchet.height;
  const m = String(ratchet.abbr || ratchet.name || "").match(/-(\d+)/);
  return m ? Number(m[1]) : 60;
}

/**
 * Synergy: reward documented bestCombos / bestPartners and meta pairings.
 */
function synergyBonus(blade, ratchet, bit) {
  let bonus = 0;
  const rAbbr = (ratchet.abbr || "").toLowerCase();
  const bAbbr = (bit.abbr || "").toLowerCase();
  const bName = (bit.name || "").toLowerCase();
  const comboHay = [
    ...(blade.bestCombos || []),
    ...(ratchet.bestPartners || []),
    ...(bit.bestPartners || []),
  ]
    .join(" ")
    .toLowerCase();

  // Direct mentions of ratchet abbr or bit abbr/name in partner text
  if (rAbbr && comboHay.includes(rAbbr)) bonus += 4;
  if (bAbbr && (comboHay.includes(` ${bAbbr}`) || comboHay.includes(` ${bAbbr} `) || comboHay.endsWith(` ${bAbbr}`) || comboHay.includes(bAbbr.toLowerCase()))) {
    bonus += 4;
  }
  if (bName && comboHay.includes(bName)) bonus += 3;

  // Known meta pairings (from research snapshot Sep 2026)
  const bladeId = blade.id;
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
  ];
  for (const [bid, rNeed, bitKeys] of pairs) {
    if (bladeId === bid && rAbbr === rNeed) {
      bonus += 3;
      if (bitKeys.some((k) => bAbbr === k || bName.includes(k))) bonus += 4;
    }
  }

  // Same-type coherent builds
  const bladeType = blade.type || "";
  const bitType = bit.type || "";
  if (bladeType === "Stamina" && (bitType === "Stamina" || bitType === "Defense")) bonus += 2;
  if (bladeType === "Attack" && bitType === "Attack") bonus += 2;
  if (bladeType === "Defense" && (bitType === "Defense" || bitType === "Stamina")) bonus += 2;

  return Math.min(WEIGHTS.synergyMax, bonus);
}

function mismatchPenalty(blade, ratchet, bit) {
  let pen = 0;
  const h = parseHeight(ratchet);
  const bladeType = blade.type || "";
  const bitType = bit.type || "";

  // Tall ratchets generally avoided in meta
  if (h >= 80) pen += 5;
  else if (h >= 70 && bladeType === "Attack" && bitType === "Attack") pen += 1;

  // Weak protrusion sides (2 / 4) on competitive blades
  const prot = ratchet.protrusions;
  if (prot === 2) pen += 4;
  if (prot === 4 && h >= 60) pen += 2;

  // Role clash: pure stamina tip on hard attack blade without documented synergy
  if (bladeType === "Attack" && bitType === "Stamina" && (blade.tier === "S" || blade.tier === "A")) {
    // Scale FB is a known exception
    if (blade.id !== "shark-scale" && bit.id !== "free-ball") pen += 2;
  }
  if (bladeType === "Stamina" && bitType === "Attack") pen += 3;

  // Low-tier parts dragging S blades
  if (blade.tier === "S" && (TIER_RANK[ratchet.tier] || 0) <= 1) pen += 3;
  if (blade.tier === "S" && (TIER_RANK[bit.tier] || 0) <= 1) pen += 3;

  return Math.min(WEIGHTS.mismatchMax, pen);
}

function typeRole(blade, bit) {
  // Prefer blade primary; nudge if bit strongly shifts
  const b = blade.type || "Balance";
  const t = bit.type || "";
  if (b === "Balance" && t === "Attack") return "Attack";
  if (b === "Balance" && t === "Stamina") return "Stamina";
  if (b === "Balance" && t === "Defense") return "Defense";
  return b;
}

function coachNotes(blade, ratchet, bit, scores) {
  const strengths = [];
  const risks = [];
  const syn = synergyBonus(blade, ratchet, bit);
  const mis = mismatchPenalty(blade, ratchet, bit);

  if ((blade.tier === "S" || blade.tier === "A") && syn >= 6) {
    strengths.push("Documented meta pairing — high tournament precedent.");
  } else if (blade.tier === "S") {
    strengths.push(`${blade.name} is a top-cut blade; floor is high even on off-meta tips.`);
  }
  if ((blade.pros || [])[0]) strengths.push(blade.pros[0]);
  if ((bit.pros || [])[0]) strengths.push(`Bit: ${bit.pros[0]}`);
  if (parseHeight(ratchet) === 60) strengths.push("60-height ratchet — safest competitive stance.");

  if ((blade.cons || [])[0]) risks.push(blade.cons[0]);
  if (mis >= 5) risks.push("Part mismatch / tall or weak ratchet may leak bursts or scrapes.");
  if (scores.value < 40) risks.push("Pricey for the projected performance — check live HK listings.");
  if (blade.tier === "Unranked" || bit.tier === "Unranked") {
    risks.push("Sparse tournament sample — treat scores as soft estimates.");
  }
  if (!strengths.length) strengths.push("Coherent type stack; verify on your stadium.");
  if (!risks.length) risks.push("Meta shifts weekly — re-check BEYWATCH before events.");

  return { strengths: strengths.slice(0, 3), risks: risks.slice(0, 3) };
}

function gradeFrom(comp, value) {
  const nudged = comp * 0.85 + value * 0.15;
  if (nudged >= 88) return "S";
  if (nudged >= 75) return "A";
  if (nudged >= 60) return "B";
  if (nudged >= 45) return "C";
  return "D";
}

/**
 * @param {{blade: object, ratchet: object, bit: object}} parts
 * @returns {object} scores + notes
 */
export function scoreCombo({ blade, ratchet, bit }) {
  if (!blade || !ratchet || !bit) {
    return null;
  }

  const syn = synergyBonus(blade, ratchet, bit);
  const mis = mismatchPenalty(blade, ratchet, bit);

  const rawComp =
    WEIGHTS.blade * (blade.scoreBase || 45) +
    WEIGHTS.ratchet * (ratchet.scoreBase || 45) +
    WEIGHTS.bit * (bit.scoreBase || 45) +
    syn -
    mis;
  const competitiveness = clamp(rawComp);

  // Disruptiveness: left-spin, expand, role mismatch vs meta walls
  let disrupt = 0;
  if (/left/i.test(blade.notes || "") || /dragoon/i.test(blade.name)) disrupt += 18;
  if (/expand/i.test(blade.notes || "")) disrupt += 10;
  if (blade.type === "Attack" && bit.type === "Stamina") disrupt += 12; // Scale FB style
  if (blade.type === "Stamina" && bit.type === "Attack") disrupt += 8;
  if (syn >= 8) disrupt += 6;
  // Cap trash: multiply by performance floor
  let metaBreak = disrupt * WEIGHTS.metaPerformanceFactor + (competitiveness - 50) * 0.35;
  metaBreak = Math.min(metaBreak, competitiveness + WEIGHTS.metaCapOverComp);
  if (competitiveness < 40) metaBreak = Math.min(metaBreak, competitiveness * 0.7);
  metaBreak = clamp(metaBreak);

  const cost =
    midHkd(blade) + midHkd(ratchet) + midHkd(bit);
  const perf = Math.max(competitiveness, 1);
  const costSafe = Math.max(cost, WEIGHTS.valueCostFloor);
  // Higher perf per HKD → higher value. Typical strong combo ~200–350 HKD mid.
  const ratio = (perf / costSafe) * WEIGHTS.valueScale * 4.2;
  const value = clamp(ratio);

  const overall = gradeFrom(competitiveness, value);
  const role = typeRole(blade, bit);
  const notes = coachNotes(blade, ratchet, bit, { value, competitiveness });
  const string = comboString(blade, ratchet, bit);

  return {
    competitiveness,
    metaBreak,
    value,
    overall,
    estimatedHkd: Math.round(cost),
    hkdMin: Math.round(
      (Number(blade.hkdMin) || 0) + (Number(ratchet.hkdMin) || 0) + (Number(bit.hkdMin) || 0)
    ),
    hkdMax: Math.round(
      (Number(blade.hkdMax) || 0) + (Number(ratchet.hkdMax) || 0) + (Number(bit.hkdMax) || 0)
    ),
    typeRole: role,
    comboString: string,
    notes,
    breakdown: {
      bladeBase: blade.scoreBase,
      ratchetBase: ratchet.scoreBase,
      bitBase: bit.scoreBase,
      synergy: syn,
      mismatch: mis,
      weights: { ...WEIGHTS },
    },
  };
}

export function gradeColor(g) {
  return { S: "#f5c542", A: "#6bcb77", B: "#8ec5ff", C: "#9aa8c7", D: "#ff6b6b" }[g] || "#9aa8c7";
}
