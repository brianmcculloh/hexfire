// Wave star ratings — 1/2/3 stars per wave, plus a Perfect center star.
// Requirements (also in CONFIG.STAR_RATING and the top-left HUD tooltip):
//   1 star  — complete the wave
//   2 stars — grove ends at full HP, and no towers destroyed
//   3 stars — 2-star plus no adjacent-hex fire spread onto/within the grove
//             (strikes do not disqualify)
//   Perfect — 3-star plus no extra dig-site damage, and total grove HP lost this wave
//             (strikes + spread + vortexes) ≤ STAR_RATING.PERFECT_GROVE_DAMAGE_FRACTION of max HP
//             (regen does not erase that total)

import { CONFIG } from '../config.js';
import { assetUrl } from '../utils/assetUrl.js';
import { prefersReducedModalMotion } from '../utils/modal.js';

export const STAR_EMPTY_SRC = 'assets/images/misc/star_empty.png';
export const STAR_FULL_SRC = 'assets/images/misc/star_full.png';
export const STAR_PERFECT_SRC = 'assets/images/misc/star_perfect.png';
export const STAR_SCORE_SRC = 'assets/images/misc/star_score.png';
export const PERFECT_MEDAL_SRC = 'assets/images/misc/perfect.png';

const GROVE_FULL_HEALTH_EPS = 0.05;

function starCfg() {
  return CONFIG.STAR_RATING || {};
}

function clampStars(n) {
  const v = Math.floor(Number(n) || 0);
  return Math.max(0, Math.min(3, v));
}

/**
 * @param {object} [json]
 * @returns {{ towersDestroyed: number, digSiteDamage: number, dungeonsFlooded: number, vortexesExtinguished: number }}
 */
export function emptyWaveStarTracking(json = null) {
  const src = json && typeof json === 'object' ? json : {};
  return {
    towersDestroyed: Math.max(0, Math.floor(Number(src.towersDestroyed)) || 0),
    digSiteDamage: Math.max(0, Number(src.digSiteDamage) || 0),
    dungeonsFlooded: Math.max(0, Math.floor(Number(src.dungeonsFlooded)) || 0),
    vortexesExtinguished: Math.max(0, Math.floor(Number(src.vortexesExtinguished)) || 0),
  };
}

/**
 * @param {unknown} raw
 * @returns {Array<{
 *   wave: number,
 *   waveGroup: number,
 *   waveInGroup: number,
 *   stars: number,
 *   perfect: boolean,
 *   criteria?: object,
 * }>}
 */
export function normalizeStarsByWave(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      wave: Math.max(1, Math.floor(Number(row.wave)) || 1),
      waveGroup: Math.max(1, Math.floor(Number(row.waveGroup)) || 1),
      waveInGroup: Math.max(1, Math.floor(Number(row.waveInGroup)) || 1),
      stars: clampStars(row.stars),
      perfect: !!row.perfect,
      criteria: row.criteria && typeof row.criteria === 'object' ? { ...row.criteria } : undefined,
    }));
}

/**
 * Score a wave from boolean criteria. See file header / CONFIG.STAR_RATING for the player-facing list.
 * @param {object} criteria
 * @returns {{ stars: number, perfect: boolean, criteria: object }}
 */
export function evaluateWaveStars(criteria = {}) {
  const groveFullHealth = !!criteria.groveFullHealth;
  const noTowersDestroyed = !!criteria.noTowersDestroyed;
  const noGroveSpread = !!criteria.noGroveSpread;
  const vortexExtinguished = !!criteria.vortexExtinguished;
  const dungeonFlooded = !!criteria.dungeonFlooded;
  const noDigSiteDamage = !!criteria.noDigSiteDamage;
  const groveDamageUnderCap = !!criteria.groveDamageUnderCap;

  const twoStar = groveFullHealth && noTowersDestroyed;
  const threeStar = twoStar && noGroveSpread;
  const perfect = threeStar && noDigSiteDamage && groveDamageUnderCap;

  let stars = 1;
  if (perfect || threeStar) stars = 3;
  else if (twoStar) stars = 2;

  return {
    stars,
    perfect,
    criteria: {
      groveFullHealth,
      noTowersDestroyed,
      noGroveSpread,
      vortexExtinguished,
      dungeonFlooded,
      noDigSiteDamage,
      groveDamageUnderCap,
    },
  };
}

/**
 * Group rating is the minimum across completed waves in that group.
 * Perfect only if every completed wave in the group is Perfect.
 * @param {Array<{ stars?: number, perfect?: boolean }>} waveResults
 * @returns {{ stars: number, perfect: boolean }}
 */
export function evaluateGroupStars(waveResults) {
  const rows = Array.isArray(waveResults) ? waveResults.filter(Boolean) : [];
  if (rows.length === 0) return { stars: 0, perfect: false };
  const minStars = Math.min(...rows.map((row) => clampStars(row.stars)));
  const allPerfect = rows.every((row) => !!row.perfect && clampStars(row.stars) >= 3);
  return { stars: minStars, perfect: allPerfect };
}

/**
 * HUD tooltip for the top-left score/star row. Copy matches evaluateWaveStars / CONFIG.STAR_RATING.
 * @returns {string} HTML
 */
