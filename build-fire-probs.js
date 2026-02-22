#!/usr/bin/env node
/**
 * Generates FIRE_SPAWN_PROBABILITIES with standardized 4-group pattern:
 * - Intro: 1,2,3,4,5%
 * - Group 2: 10,15,20,25,30%
 * - Group 3: 35,40,45,50,55%
 * - Group 4: 55,50,45,40,25% (except cataclysm continues toward 100%)
 *
 * Cinder: 100% in G1, decreases to 0 by end of G5
 * Cataclysm: same pattern but after 55% continues toward 100% by G25
 */

const INTRO = [0.01, 0.02, 0.03, 0.04, 0.05];
const GRP2 = [0.10, 0.15, 0.20, 0.25, 0.30];
const GRP3 = [0.35, 0.40, 0.45, 0.50, 0.55];
const GRP4 = [0.55, 0.50, 0.45, 0.40, 0.25];

// Each type overlaps: prev g3/g4 overlaps next intro/g2
const TYPE_SCHEDULE = {
  flame: { intro: 2, g2: 3, g3: 4, g4: 5 },
  blaze: { intro: 3, g2: 4, g3: 5, g4: 6 },      // overlaps flame g3
  firestorm: { intro: 5, g2: 6, g3: 7, g4: 8 },  // overlaps blaze g3
  inferno: { intro: 7, g2: 8, g3: 9, g4: 10 },   // overlaps firestorm g3
  cataclysm: { intro: 9, g2: 10, g3: 11, g4: 12 }, // overlaps inferno g3
};

function getTypeValue(type, group, waveInGroup) {
  const s = TYPE_SCHEDULE[type];
  if (!s) return 0;
  // Cataclysm: skip g4 (55→25), after g3 (group 11) continue from 55% toward 100% by G25
  if (type === 'cataclysm' && group >= 12) {
    const wavesFromPeak = (group - 12) * 5 + waveInGroup;
    const totalWavesToEnd = (25 - 12) * 5 + 4;  // last wave of G25 gives t=1
    const t = wavesFromPeak / totalWavesToEnd;
    return Math.min(1, 0.55 + (1 - 0.55) * t);
  }
  if (group === s.intro) return INTRO[waveInGroup];
  if (group === s.g2) return GRP2[waveInGroup];
  if (group === s.g3) return GRP3[waveInGroup];
  if (group === s.g4) return GRP4[waveInGroup];
  return 0;
}

function getCinder(group, waveInGroup, othersSum) {
  if (group === 1) return 1;
  if (group >= 6) return 0;
  return Math.max(0, 1 - othersSum);
}

const rows = [];
for (let g = 1; g <= 25; g++) {
  for (let w = 0; w < 5; w++) {
    const others = {};
    let othersSum = 0;
    for (const t of ['flame', 'blaze', 'firestorm', 'inferno', 'cataclysm']) {
      others[t] = getTypeValue(t, g, w);
      othersSum += others[t];
    }
    // Cataclysm g3 (G11) and continuation (G12+): use inferno as complement so pattern shows (not 100% until last wave)
    if (g >= 11 && (others.cataclysm || 0) > 0 && (others.cataclysm || 0) < 1) {
      others.inferno = Math.round((1 - (others.cataclysm || 0)) * 100) / 100;
      othersSum = (others.cataclysm || 0) + (others.inferno || 0) + (others.firestorm || 0) + (others.blaze || 0) + (others.flame || 0);
    }
    let cinder = getCinder(g, w, othersSum);
    if (cinder < 0) cinder = 0;
    if (g === 5 && w === 4 && cinder > 0) {
      others.blaze = (others.blaze || 0) + cinder;
      cinder = 0;
    }
    const sum = cinder + Object.values(others).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      const diff = 1 - sum;
      const dominant = Object.entries(others).reduce((a, b) =>
        (b[1] || 0) > (a[1] || 0) ? b : a
      )[0];
      others[dominant] = (others[dominant] || 0) + diff;
    }
    rows.push({
      cinder: Math.round(cinder * 100) / 100,
      flame: Math.round((others.flame || 0) * 100) / 100,
      blaze: Math.round((others.blaze || 0) * 100) / 100,
      firestorm: Math.round((others.firestorm || 0) * 100) / 100,
      inferno: Math.round((others.inferno || 0) * 100) / 100,
      cataclysm: Math.round((others.cataclysm || 0) * 100) / 100,
    });
  }
}

// Re-normalize each row - round first, then fix sum
const TYPES = ['cinder', 'flame', 'blaze', 'firestorm', 'inferno', 'cataclysm'];
for (const row of rows) {
  for (const t of TYPES) row[t] = Math.round((row[t] || 0) * 100) / 100;
  let sum = TYPES.reduce((s, t) => s + row[t], 0);
  if (Math.abs(sum - 1) > 0.01) {
    const diff = 1 - sum;
    const dominant = TYPES.reduce((a, b) => (row[b] || 0) > (row[a] || 0) ? b : a);
    row[dominant] = Math.round((row[dominant] + diff) * 100) / 100;
  }
}

const DEFAULT_SPREAD = 0.0015;
function toEntry(p) {
  const prob = parseFloat(p.toFixed(2));
  const rate = prob > 0 ? Math.round(prob * DEFAULT_SPREAD * 1000000) / 1000000 : 0;
  return `[${prob.toFixed(2)}, ${rate}]`;
}

console.log('  FIRE_SPAWN_PROBABILITIES: [');
rows.forEach((r, i) => {
  if (i % 5 === 0) {
    const g = Math.floor(i / 5) + 1;
    console.log(`    // Wave Group ${g}`);
  }
  console.log(`    { cinder: ${toEntry(r.cinder)}, flame: ${toEntry(r.flame)}, blaze: ${toEntry(r.blaze)}, firestorm: ${toEntry(r.firestorm)}, inferno: ${toEntry(r.inferno)}, cataclysm: ${toEntry(r.cataclysm)} },`);
});
console.log('  ],');