export function getStarRatingHudTooltipHtml() {
  const frac = Number(starCfg().PERFECT_GROVE_DAMAGE_FRACTION);
  const pct = Number.isFinite(frac) ? Math.round(frac * 100) : 10;
  const row = (label, text) =>
    `<div style="margin-top: 6px;"><span style="color: #FFD54A; font-weight: 700;">${label}</span> ${text}</div>`;
  return `<div style="color: #FFFFFF; font-size: 13px; line-height: 1.45;">
    <div>Score: earn points by extinguishing fires.</div>
    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); font-weight: 700;">Stars per wave</div>
    ${row('1', 'Complete the wave.')}
    ${row('2', 'Grove ends at full HP, and no towers destroyed.')}
    ${row('3', 'Also no fire spread onto or within the grove (strikes do not count).')}
    ${row('Perfect', `Also no dig site damage, and total grove HP lost this wave ≤ ${pct}% of max (strikes, spread, and vortexes count; healing does not undo it).`)}
  </div>`;
}

/**
 * @param {Array<{ stars?: number, perfect?: boolean }>|null|undefined} rows
 * @returns {number}
 */
export function sumStarsEarned(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => sum + clampStars(row?.stars), 0);
}

/**
 * @param {Array<{ perfect?: boolean }>|null|undefined} rows
 * @returns {number}
 */
export function countPerfectWaves(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => sum + (row?.perfect ? 1 : 0), 0);
}

function getStarsByWaveFromState(gameState) {
  return normalizeStarsByWave(gameState?.runStats?.data?.starsByWave);
}

/**
 * @param {object} gameState
 * @returns {number}
 */
export function getTotalStarsEarned(gameState) {
  return sumStarsEarned(getStarsByWaveFromState(gameState));
}

/**
 * @param {object} gameState
 * @returns {number}
 */
export function getPerfectWaveCount(gameState) {
  return countPerfectWaves(getStarsByWaveFromState(gameState));
}

/**
 * @param {object} gameState
 * @param {number} waveGroup
 * @returns {Array<object>}
 */
export function getWaveStarResultsForGroup(gameState, waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  return getStarsByWaveFromState(gameState).filter((row) => row.waveGroup === g);
}

/**
 * @param {object} gameState
 * @param {number} waveGroup
 * @returns {{ stars: number, perfect: boolean }}
 */
export function getGroupStarResult(gameState, waveGroup) {
  return evaluateGroupStars(getWaveStarResultsForGroup(gameState, waveGroup));
}

/**
 * Snapshot live wave performance and score it.
 * @param {object} gameState
 * @param {{
 *   groveDamage?: number,
 *   vortexesExtinguished?: number,
 * }} [live]
 * @returns {object} criteria used by {@link evaluateWaveStars}
 */
export function collectWaveStarCriteria(gameState, live = {}) {
  const townCenter = gameState?.gridSystem?.getTownCenter?.();
  const maxHealth = Math.max(1, Number(townCenter?.maxTownHealth) || CONFIG.TOWN_HEALTH_BASE || 1);
  const currentHealth = Number(townCenter?.townHealth);
  const groveHp = Number.isFinite(currentHealth) ? currentHealth : maxHealth;
  const groveDamage = Math.max(0, Number(live.groveDamage ?? gameState?.gridSystem?.getTownDamageThisWave?.()) || 0);
  const tracking = emptyWaveStarTracking(gameState?.runStats?.data?.waveStarTracking);
  const liveVortexes = Math.max(
    0,
    Math.floor(Number(live.vortexesExtinguished ?? gameState?.vortexSystem?.getTotalVortexesExtinguishedThisWave?.())) || 0
  );
  const vortexes = Math.max(liveVortexes, tracking.vortexesExtinguished);
  const perfectFraction = Number(starCfg().PERFECT_GROVE_DAMAGE_FRACTION);
  const damageCap = Number.isFinite(perfectFraction) ? perfectFraction : 0.1;
  const groveEps = Number(starCfg().GROVE_FULL_HEALTH_EPSILON);
  const hpEps = Number.isFinite(groveEps) ? groveEps : GROVE_FULL_HEALTH_EPS;

  return {
    groveFullHealth: groveHp >= maxHealth - hpEps,
    noTowersDestroyed: tracking.towersDestroyed <= 0,
    // 3-star: adjacent-hex spread onto/within the grove only (strikes do not count).
    noGroveSpread: !gameState?.gridSystem?.hadTownSpreadFireThisWave?.(),
    vortexExtinguished: vortexes >= 1,
    dungeonFlooded: tracking.dungeonsFlooded >= 1,
    noDigSiteDamage: tracking.digSiteDamage <= 1e-4,
    // Perfect: cumulative HP lost from every fire source this wave (strikes + spread + vortexes).
    groveDamageUnderCap: maxHealth > 0 ? groveDamage / maxHealth <= damageCap + 1e-9 : false,
  };
}

/**
 * Evaluate the completed wave, persist the result, and return it for UI.
 * @param {object} gameState
 * @param {{
 *   completedWave: number,
 *   completedWaveGroup: number,
 *   completedWaveInGroup: number,
 *   groveDamage?: number,
 *   vortexesExtinguished?: number,
 * }} ctx
 * @returns {{ stars: number, perfect: boolean, criteria: object, wave: number, waveGroup: number, waveInGroup: number }}
 */
export function evaluateAndRecordWaveStars(gameState, ctx) {
  const completedWave = Math.max(1, Math.floor(Number(ctx?.completedWave)) || 1);
  const completedWaveGroup = Math.max(1, Math.floor(Number(ctx?.completedWaveGroup)) || 1);
  const completedWaveInGroup = Math.max(1, Math.floor(Number(ctx?.completedWaveInGroup)) || 1);
  const forceStars = ctx?.forceStars != null ? clampStars(ctx.forceStars) : null;
  const scored = forceStars != null
    ? {
      stars: forceStars,
      perfect: !!ctx.forcePerfect && forceStars >= 3,
      criteria: {
        groveFullHealth: forceStars >= 2,
        noTowersDestroyed: forceStars >= 2,
        noGroveSpread: forceStars >= 3,
        vortexExtinguished: forceStars >= 3,
        dungeonFlooded: forceStars >= 3,
        noDigSiteDamage: !!ctx.forcePerfect && forceStars >= 3,
        groveDamageUnderCap: !!ctx.forcePerfect && forceStars >= 3,
      },
    }
    : evaluateWaveStars(collectWaveStarCriteria(gameState, ctx));
  const row = {
    wave: completedWave,
    waveGroup: completedWaveGroup,
    waveInGroup: completedWaveInGroup,
    stars: scored.stars,
    perfect: scored.perfect,
    criteria: scored.criteria,
  };
  gameState?.runStats?.recordWaveStars?.(row);
  if (gameState?.wave) gameState.wave.lastStarResult = row;
  return row;
}

function starSrc(kind) {
  if (kind === 'perfect') return assetUrl(STAR_PERFECT_SRC);
  if (kind === 'full') return assetUrl(STAR_FULL_SRC);
  return assetUrl(STAR_EMPTY_SRC);
}

function appendStarFill(el, kind, { animate = false, delayIndex = 0 } = {}) {
  const fill = document.createElement('img');
  fill.className = 'star-rating-fill';
  if (kind === 'perfect') fill.classList.add('star-rating-fill--perfect');
  fill.src = starSrc(kind);
  fill.alt = '';
  fill.draggable = false;
  if (animate) {
    fill.classList.add('star-rating-fill--pop');
    fill.style.animationDelay = `${delayIndex * 280}ms`;
  }
  el.appendChild(fill);
}

/**
 * Three overlapping star slots (empty always visible; filled stars layered on top).
 * Perfect adds a trophy overlay on the center star as a fourth image.
 * @param {{ stars?: number, perfect?: boolean }} result
 * @param {{ animate?: boolean, size?: 'modal' | 'map' | 'cinematic' }} [opts]
 * @returns {HTMLElement}
 */
export function createStarRatingElement(result, opts = {}) {
  const stars = clampStars(result?.stars);
  const perfect = !!result?.perfect && stars >= 3;
  const animate = !!opts.animate && stars > 0 && !prefersReducedModalMotion();
  const size = opts.size === 'map' || opts.size === 'cinematic' ? opts.size : 'modal';
  const animateFills = animate && size !== 'cinematic';

  const wrap = document.createElement('div');
  wrap.className = `star-rating star-rating--${size}`;
  wrap.setAttribute('aria-label', perfect ? 'Perfect — 3 stars' : `${stars} of 3 stars`);
  wrap.setAttribute('role', 'img');

  // Fill order: 1 = left, 2 = left+center, 3 = all three; Perfect overlays the center afterward.
  const slotMeta = [
    { key: 'left', fillIf: stars >= 1 },
    { key: 'mid', fillIf: stars >= 2 },
    { key: 'right', fillIf: stars >= 3 },
  ];

  let fillIndex = 0;
  for (const slot of slotMeta) {
    const el = document.createElement('div');
    el.className = `star-rating-slot star-rating-slot--${slot.key}`;

    const empty = document.createElement('img');
    empty.className = 'star-rating-empty';
    empty.src = starSrc('empty');
    empty.alt = '';
    empty.draggable = false;
    el.appendChild(empty);

    if (slot.fillIf) {
      appendStarFill(el, 'full', { animate: animateFills, delayIndex: fillIndex });
      if (animateFills) fillIndex += 1;
    }

    wrap.appendChild(el);
  }

  if (perfect) {
    const mid = wrap.querySelector('.star-rating-slot--mid');
    if (mid) appendStarFill(mid, 'perfect', { animate: animateFills, delayIndex: fillIndex });
  }

  return wrap;
}

const CINEMATIC_MASK_IN_MS = 160;
const CINEMATIC_STAGGER_MS = 460;
const CINEMATIC_POP_MS = 560;
const CINEMATIC_HOLD_MS = 360;
const CINEMATIC_FLY_MS = 640;
const CINEMATIC_PERFECT_FINALE_MS = 780;
const STAR_SHOW_SEMITONE_CENTS = 100;

let cinematicCleanup = null;
let cinematicActive = false;

/**
 * True while the wave-complete star showcase is on screen.
 * Game canvas rendering skips this window so the overlay isn't fighting the map for GPU time.
 */
export function isStarCinematicActive() {
  return cinematicActive;
}

/**
 * Tear down any in-flight wave-complete star showcase.
 */
export function teardownStarCinematic() {
  cinematicCleanup?.();
  cinematicCleanup = null;
  cinematicActive = false;
  document.querySelectorAll('.star-cinematic').forEach((el) => el.remove());
}

function playStarShowSfx(index, { perfect = false } = {}) {
  const am = typeof window !== 'undefined' ? window.AudioManager : null;
  if (!am?.playSFX) return;
  am.playSFX('star_show', {
    detune: index * STAR_SHOW_SEMITONE_CENTS,
    maxConcurrent: 6,
  });
  if (perfect) {
    am.playSFX('star_show_perfect', { maxConcurrent: 4, volumeMultiplier: 4.5 });
  }
}

/** 1–3 from stars earned; 4 when Perfect (fourth center beat). */
function flourishTier(result) {
  const stars = clampStars(result?.stars);
  if (!!result?.perfect && stars >= 3) return 4;
  return stars;
}

function slotFxForFlourish(flourish) {
  return {
    1: { sparks: 4, rings: 0, shards: 0, orbit: 0 },
    2: { sparks: 24, rings: 2, shards: 14, orbit: 6 },
    3: { sparks: 42, rings: 3, shards: 24, orbit: 12 },
    4: { sparks: 56, rings: 4, shards: 32, orbit: 16 },
  }[flourish] || { sparks: 8, rings: 1, shards: 0, orbit: 0 };
}

function applySpinVars(fill, index, flourish) {
  const mag = [0, 52, 100, 148, 210][flourish] || 100;
  const dir = index % 2 === 0 ? -1 : 1;
  fill.style.setProperty('--spin-from', `${dir * mag}deg`);
  fill.style.setProperty('--spin-mid', `${-dir * Math.round(mag * 0.12)}deg`);
  fill.style.setProperty('--spin-back', `${dir * Math.round(mag * 0.04)}deg`);
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeRadialSprite(size, inner, mid) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.38, inner);
  g.addColorStop(0.42, mid);
  g.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function paintSunburstWedges(ctx, size, periodDeg, gold, cyan, goldSpan, cyanSpan, goldStart, cyanStart) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2;
  const period = (periodDeg * Math.PI) / 180;
  const goldA0 = (goldStart * Math.PI) / 180;
  const goldA1 = ((goldStart + goldSpan) * Math.PI) / 180;
  const cyanA0 = (cyanStart * Math.PI) / 180;
  const cyanA1 = ((cyanStart + cyanSpan) * Math.PI) / 180;
  const steps = Math.ceil(360 / periodDeg);
  for (let i = 0; i < steps; i++) {
    const base = i * period;
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, base + goldA0, base + goldA1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cyan;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, base + cyanA0, base + cyanA1);
    ctx.closePath();
    ctx.fill();
  }
  const fade = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius * 0.7);
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(0.38, 'rgba(0, 0, 0, 0.65)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
}

function makeSunburstBitmap(alt) {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (alt) {
    paintSunburstWedges(
      ctx, size, 28,
      'rgba(255, 236, 170, 0.2)', 'rgba(255, 120, 60, 0.1)',
      2, 2, 12, 15,
    );
  } else {
    paintSunburstWedges(
      ctx, size, 24,
      'rgba(255, 215, 0, 0.16)', 'rgba(125, 211, 252, 0.08)',
      3, 2, 10, 14,
    );
  }
  return c;
}

function burstOrigin(slot) {
  const r = slot.getBoundingClientRect();
  return {
    x: r.left + r.width * 0.5,
    y: r.top + r.height * 0.364,
    ringY: r.top + r.height * 0.466,
    orbitR: Math.max(r.width, r.height) * 0.42,
    slot,
  };
}

const SPARK_SPRITE = makeRadialSprite(32, '#ffffff', '#ffd700');
const MOTE_SPRITE = makeRadialSprite(24, '#ffffff', '#ffd24a');
const BEAD_SPRITE = makeRadialSprite(16, '#fff6c2', 'rgba(255, 230, 140, 0.2)');

const RAY_OPACITY = [0, 0.16, 0.4, 0.72, 1];
const MOTE_MAX = [0, 0.28, 0.45, 0.65, 0.9];
const RAY_SPIN_SEC = [0, 28, 22, 16, 12];
const MOTE_COUNTS = [0, 3, 22, 40, 64];

let cachedSunA = null;
let cachedSunB = null;

/**
 * One (or two) full-screen canvases replace hundreds of CSS-animated DOM particles.
 * Stars stay as DOM images so the FLIP fly-to-header still works.
 */
function createCinematicFx(overlay, flourish) {
  const rayCanvas = document.createElement('canvas');
  rayCanvas.className = 'star-cinematic-ray-canvas';
  const fxCanvas = document.createElement('canvas');
  fxCanvas.className = 'star-cinematic-fx-canvas';
  overlay.appendChild(rayCanvas);
  overlay.appendChild(fxCanvas);

  const rayCtx = rayCanvas.getContext('2d', { alpha: true });
  const fxCtx = fxCanvas.getContext('2d', { alpha: true });
  const sunA = cachedSunA || (cachedSunA = makeSunburstBitmap(false));
  const sunB = flourish >= 4 ? (cachedSunB || (cachedSunB = makeSunburstBitmap(true))) : null;
  const raySpinMs = (RAY_SPIN_SEC[flourish] || 18) * 1000;
  const moteMax = MOTE_MAX[flourish] || 0.55;
  const particles = [];
  const motes = [];
  const orbits = [];
  const startedAt = performance.now();
  let surge = false;
  let outro = false;
  let outroAt = 0;
  let appeared = false;
  let appearedAt = 0;
  let rafId = 0;
  let running = true;
  let lastCssW = 0;
  let lastCssH = 0;

  const vw = () => overlay.clientWidth || window.innerWidth;
  const vh = () => overlay.clientHeight || window.innerHeight;

  function fit(canvas, ctx) {
    const w = vw();
    const h = vh();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      lastCssW = w;
      lastCssH = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const moteCount = MOTE_COUNTS[flourish] || 0;
  for (let i = 0; i < moteCount; i++) {
    const gx = (i * 0.61803398875) % 1;
    const gy = (i * 0.7548776662 + 0.17) % 1;
    motes.push({
      x: (gx * 96 - 48) / 100,
      y: (gy * 82 - 41) / 100,
      delay: ((i * 0.137) % 1.25) * 1000,
      dur: (2.4 + (i % 7) * 0.28) * 1000,
      size: 5 + (i % 5) * 2,
    });
  }

  function spawnBurst(slot, counts) {
    const { sparks = 0, rings = 0, shards = 0, orbit = 0 } = counts;
    const o = burstOrigin(slot);
    const now = performance.now();
    for (let i = 0; i < sparks; i++) {
      particles.push({
        kind: 'spark',
        ox: o.x,
        oy: o.y,
        a: (((360 / Math.max(sparks, 1)) * i + (i % 3) * 7) * Math.PI) / 180,
        d: 64 + (i % 6) * 16,
        born: now + (i % 5) * 16,
        life: 620,
      });
    }
    for (let i = 0; i < rings; i++) {
      particles.push({
        kind: 'ring',
        ox: o.x,
        oy: o.ringY,
        born: now + i * 95,
        life: 680,
        base: Math.max(o.orbitR * 0.55, 36),
      });
    }
    for (let i = 0; i < shards; i++) {
      particles.push({
        kind: 'shard',
        ox: o.x,
        oy: o.y,
        a: (((360 / Math.max(shards, 1)) * i + 11) * Math.PI) / 180,
        born: now + (i % 4) * 22,
        life: 720,
      });
    }
    for (let i = 0; i < orbit; i++) {
      orbits.push({
        slot,
        a: ((360 / Math.max(orbit, 1)) * i * Math.PI) / 180,
        born: now,
      });
    }
  }

  function spawnPerfectFinale(midSlot) {
    surge = true;
    overlay.classList.add('is-perfect-surge');
    const now = performance.now();
    const cx = vw() * 0.5;
    const cy = vh() * 0.48;
    particles.push({ kind: 'flash', ox: cx, oy: cy, born: now, life: 700 });
    for (let i = 0; i < 5; i++) {
      particles.push({
        kind: 'pring',
        ox: cx,
        oy: cy,
        born: now + i * 90,
        life: 850,
        base: Math.min(vw(), vh()) * 0.12,
      });
    }
    particles.push({ kind: 'flare', ox: cx, oy: cy, born: now, life: 650 });
    const colors = ['#fff6c2', '#ffd24a', '#7dd3fc'];
    for (let i = 0; i < 96; i++) {
      particles.push({
        kind: 'confetti',
        ox: cx,
        oy: cy,
        a: (((360 / 96) * i + (i % 5) * 3) * Math.PI) / 180,
        d: 110 + (i % 10) * 26,
        rot: ((i * 37) % 360) * Math.PI / 180,
        color: colors[i % 3],
        born: now + (i % 8) * 14,
        life: 950,
      });
    }
    if (midSlot) {
      midSlot.classList.add('is-perfect-finale');
      spawnBurst(midSlot, { sparks: 64, rings: 6, shards: 28, orbit: 18 });
    }
  }

  function drawMotes(ctx, now) {
    if (!appeared) return;
    const w = vw();
    const h = vh();
    const ox = w * 0.5;
    const oy = h * 0.48;
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const t = ((now - startedAt - m.delay) % m.dur) / m.dur;
      if (t < 0) continue;
      const mx = m.x * w;
      const my = m.y * h;
      let op = 0;
      let x = mx;
      let y = my;
      let s = 0.4;
      if (t < 0.2) {
        const k = t / 0.2;
        op = lerp(0, moteMax, k);
        s = lerp(0.4, 0.52, k);
      } else if (t < 0.5) {
        const k = (t - 0.2) / 0.3;
        op = lerp(moteMax, moteMax * 0.7, k);
        x = lerp(mx, mx * 0.7, k);
        y = lerp(my, my - h * 0.06, k);
        s = lerp(0.52, 1, k);
      } else if (t < 0.8) {
        const k = (t - 0.5) / 0.3;
        op = lerp(moteMax * 0.7, 0.25, k);
        x = lerp(mx * 0.7, mx * 0.85, k);
        y = lerp(my - h * 0.06, my - h * 0.03, k);
        s = lerp(1, 0.7, k);
      } else {
        const k = (t - 0.8) / 0.2;
        op = lerp(0.25, 0, k);
        x = lerp(mx * 0.85, mx, k);
        y = lerp(my - h * 0.03, my, k);
        s = lerp(0.7, 0.4, k);
      }
      if (op <= 0.01) continue;
      const size = m.size * s;
      ctx.globalAlpha = outro ? op * Math.max(0, 1 - (now - outroAt) / 500) : op;
      ctx.drawImage(MOTE_SPRITE, ox + x - size / 2, oy + y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(ctx, now) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const raw = (now - p.born) / p.life;
      if (raw < 0) continue;
      if (raw >= 1) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      const t = easeOutQuad(raw);
      if (p.kind === 'spark') {
        const ty = lerp(8, -p.d, t);
        const x = p.ox + Math.sin(p.a) * ty;
        const y = p.oy + Math.cos(p.a) * ty;
        const s = lerp(9, 1.2, t);
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(SPARK_SPRITE, x - s / 2, y - s / 2, s, s);
      } else if (p.kind === 'shard') {
        const ty = lerp(6, -108, t);
        const x = p.ox + Math.sin(p.a) * ty;
        const y = p.oy + Math.cos(p.a) * ty;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.a);
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(-1.5, -8, 3, lerp(16, 6, t));
        ctx.restore();
      } else if (p.kind === 'ring' || p.kind === 'pring') {
        const scale = p.kind === 'pring' ? lerp(0.15, 6.2, t) : lerp(0.2, 2.35, t);
        const r = p.base * scale;
        ctx.globalAlpha = (p.kind === 'pring' ? 0.95 : 0.85) * (1 - t);
        ctx.strokeStyle = 'rgba(255, 224, 140, 0.9)';
        ctx.lineWidth = p.kind === 'pring' ? 3 : 2;
        ctx.beginPath();
        ctx.arc(p.ox, p.oy, Math.max(1, r), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'flash') {
        const r = Math.min(vw(), vh()) * 0.28 * lerp(0.2, 2.4, t);
        const g = ctx.createRadialGradient(p.ox, p.oy, 0, p.ox, p.oy, r);
        g.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
        g.addColorStop(0.32, 'rgba(255, 210, 70, 0.45)');
        g.addColorStop(1, 'rgba(255, 210, 70, 0)');
        ctx.globalAlpha = 0.95 * (1 - t);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.ox, p.oy, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'flare') {
        const op = raw < 0.24 ? raw / 0.24 : 1 - (raw - 0.24) / 0.76;
        const sx = raw < 0.24 ? lerp(0.15, 1, raw / 0.24) : lerp(1, 1.05, (raw - 0.24) / 0.76);
        ctx.globalAlpha = Math.max(0, op);
        ctx.save();
        ctx.translate(p.ox, p.oy);
        ctx.scale(sx, 1);
        const grd = ctx.createLinearGradient(-vw() * 0.45, 0, vw() * 0.45, 0);
        grd.addColorStop(0, 'rgba(255, 240, 180, 0)');
        grd.addColorStop(0.45, 'rgba(255, 240, 180, 0.95)');
        grd.addColorStop(0.5, '#ffffff');
        grd.addColorStop(0.55, 'rgba(255, 240, 180, 0.95)');
        grd.addColorStop(1, 'rgba(255, 240, 180, 0)');
        ctx.fillStyle = grd;
        ctx.fillRect(-vw() * 0.45, -2, vw() * 0.9, 4);
        ctx.restore();
      } else if (p.kind === 'confetti') {
        const ty = lerp(8, -p.d, t);
        const x = p.ox + Math.sin(p.a) * ty;
        const y = p.oy + Math.cos(p.a) * ty;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.a + p.rot * t);
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.color;
        const s = lerp(8, 3.2, t);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawOrbits(ctx, now) {
    const fade = outro ? Math.max(0, 1 - (now - outroAt) / 500) : 1;
    if (fade <= 0.01) return;
    const spin = ((now - startedAt) / 3600) * Math.PI * 2;
    ctx.globalAlpha = 0.9 * fade;
    for (let i = 0; i < orbits.length; i++) {
      const o = orbits[i];
      if (!o.slot?.isConnected) continue;
      const origin = burstOrigin(o.slot);
      const a = o.a + spin;
      const x = origin.x + Math.sin(a) * origin.orbitR;
      const y = origin.y + Math.cos(a) * origin.orbitR;
      ctx.drawImage(BEAD_SPRITE, x - 3.5, y - 3.5, 7, 7);
    }
    ctx.globalAlpha = 1;
  }

  function drawRays(now) {
    fit(rayCanvas, rayCtx);
    rayCtx.clearRect(0, 0, lastCssW, lastCssH);
    let op = RAY_OPACITY[flourish] || 0.42;
    if (surge) op = 1;
    if (!appeared) op = 0;
    else op *= Math.min(1, (now - appearedAt) / 350);
    if (outro) op *= Math.max(0, 1 - (now - outroAt) / 500);
    if (op <= 0.01) return;
    const cx = lastCssW * 0.5;
    const cy = lastCssH * 0.5;
    const cover = Math.max(lastCssW, lastCssH) * 1.4;
    const ang = ((now - startedAt) / raySpinMs) * Math.PI * 2;
    rayCtx.save();
    rayCtx.translate(cx, cy);
    rayCtx.rotate(ang);
    rayCtx.globalAlpha = op;
    rayCtx.drawImage(sunA, -cover / 2, -cover / 2, cover, cover);
    rayCtx.restore();
    if (sunB) {
      rayCtx.save();
      rayCtx.translate(cx, cy);
      rayCtx.rotate(-ang / 1.4);
      rayCtx.globalAlpha = op * 0.55;
      rayCtx.drawImage(sunB, -cover / 2, -cover / 2, cover, cover);
      rayCtx.restore();
    }
  }

  function frame(now) {
    if (!running || !rayCtx || !fxCtx) return;
    drawRays(now);
    fit(fxCanvas, fxCtx);
    fxCtx.clearRect(0, 0, lastCssW, lastCssH);
    drawMotes(fxCtx, now);
    drawParticles(fxCtx, now);
    drawOrbits(fxCtx, now);
    rafId = window.requestAnimationFrame(frame);
  }

  rafId = window.requestAnimationFrame(frame);

  return {
    spawnBurst,
    spawnPerfectFinale,
    setOn() {
      appeared = true;
      appearedAt = performance.now();
    },
    setOutro() {
      outro = true;
      outroAt = performance.now();
    },
    destroy() {
      running = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      rayCanvas.remove();
      fxCanvas.remove();
    },
  };
}

function waitForStarImages(root) {
  const imgs = [...(root?.querySelectorAll?.('img') || [])];
  return Promise.all(
    imgs.map((img) => (typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve()))
  );
}

function readSlotTransform(el) {
  const raw = getComputedStyle(el).transform;
  if (!raw || raw === 'none') return { tx: 0, ty: 0, sx: 1, sy: 1 };
  const m = new DOMMatrix(raw);
  return { tx: m.e, ty: m.f, sx: m.a, sy: m.d };
}

function afterMs(ms, timers) {
  return new Promise((resolve) => {
    const id = window.setTimeout(resolve, ms);
    timers.push(id);
  });
}

function placePerfectWord(overlay, midSlot) {
  if (!overlay || !midSlot) return;
  overlay.querySelectorAll('.star-cinematic-perfect-word').forEach((el) => el.remove());
  const word = document.createElement('div');
  word.className = 'star-cinematic-perfect-word';
  word.textContent = 'PERFECT';
  overlay.appendChild(word);
  const ob = overlay.getBoundingClientRect();
  const r = midSlot.getBoundingClientRect();
  word.style.left = `${r.left + r.width * 0.5 - ob.left}px`;
  word.style.top = `${r.top - ob.top}px`;
  void word.offsetWidth;
  word.classList.add('is-on');
}

/**
 * Full-screen star pops, then FLIP-fly each slot onto the header cluster.
 * @param {HTMLElement} headerCluster
 * @param {{ stars?: number, perfect?: boolean }} result
 */
async function playStarCinematic(headerCluster, result) {
  teardownStarCinematic();
  if (!headerCluster?.isConnected) {
    headerCluster?.classList.remove('is-cinematic-pending');
    return;
  }

  const timers = [];
  const flourish = flourishTier(result);
  const overlay = document.createElement('div');
  overlay.className = 'star-cinematic';
  overlay.dataset.flourish = String(flourish);
  overlay.setAttribute('aria-hidden', 'true');

  const mask = document.createElement('div');
  mask.className = 'star-cinematic-mask';
  const cineCluster = createStarRatingElement(result, { animate: false, size: 'cinematic' });
  const slotFx = slotFxForFlourish(flourish);

  overlay.appendChild(mask);
  cinematicActive = true;
  document.body.appendChild(overlay);
  const fx = createCinematicFx(overlay, flourish);
  overlay.appendChild(cineCluster);

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    cinematicActive = false;
    fx.destroy();
    headerCluster.classList.remove('is-cinematic-pending');
    overlay.remove();
  };

  cinematicCleanup = () => {
    timers.forEach((id) => window.clearTimeout(id));
    finish();
  };

  await waitForStarImages(cineCluster);
  await waitForStarImages(headerCluster);
  void overlay.offsetWidth;
  overlay.classList.add('is-on');
  fx.setOn();

  const perfectFill = cineCluster.querySelector('.star-rating-fill--perfect');
  const fills = [
    cineCluster.querySelector('.star-rating-slot--left > .star-rating-fill:not(.star-rating-fill--perfect)'),
    cineCluster.querySelector('.star-rating-slot--mid > .star-rating-fill:not(.star-rating-fill--perfect)'),
    cineCluster.querySelector('.star-rating-slot--right > .star-rating-fill:not(.star-rating-fill--perfect)'),
    perfectFill,
  ].filter(Boolean);
  const perfect = !!perfectFill;
  fills.forEach((fill, i) => {
    if (fill !== perfectFill) applySpinVars(fill, i, flourish);
  });
  await afterMs(CINEMATIC_MASK_IN_MS + 80, timers);

  fills.forEach((fill, i) => {
    const id = window.setTimeout(() => {
      fill.classList.add('is-popped');
      fill.parentElement?.classList.add('is-popped');
      playStarShowSfx(i, { perfect: fill === perfectFill });
      if (fill === perfectFill) {
        fx.spawnPerfectFinale(fill.parentElement);
        placePerfectWord(overlay, fill.parentElement);
      } else if (fill.parentElement) {
        fx.spawnBurst(fill.parentElement, slotFx);
      }
    }, i * CINEMATIC_STAGGER_MS);
    timers.push(id);
  });

  const popSpan = fills.length > 0
    ? (fills.length - 1) * CINEMATIC_STAGGER_MS + CINEMATIC_POP_MS
    : 0;
  const finalePad = perfect ? Math.max(0, CINEMATIC_PERFECT_FINALE_MS - CINEMATIC_POP_MS) : 0;
  await afterMs(popSpan + finalePad + CINEMATIC_HOLD_MS, timers);
  if (settled || !headerCluster.isConnected) {
    finish();
    return;
  }

  const cineSlots = [...cineCluster.querySelectorAll('.star-rating-slot')];
  const headerSlots = [...headerCluster.querySelectorAll('.star-rating-slot')];
  const flights = cineSlots.map((slot, i) => {
    const dest = headerSlots[i];
    if (!dest) return null;
    const from = slot.getBoundingClientRect();
    const to = dest.getBoundingClientRect();
    if (from.width < 2 || to.width < 2) return null;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const { tx, ty, sx: startSx, sy: startSy } = readSlotTransform(slot);
    return {
      slot,
      start: `translate(${tx}px, ${ty}px) scale(${startSx}, ${startSy})`,
      end: `translate(${tx + dx}px, ${ty + dy}px) scale(${startSx * (to.width / from.width)}, ${startSy * (to.height / from.height)})`,
    };
  }).filter(Boolean);

  // Bake the mid-star's translateY(-11%) into the same translate+scale list as the flanks
  // so all three interpolate together (otherwise the mid drifts down, then snaps).
  flights.forEach(({ slot, start }) => {
    slot.style.transition = 'none';
    slot.style.transformOrigin = 'center center';
    slot.style.transform = start;
  });
  void cineCluster.offsetWidth;
  flights.forEach(({ slot, end }) => {
    slot.style.transition = `transform ${CINEMATIC_FLY_MS}ms cubic-bezier(0.22, 0.82, 0.28, 1)`;
    slot.style.transform = end;
  });
  fx.setOutro();
  overlay.classList.add('is-outro');

  await afterMs(CINEMATIC_FLY_MS + 40, timers);
  finish();
  if (cinematicCleanup) cinematicCleanup = null;
}

/**
 * Overlay the 3-star cluster on a wave-complete header banner.
 * @param {HTMLElement} headerContainer
 * @param {{ stars?: number, perfect?: boolean }|null|undefined} result
 * @param {{ animate?: boolean }} [opts]
 */
export function attachStarRatingToHeader(headerContainer, result, opts = {}) {
  if (!headerContainer) return;
  teardownStarCinematic();
  headerContainer.querySelectorAll('.wave-complete-star-rating').forEach((el) => el.remove());
  if (!result) return;
  const runCinematic = opts.animate !== false && clampStars(result.stars) > 0 && !prefersReducedModalMotion();
  const cluster = createStarRatingElement(result, {
    animate: !runCinematic && opts.animate !== false,
    size: 'modal',
  });
  cluster.classList.add('wave-complete-star-rating');
  if (runCinematic) cluster.classList.add('is-cinematic-pending');
  headerContainer.appendChild(cluster);
  if (!runCinematic) return;

  const start = () => {
    if (!cluster.isConnected) {
      requestAnimationFrame(start);
      return;
    }
    void playStarCinematic(cluster, result);
  };
  requestAnimationFrame(start);
}

/**
 * Most recently recorded wave star result (for wave-complete UI after load).
 * @param {object} gameState
 * @returns {{ stars: number, perfect: boolean, criteria?: object, wave?: number }|null}
 */
export function getLastStarResult(gameState) {
  const live = gameState?.wave?.lastStarResult;
  if (live && typeof live === 'object' && live.stars != null) return live;
  const rows = getStarsByWaveFromState(gameState);
  if (!rows.length) return null;
  return rows.reduce((best, row) => (!best || row.wave > best.wave ? row : best), null);
}

/**
 * Compact 3-star overlay for a realms-map hex.
 * @param {{ stars?: number, perfect?: boolean }} result
 * @returns {HTMLElement}
 */
export function createMapStarRatingElement(result) {
  const cluster = createStarRatingElement(result, { animate: false, size: 'map' });
  cluster.classList.add('map-progression-stars');
  cluster.setAttribute('aria-hidden', 'true');
  return cluster;
}
